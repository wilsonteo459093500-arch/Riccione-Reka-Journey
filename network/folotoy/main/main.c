// main/main.c —— SPACE 名片 app（FoloToy AI Passport 的衍生 app）
//
// 开机直接显示自己的名片二维码：别人扫 → SPACE 的公开名片页（/c?s=folotoy）→ 留资料 → 自动进 SPACE。
// 不再显示原本的测试菜单（衍生 app 要有自己的画面，见上游 docs/development/ai-guide.md）。
//
// 按键：
//   上 / 下 短按   切换「名片」/「活动」二维码（menuconfig 有设活动网址才有第二个）
//   确定 短按      亮度 100% → 60% → 30%
//   确定 长按      大二维码模式（只剩二维码）
//   闲置 60 秒自动调暗；调暗时按任何键只会叫醒
//
// 并发规则照上游：按键回呼在 esp_timer task，只丢进 queue；input task 拿 LVGL 锁再改画面。
#include "bsp_battery.h"
#include "bsp_button.h"
#include "bsp_display.h"
#include "bsp_i2c.h"
#include "bsp_pins.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "key_guard.h"      // 沿用上游：按键唤醒时挡住那一下（非 UI 逻辑，可以重用）
#include "lvgl.h"
#include "space_card.h"
#include "space_card_model.h"

static const char *TAG = "space";

typedef struct {
    bsp_btn_t btn;
    bsp_btn_ev_t ev;
} input_t;

static space_card_state_t s_card;
static QueueHandle_t s_queue;
static volatile bool s_input_ready;
static key_guard_t s_key_guard;
#define KEY_GUARD_MAX_US (10LL * 1000 * 1000)

static space_card_btn_t map_btn(bsp_btn_t b) {
    return b == BSP_BTN_UP ? SPACE_CARD_BTN_UP : b == BSP_BTN_DOWN ? SPACE_CARD_BTN_DOWN : SPACE_CARD_BTN_OK;
}

static space_card_ev_t map_ev(bsp_btn_ev_t e) {
    return e == BSP_BTN_CLICK ? SPACE_CARD_EV_CLICK : e == BSP_BTN_LONG ? SPACE_CARD_EV_LONG : SPACE_CARD_EV_OTHER;
}

static void input_task(void *arg) {
    (void)arg;
    input_t in;
    for (;;) {
        if (xQueueReceive(s_queue, &in, portMAX_DELAY) != pdTRUE) continue;
        if (in.ev == BSP_BTN_PRESS || in.ev == BSP_BTN_RELEASE) continue;   // 只看单击 / 长按
        if (!bsp_lvgl_lock(500)) continue;
        const int redraw = space_card_on_key(&s_card, map_btn(in.btn), map_ev(in.ev));
        space_card_on_input(redraw);
        bsp_lvgl_unlock();
    }
}

// 按键回呼：在共用的 esp_timer task 上跑，只丢 queue，马上回去
static void on_key(bsp_btn_t btn, bsp_btn_ev_t ev, void *user) {
    (void)user;
    if (key_guard_consume(&s_key_guard, ev == BSP_BTN_RELEASE, esp_timer_get_time())) return;
    if (!s_input_ready || !s_queue) return;
    const input_t in = { .btn = btn, .ev = ev };
    (void)xQueueSend(s_queue, &in, 0);
}

void app_main(void) {
    ESP_LOGI(TAG, "SPACE card 启动");
    const uint32_t wake = esp_sleep_get_wakeup_causes();
    if (wake & (1u << ESP_SLEEP_WAKEUP_GPIO)) key_guard_arm(&s_key_guard, esp_timer_get_time(), KEY_GUARD_MAX_US);

    space_card_init(&s_card, CONFIG_SPACE_CARD_URL, CONFIG_SPACE_CARD_LABEL,
                    CONFIG_SPACE_CARD_EVENT_URL, CONFIG_SPACE_CARD_EVENT_LABEL);
    if (s_card.count == 0) ESP_LOGW(TAG, "SPACE_CARD_URL 没设或不是 https://，屏幕会显示设定说明");
    for (size_t i = 0; i < s_card.count; i++) ESP_LOGI(TAG, "二维码 %u：%s", (unsigned)i + 1, s_card.links[i].url);

    bsp_i2c_init();
    if (bsp_display_init() != ESP_OK || !bsp_lvgl_init()) {
        ESP_LOGE(TAG, "显示 / LVGL 初始化失败（MOSI=%d SCLK=%d CS=%d DC=%d BL=%d）",
                 BSP_LCD_MOSI, BSP_LCD_SCLK, BSP_LCD_CS, BSP_LCD_DC, BSP_LCD_BL);
        return;
    }
    if (bsp_battery_init() != ESP_OK) ESP_LOGW(TAG, "电量计初始化失败：右上角不显示电量");

    if (bsp_lvgl_lock(1000)) {
        space_card_show(&s_card);
        bsp_lvgl_unlock();
    }
    bsp_display_backlight(space_card_backlight(&s_card));

    s_queue = xQueueCreate(8, sizeof(input_t));
    if (!s_queue || xTaskCreate(input_task, "space_input", 4096, NULL, 5, NULL) != pdPASS) {
        ESP_LOGE(TAG, "按键任务建不起来：二维码照样显示，只是不能切换");
        return;
    }
    if (bsp_button_init(on_key, NULL) != ESP_OK) {
        ESP_LOGE(TAG, "按键初始化失败：二维码照样显示，只是不能切换");
        return;
    }
    if (s_key_guard.armed) key_guard_sync_released(&s_key_guard, bsp_button_read_mv() >= BSP_BTN_MV_RELEASED_MIN);
    s_input_ready = true;
}
