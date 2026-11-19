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
static news_rx_t s_rx[2];               // [NEWS_KIND_BRIEF]、[NEWS_KIND_QUOTES]
static volatile uint32_t s_version[2];
static esp_partition_mmap_handle_t s_map[2];
static bool s_mapped[2];

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

static void reply(int kind, int st) {
    uint8_t pkt[6];
    xSemaphoreTake(s_lock, portMAX_DELAY);
    news_status_packet(&s_rx[kind], st, pkt);
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
            for (int k = 0; k < 2; k++) {
                if (s_rx[k].active) ESP_LOGW(TAG, "%s传到一半停了（收到 %u / %u）", k ? "书摘" : "晨报", (unsigned)s_rx[k].got, (unsigned)s_rx[k].len);
                s_rx[k].active = false;
            }
            xSemaphoreGive(s_lock);
            if (fast) ble_remote_set_fast(false);
            fast = false;
            continue;
        }
        const int kind = (p.data[0] == QUOTES_CMD_DATA || p.data[0] == QUOTES_CMD_ASK) ? NEWS_KIND_QUOTES : NEWS_KIND_BRIEF;
        if (p.len >= 2 && p.data[0] == s_rx[kind].cmd_data && p.data[1] == NEWS_DATA_BEGIN && !fast) {
            ble_remote_set_fast(true);
            fast = true;
        }
        bool committed = false;
        xSemaphoreTake(s_lock, portMAX_DELAY);
        const int st = news_rx_on_cmd(&s_rx[kind], &FL, p.data, p.len, &committed);
        const bool active = s_rx[0].active || s_rx[1].active;
        xSemaphoreGive(s_lock);
        if (committed) {
            s_version[kind]++;
            ESP_LOGI(TAG, "新的%s存好了：%u 字节、crc %08x", kind ? "书摘" : "晨报", (unsigned)s_rx[kind].cur_len, (unsigned)s_rx[kind].cur_crc);
        } else if (st > 0) {
            ESP_LOGW(TAG, "%s没收好：状态 %d", kind ? "书摘" : "晨报", st);
        }
        if (st >= 0) reply(kind, st);
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
    news_rx_init(&s_rx[NEWS_KIND_BRIEF], &FL, NEWS_KIND_BRIEF);
    news_rx_init(&s_rx[NEWS_KIND_QUOTES], &FL, NEWS_KIND_QUOTES);
    for (int k = 0; k < 2; k++) {
        if (s_rx[k].cur >= 0) ESP_LOGI(TAG, "%s：%u 字节（第 %u 份）", k ? "书摘" : "晨报", (unsigned)s_rx[k].cur_len, (unsigned)s_rx[k].cur_seq);
        else ESP_LOGI(TAG, "还没有%s", k ? "书摘" : "晨报");
    }
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
    return s_version[NEWS_KIND_BRIEF];
}

uint32_t quotes_store_version(void) {
    return s_version[NEWS_KIND_QUOTES];
}

static bool map_kind(int kind, const char **text, size_t *len, uint32_t *crc) {
    if (!s_part) return false;
    uint32_t off, n, c;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    const bool have = news_rx_current(&s_rx[kind], &off, &n);
    c = s_rx[kind].cur_crc;
    xSemaphoreGive(s_lock);
    if (!have) return false;
    if (s_mapped[kind]) {
        esp_partition_munmap(s_map[kind]);
        s_mapped[kind] = false;
    }
    const void *ptr = NULL;
    if (esp_partition_mmap(s_part, off, n, ESP_PARTITION_MMAP_DATA, &ptr, &s_map[kind]) != ESP_OK) {
        ESP_LOGE(TAG, "%s映射失败", kind ? "书摘" : "晨报");
        return false;
    }
    s_mapped[kind] = true;
    *text = (const char *)ptr;
    *len = n;
    *crc = c;
    return true;
}

bool news_store_map(const char **text, size_t *len, uint32_t *crc) {
    return map_kind(NEWS_KIND_BRIEF, text, len, crc);
}

bool quotes_store_map(const char **text, size_t *len) {
    uint32_t crc;
    return map_kind(NEWS_KIND_QUOTES, text, len, &crc);
}

int news_store_progress(void) {
    if (!s_part) return -1;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    const int p = news_rx_progress(&s_rx[NEWS_KIND_BRIEF]);
    xSemaphoreGive(s_lock);
    return p;
}
