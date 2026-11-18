// main/main.c —— SPACE 名片 app（FoloToy AI Passport 的衍生 app）
//
// 两个模式（存在 NVS，下次开机停在同一个模式；换模式会重开机，大约 2 秒）：
//
// 名片模式（预设）：显示自己的名片二维码：别人扫 → SPACE 的公开名片页（/c?s=folotoy）→ 留资料 → 自动进 SPACE。
//   上 / 下 短按   切换「名片」/「活动」二维码（menuconfig 有设活动网址才有第二个）
//   确定 短按      亮度 100% → 60% → 30%
//   确定 长按      大二维码模式（只剩二维码）
//   下 长按        → 车用遥控器模式
//   闲置 60 秒自动调暗；调暗时按任何键只会叫醒
//
// 车用遥控器模式：FoloToy 当 Android 的蓝牙媒体遥控器（BLE HID，手机不用装 app），按键见 car_remote_model.h。
//   上 长按        → 名片模式
//
// 不再显示原本的测试菜单（衍生 app 要有自己的画面，见上游 docs/development/ai-guide.md）。
// 并发规则照上游：按键回呼在 esp_timer task，只丢进 queue；input task 拿 LVGL 锁再改画面。
#include "ble_remote.h"
#include "bsp_battery.h"
#include "bsp_button.h"
#include "bsp_display.h"
#include "bsp_i2c.h"
#include "bsp_pins.h"
#include "esp_log.h"
#include "car_remote_model.h"
#include "car_screen.h"
#include "esp_system.h"
#include "esp_sleep.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "key_guard.h"      // 沿用上游：按键唤醒时挡住那一下（非 UI 逻辑，可以重用）
#include "lvgl.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "space_card.h"
#include "space_card_model.h"

static const char *TAG = "space";

typedef struct {
    bsp_btn_t btn;
    bsp_btn_ev_t ev;
} input_t;

static space_card_state_t s_card;
static car_remote_state_t s_car;
static app_mode_t s_mode = APP_MODE_CARD;
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

// ---- 模式存在 NVS（namespace "space"、key "mode"）----
static app_mode_t load_mode(void) {
    nvs_handle_t h;
    int32_t v = 0;
    bool found = false;
    if (nvs_open("space", NVS_READONLY, &h) == ESP_OK) {
        found = nvs_get_i32(h, "mode", &v) == ESP_OK;
        nvs_close(h);
    }
    return app_mode_from_stored(v, found);
}

static void switch_mode(app_mode_t next) {
    nvs_handle_t h;
    if (nvs_open("space", NVS_READWRITE, &h) == ESP_OK) {
        if (nvs_set_i32(h, "mode", (int32_t)next) == ESP_OK) nvs_commit(h);
        nvs_close(h);
    }
    ESP_LOGI(TAG, "换到%s模式，重开机", next == APP_MODE_CAR ? "车用遥控器" : "名片");
    esp_restart();
}

static void card_key(space_card_btn_t btn, space_card_ev_t ev) {
    app_mode_t next;
    // 调暗时第一下只叫醒（space_card_on_key 处理），不会误换模式
    if (!s_card.dimmed && app_mode_switch(APP_MODE_CARD, btn, ev, &next)) switch_mode(next);
    if (!bsp_lvgl_lock(500)) return;
    const int redraw = space_card_on_key(&s_card, btn, ev);
    space_card_on_input(redraw);
    bsp_lvgl_unlock();
}

static void car_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (!bsp_lvgl_lock(500)) return;
    const car_action_t a = car_remote_on_key(&s_car, btn, ev);
    bsp_lvgl_unlock();
    if (a == CAR_ACT_EXIT) switch_mode(APP_MODE_CARD);
    // 送给手机（会 sleep 40ms，所以不持 LVGL 锁）
    const uint16_t usage = car_remote_usage(a);
    const bool sent = usage != 0 && ble_remote_send(usage);
    if (usage != 0) ESP_LOGI(TAG, "%s → %s", car_remote_action_text(a), sent ? "已送出" : "没连上");
    if (!bsp_lvgl_lock(500)) return;
    car_screen_on_action(a, sent);
    bsp_lvgl_unlock();
}

static void input_task(void *arg) {
    (void)arg;
    input_t in;
    for (;;) {
        if (xQueueReceive(s_queue, &in, portMAX_DELAY) != pdTRUE) continue;
        if (in.ev == BSP_BTN_PRESS || in.ev == BSP_BTN_RELEASE) continue;   // 只看单击 / 长按
        if (s_mode == APP_MODE_CAR) car_key(map_btn(in.btn), map_ev(in.ev));
        else card_key(map_btn(in.btn), map_ev(in.ev));
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

    // NVS：存模式和蓝牙配对资料。坏掉（满了 / 版本不合）才清掉重来 —— 里面只有这两样
    esp_err_t nvs = nvs_flash_init();
    if (nvs == ESP_ERR_NVS_NO_FREE_PAGES || nvs == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS 要重建：模式回到名片、手机要重新配对");
        if (nvs_flash_erase() == ESP_OK) nvs = nvs_flash_init();
    }
    if (nvs == ESP_OK) s_mode = load_mode();
    else ESP_LOGE(TAG, "NVS 初始化失败：%s（只能用名片模式）", esp_err_to_name(nvs));

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

    if (s_mode == APP_MODE_CAR) {
        car_remote_init(&s_car);
        if (!ble_remote_start(CONFIG_SPACE_REMOTE_NAME)) ESP_LOGE(TAG, "蓝牙起不来：画面会显示 Bluetooth error");
        if (bsp_lvgl_lock(1000)) {
            car_screen_show(&s_car, CONFIG_SPACE_REMOTE_NAME);
            bsp_lvgl_unlock();
        }
        bsp_display_backlight(car_remote_backlight(&s_car));
    } else {
        if (bsp_lvgl_lock(1000)) {
            space_card_show(&s_card);
            bsp_lvgl_unlock();
        }
        bsp_display_backlight(space_card_backlight(&s_card));
    }

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
