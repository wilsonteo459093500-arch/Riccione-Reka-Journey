// news_store.c —— 见 news_store.h
#include "news_store.h"

#include <string.h>

#include "ble_remote.h"
#include "esp_log.h"
#include "esp_partition.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "news_model.h"

static const char *TAG = "news";

typedef struct {
    uint16_t len;
    uint8_t data[NEWS_PKT_MAX];
} pkt_t;

static const esp_partition_t *s_part;
static QueueHandle_t s_queue;
static SemaphoreHandle_t s_lock;   // 保护 s_rx（task 写、画面读）
static news_rx_t s_rx;
static volatile uint32_t s_version;
static esp_partition_mmap_handle_t s_map;
static bool s_mapped;

static bool f_erase(void *ctx, uint32_t off, uint32_t len) {
    (void)ctx;
    return esp_partition_erase_range(s_part, off, len) == ESP_OK;
}
static bool f_write(void *ctx, uint32_t off, const void *data, uint32_t len) {
    (void)ctx;
    return esp_partition_write(s_part, off, data, len) == ESP_OK;
}
static bool f_read(void *ctx, uint32_t off, void *data, uint32_t len) {
    (void)ctx;
    return esp_partition_read(s_part, off, data, len) == ESP_OK;
}
static const news_flash_t FL = { f_erase, f_write, f_read, NULL };

static void reply(int st) {
    uint8_t pkt[6];
    xSemaphoreTake(s_lock, portMAX_DELAY);
    news_status_packet(&s_rx, st, pkt);
    xSemaphoreGive(s_lock);
    (void)ble_remote_notify_raw(pkt, sizeof pkt);
}

static void store_task(void *arg) {
    (void)arg;
    pkt_t p;
    bool fast = false;
    for (;;) {
        const bool got = xQueueReceive(s_queue, &p, pdMS_TO_TICKS(10000)) == pdTRUE;
        if (!got) {   // 10 秒没下一段：这次算了（旧的那份还在），连线放慢回平常
            xSemaphoreTake(s_lock, portMAX_DELAY);
            if (s_rx.active) ESP_LOGW(TAG, "晨报传到一半停了（收到 %u / %u）", (unsigned)s_rx.got, (unsigned)s_rx.len);
            s_rx.active = false;
            xSemaphoreGive(s_lock);
            if (fast) ble_remote_set_fast(false);
            fast = false;
            continue;
        }
        if (p.len >= 2 && p.data[0] == NEWS_CMD_DATA && p.data[1] == NEWS_DATA_BEGIN && !fast) {
            ble_remote_set_fast(true);
            fast = true;
        }
        bool committed = false;
        xSemaphoreTake(s_lock, portMAX_DELAY);
        const int st = news_rx_on_cmd(&s_rx, &FL, p.data, p.len, &committed);
        const bool active = s_rx.active;
        xSemaphoreGive(s_lock);
        if (committed) {
            s_version++;
            ESP_LOGI(TAG, "新的晨报存好了：%u 字节、crc %08x", (unsigned)s_rx.cur_len, (unsigned)s_rx.cur_crc);
        } else if (st > 0) {
            ESP_LOGW(TAG, "晨报没收好：状态 %d", st);
        }
        if (st >= 0) reply(st);
        if (fast && !active) {
            ble_remote_set_fast(false);
            fast = false;
        }
    }
}

void news_store_start(void) {
    s_part = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "brief");
    if (!s_part || s_part->size < NEWS_PART_SIZE) {
        ESP_LOGE(TAG, "找不到 brief 分区（要烧 SPACE-card-full.bin 整份）：不能收晨报");
        s_part = NULL;
        return;
    }
    s_lock = xSemaphoreCreateMutex();
    s_queue = xQueueCreate(12, sizeof(pkt_t));
    if (!s_lock || !s_queue) {
        ESP_LOGE(TAG, "记忆体不够：不能收晨报");
        s_part = NULL;
        return;
    }
    news_rx_init(&s_rx, &FL);
    if (s_rx.cur >= 0) ESP_LOGI(TAG, "晨报：%u 字节（第 %u 份）", (unsigned)s_rx.cur_len, (unsigned)s_rx.cur_seq);
    else ESP_LOGI(TAG, "还没有晨报");
    if (xTaskCreate(store_task, "news_store", 4096, NULL, 4, NULL) != pdPASS) {
        ESP_LOGE(TAG, "建不起 task：不能收晨报");
        s_part = NULL;
    }
}

bool news_store_push(const uint8_t *data, size_t len) {
    if (!s_part || !s_queue || len == 0 || len > NEWS_PKT_MAX) return false;
    pkt_t p = { .len = (uint16_t)len };
    memcpy(p.data, data, len);
    return xQueueSend(s_queue, &p, pdMS_TO_TICKS(300)) == pdTRUE;
}

uint32_t news_store_version(void) {
    return s_version;
}

bool news_store_map(const char **text, size_t *len, uint32_t *crc) {
    if (!s_part) return false;
    uint32_t off, n, c;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    const bool have = news_rx_current(&s_rx, &off, &n);
    c = s_rx.cur_crc;
    xSemaphoreGive(s_lock);
    if (!have) return false;
    if (s_mapped) {
        esp_partition_munmap(s_map);
        s_mapped = false;
    }
    const void *ptr = NULL;
    if (esp_partition_mmap(s_part, off, n, ESP_PARTITION_MMAP_DATA, &ptr, &s_map) != ESP_OK) {
        ESP_LOGE(TAG, "晨报映射失败");
        return false;
    }
    s_mapped = true;
    *text = (const char *)ptr;
    *len = n;
    *crc = c;
    return true;
}

int news_store_progress(void) {
    if (!s_part) return -1;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    const int p = news_rx_progress(&s_rx);
    xSemaphoreGive(s_lock);
    return p;
}
