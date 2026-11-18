// main/main.c —— SPACE 名片 app（FoloToy AI Passport 的衍生 app）
//
// 两个模式（存在 NVS，下次开机停在同一个模式；换模式会重开机，大约 2 秒）：
//
// 名片模式（预设）：显示自己的名片二维码：别人扫 → SPACE 的公开名片页（/c?s=folotoy）→ 留资料 → 自动进 SPACE。
//   上 / 下 短按   切换「名片」/「活动」二维码（menuconfig 有设活动网址才有第二个）
//   确定 短按      亮度 100% → 60% → 30%
//   确定 长按      大二维码模式（只剩二维码）
//   上 长按        → 口袋机菜单（不用重开机）：蜡烛与生日歌 / 木鱼 / 手电筒 / 计时器 / 倒数计时 / 番茄钟 /
//                    叠叠乐 / 记忆三色 / 求签 / 抽奖 / 车用遥控器 / 返回名片
//   下 长按        → 车用遥控器模式
//   闲置 60 秒自动调暗；调暗时按任何键只会叫醒
//
// 车用遥控器模式：FoloToy 当 Android 的蓝牙媒体遥控器（BLE HID，手机不用装 app），按键见 car_remote_model.h。
//   上 长按        → 名片模式
//
// 手机找 FoloToy：每个模式都开蓝牙（名片 / 口袋机低频广播），手机「SPACE 车控」app 按「找」→
//   嘀嘀响 + 红白闪（盖在任何画面上）；按任何键停（这一下不会传给底下的画面），30 秒没人按也停。见 find_model.h。
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
#include "candle_screen.h"
#include "car_remote_model.h"
#include "car_screen.h"
#include "esp_random.h"
#include "esp_system.h"
#include "esp_sleep.h"
#include "esp_timer.h"
#include "find_model.h"
#include "find_screen.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "key_guard.h"      // 沿用上游：按键唤醒时挡住那一下（非 UI 逻辑，可以重用）
#include "lvgl.h"
#include "games_screen.h"
#include "menu_screen.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "sound.h"
#include "space_card.h"
#include "space_card_model.h"
#include "timer_screen.h"
#include "tools_screen.h"

static const char *TAG = "space";

typedef struct {
    bsp_btn_t btn;
    bsp_btn_ev_t ev;
} input_t;

static space_card_state_t s_card;
static car_remote_state_t s_car;
static app_mode_t s_mode = APP_MODE_CARD;

// 名片模式里的画面（换画面不用重开机；车用遥控器要开蓝牙，才走重开机）
typedef enum {
    SCR_CARD, SCR_MENU, SCR_CANDLE, SCR_STOPWATCH, SCR_COUNTDOWN,
    SCR_MUYU, SCR_FLASHLIGHT, SCR_POMODORO, SCR_GAME,
} screen_t;
static screen_t s_screen = SCR_CARD;
static menu_state_t s_menu;
static candle_state_t s_candle;
static stopwatch_t s_stopwatch;    // 状态放这里：离开画面再回来，计时还在
static countdown_t s_countdown;
static muyu_t s_muyu;              // 功德存 NVS（namespace "space"、key "muyu"）
static uint32_t s_muyu_saved;
static uint8_t s_flash_color;
static pomodoro_t s_pomodoro;
static game_kind_t s_game;
static QueueHandle_t s_queue;
static volatile bool s_input_ready;
static key_guard_t s_key_guard;
static find_state_t s_find;        // 手机找 FoloToy（在 LVGL 锁里改）
#define KEY_GUARD_MAX_US (10LL * 1000 * 1000)

static space_card_btn_t map_btn(bsp_btn_t b) {
    return b == BSP_BTN_UP ? SPACE_CARD_BTN_UP : b == BSP_BTN_DOWN ? SPACE_CARD_BTN_DOWN : SPACE_CARD_BTN_OK;
}

static space_card_ev_t map_ev(bsp_btn_ev_t e) {
    switch (e) {
    case BSP_BTN_CLICK: return SPACE_CARD_EV_CLICK;
    case BSP_BTN_LONG: return SPACE_CARD_EV_LONG;
    case BSP_BTN_PRESS: return SPACE_CARD_EV_PRESS;
    case BSP_BTN_RELEASE: return SPACE_CARD_EV_RELEASE;
    default: return SPACE_CARD_EV_OTHER;
    }
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

static void save_muyu(void) {
    if (s_muyu.count == s_muyu_saved) return;
    nvs_handle_t h;
    if (nvs_open("space", NVS_READWRITE, &h) == ESP_OK) {
        if (nvs_set_u32(h, "muyu", s_muyu.count) == ESP_OK) nvs_commit(h);
        nvs_close(h);
        s_muyu_saved = s_muyu.count;
    }
}

static uint32_t load_muyu(void) {
    nvs_handle_t h;
    uint32_t v = 0;
    if (nvs_open("space", NVS_READONLY, &h) == ESP_OK) {
        (void)nvs_get_u32(h, "muyu", &v);
        nvs_close(h);
    }
    return v;
}

static uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

// 换画面（要持 LVGL 锁）：旧画面先停计时器，新画面载入后再删旧的
static void go(screen_t next) {
    lv_obj_t *old = lv_screen_active();
    switch (s_screen) {
    case SCR_CARD: space_card_hide(); break;
    case SCR_MENU: menu_screen_hide(); break;
    case SCR_CANDLE: candle_screen_hide(); break;
    case SCR_STOPWATCH:
    case SCR_COUNTDOWN: timer_screen_hide(); break;
    case SCR_MUYU: muyu_screen_hide(); save_muyu(); break;
    case SCR_FLASHLIGHT: flashlight_screen_hide(); break;
    case SCR_POMODORO: pomodoro_screen_hide(); break;
    case SCR_GAME: games_screen_hide(); break;
    }
    s_screen = next;
    switch (next) {
    case SCR_CARD:
        s_card.dimmed = false;
        space_card_show(&s_card);
        bsp_display_backlight(space_card_backlight(&s_card));
        break;
    case SCR_MENU: menu_screen_show(&s_menu); break;
    case SCR_CANDLE: candle_screen_show(&s_candle); break;
    case SCR_STOPWATCH: timer_screen_show(&s_stopwatch, &s_countdown, false); break;
    case SCR_COUNTDOWN: timer_screen_show(&s_stopwatch, &s_countdown, true); break;
    case SCR_MUYU: muyu_screen_show(&s_muyu); break;
    case SCR_FLASHLIGHT: flashlight_screen_show(&s_flash_color); break;
    case SCR_POMODORO: pomodoro_screen_show(&s_pomodoro); break;
    case SCR_GAME: games_screen_show(s_game, s_card.count ? s_card.links[0].url : "", esp_random()); break;
    }
    if (old && old != lv_screen_active()) lv_obj_delete(old);
}

static void card_key(space_card_btn_t btn, space_card_ev_t ev) {
    app_mode_t next;
    // 调暗时第一下只叫醒（space_card_on_key 处理），不会误换模式 / 开菜单
    if (!s_card.dimmed && app_mode_switch(APP_MODE_CARD, btn, ev, &next)) switch_mode(next);
    if (!bsp_lvgl_lock(500)) return;
    if (!s_card.dimmed && ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) {
        go(SCR_MENU);
    } else {
        const int redraw = space_card_on_key(&s_card, btn, ev);
        space_card_on_input(redraw);
    }
    bsp_lvgl_unlock();
}

static void menu_key(space_card_btn_t btn, space_card_ev_t ev) {
    switch (menu_on_key(&s_menu, btn, ev)) {
    case NAV_REDRAW: menu_screen_update(); break;
    case NAV_TO_CARD: go(SCR_CARD); break;
    case NAV_OPEN:
        switch (s_menu.cursor) {
        case MENU_CANDLE: go(SCR_CANDLE); break;
        case MENU_STOPWATCH: go(SCR_STOPWATCH); break;
        case MENU_COUNTDOWN: go(SCR_COUNTDOWN); break;
        case MENU_MUYU: go(SCR_MUYU); break;
        case MENU_FLASHLIGHT: go(SCR_FLASHLIGHT); break;
        case MENU_POMODORO: go(SCR_POMODORO); break;
        case MENU_STACK: s_game = GAME_STACK; go(SCR_GAME); break;
        case MENU_SIMON: s_game = GAME_SIMON; go(SCR_GAME); break;
        case MENU_FORTUNE: s_game = GAME_FORTUNE; go(SCR_GAME); break;
        case MENU_LOTTERY: s_game = GAME_LOTTERY; go(SCR_GAME); break;
        case MENU_FALL: s_game = GAME_FALL; go(SCR_GAME); break;
        case MENU_BUBBLE: s_game = GAME_BUBBLE; go(SCR_GAME); break;
        case MENU_MASH: s_game = GAME_MASH; go(SCR_GAME); break;
        case MENU_SQUISH: s_game = GAME_SQUISH; go(SCR_GAME); break;
        case MENU_CAR: switch_mode(APP_MODE_CAR); break;   // 要开蓝牙：存模式、重开机
        default: go(SCR_CARD); break;
        }
        break;
    default: break;
    }
}

static void pocket_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (!bsp_lvgl_lock(500)) return;
    if (s_screen == SCR_MENU) {
        menu_key(btn, ev);
    } else if (s_screen == SCR_CANDLE) {
        const candle_do_t d = candle_on_key(&s_candle, btn, ev);
        if (d == CANDLE_DO_EXIT) go(SCR_MENU);
        else candle_screen_on_do(d);
    } else if (s_screen == SCR_MUYU) {
        const int what = muyu_on_key(&s_muyu, btn, ev, now_ms());
        if (what & MUYU_EXIT) go(SCR_MENU);
        else {
            muyu_screen_on_key(what);
            if (s_muyu.count % 10 == 0) save_muyu();   // 每 10 下存一次（关机前的几下最多少 9 下）
        }
    } else if (s_screen == SCR_FLASHLIGHT) {
        const nav_t nav = flashlight_on_key(&s_flash_color, btn, ev);
        if (nav == NAV_TO_MENU) go(SCR_MENU);
        else if (nav == NAV_REDRAW) flashlight_screen_update();
    } else if (s_screen == SCR_POMODORO) {
        if (pomodoro_on_key(&s_pomodoro, btn, ev, now_ms()) == NAV_TO_MENU) go(SCR_MENU);
        else pomodoro_screen_update();
    } else if (s_screen == SCR_GAME) {
        if (games_screen_on_key(btn, ev)) go(SCR_MENU);
    } else {
        const nav_t nav = s_screen == SCR_STOPWATCH ? stopwatch_on_key(&s_stopwatch, btn, ev, now_ms())
                                                    : countdown_on_key(&s_countdown, btn, ev, now_ms());
        if (nav == NAV_TO_MENU) go(SCR_MENU);
        else timer_screen_update();
    }
    bsp_lvgl_unlock();
}

static void car_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (!bsp_lvgl_lock(500)) return;
    const car_action_t a = car_remote_on_key(&s_car, btn, ev);
    bsp_lvgl_unlock();
    if (a == CAR_ACT_EXIT) switch_mode(APP_MODE_CARD);
    bool sent = false;
    if (a == CAR_ACT_APP) {
        // 交给 SPACE 车控 app（按下 / 放开也送：按住录语音讯息）
        uint8_t evt[2];
        sent = car_evt_encode(btn, ev, evt) && ble_remote_notify_key(evt);
    } else {
        // 媒体键（会 sleep 40ms，所以不持 LVGL 锁）
        const uint16_t usage = car_remote_usage(a);
        sent = usage != 0 && ble_remote_send(usage);
        if (usage != 0) ESP_LOGI(TAG, "%s → %s", car_remote_action_text(a), sent ? "已送出" : "没连上");
    }
    if (ev != SPACE_CARD_EV_CLICK && ev != SPACE_CARD_EV_LONG) return;   // 按下 / 放开不用更新画面
    if (!bsp_lvgl_lock(500)) return;
    car_screen_on_action(a, sent);
    bsp_lvgl_unlock();
}

// ---- 手机找 FoloToy（都在 LVGL 锁里）----
// 停了之后把背光还给底下的画面
static void restore_backlight(void) {
    if (s_mode == APP_MODE_CAR) {
        s_car.dimmed = false;
        bsp_display_backlight(car_remote_backlight(&s_car));
    } else if (s_screen == SCR_CARD) {
        s_card.dimmed = false;
        space_card_on_input(0);   // 重新算闲置时间
        bsp_display_backlight(space_card_backlight(&s_card));
    } else {
        bsp_display_backlight(100);   // 口袋机的画面都是全亮（计时器要调暗会自己再调）
    }
}

static void find_finish(find_stop_t why) {
    find_screen_hide();
    sound_alarm(false);
    restore_backlight();
    (void)ble_remote_notify_find(false, why);
    ESP_LOGI(TAG, "找 FoloToy：停了（%s）", why == FIND_STOP_KEY ? "有人按键" : why == FIND_STOP_TIMEOUT ? "30 秒到了" : "手机叫停");
}

static void find_tick(lv_timer_t *t) {
    (void)t;
    const uint32_t now = now_ms();
    if (s_mode != APP_MODE_CAR) {   // 车用模式由车用画面取指令；其他模式没有用，清掉免得塞满
        uint8_t buf[32];
        size_t len;
        while (ble_remote_take_cmd(buf, &len, sizeof buf)) {}
    }
    const int req = ble_remote_take_find();
    if (req == 1) {
        if (find_start(&s_find, now)) {
            ESP_LOGI(TAG, "找 FoloToy：手机在找，开始响");
            sound_start();
            sound_alarm(true);
            find_screen_show();
        }
        (void)ble_remote_notify_find(true, FIND_STOP_NONE);
    } else if (req == 0 && find_stop(&s_find)) {
        find_finish(FIND_STOP_APP);
    }
    const find_stop_t why = find_on_tick(&s_find, now);
    if (why != FIND_STOP_NONE) find_finish(why);
    if (s_find.active) {
        find_screen_update(find_flash_red(&s_find, now));
        bsp_display_backlight(100);   // 底下的画面可能刚好调暗：一直压回全亮
    }
}

// 按键先给「找」：正在响就停，回 true = 这一下吃掉
static bool find_key(bsp_btn_ev_t ev) {
    if (!bsp_lvgl_lock(500)) return false;
    find_stop_t why;
    const bool eaten = find_on_key(&s_find, map_ev(ev), now_ms(), &why);
    if (why != FIND_STOP_NONE) find_finish(why);
    bsp_lvgl_unlock();
    return eaten;
}

static void input_task(void *arg) {
    (void)arg;
    input_t in;
    for (;;) {
        if (xQueueReceive(s_queue, &in, portMAX_DELAY) != pdTRUE) continue;
        if (find_key(in.ev)) continue;
        if (s_mode == APP_MODE_CAR) {   // 车用：按下 / 放开也要（转给 app）
            car_key(map_btn(in.btn), map_ev(in.ev));
            continue;
        }
        // 游戏画面也要按下 / 放开（落落方块按住加速、狂按挑战连按）；其他画面只看单击 / 长按
        if ((in.ev == BSP_BTN_PRESS || in.ev == BSP_BTN_RELEASE) && s_screen != SCR_GAME) continue;
        else if (s_screen == SCR_CARD) card_key(map_btn(in.btn), map_ev(in.ev));
        else pocket_key(map_btn(in.btn), map_ev(in.ev));
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

    menu_init(&s_menu);
    candle_init(&s_candle);
    stopwatch_init(&s_stopwatch);
    countdown_init(&s_countdown);
    pomodoro_init(&s_pomodoro);
    s_muyu_saved = nvs == ESP_OK ? load_muyu() : 0;
    muyu_init(&s_muyu, s_muyu_saved);
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

    find_init(&s_find);
    // 每个模式都开蓝牙（找 FoloToy 用）；车用模式快速广播，名片 / 口袋机低频、只认配对过的手机
    const bool ble_ok = ble_remote_start(CONFIG_SPACE_REMOTE_NAME, s_mode == APP_MODE_CAR);
    if (s_mode == APP_MODE_CAR) {
        car_remote_init(&s_car);
        if (!ble_ok) ESP_LOGE(TAG, "蓝牙起不来：画面会显示 Bluetooth error");
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
        if (!ble_ok) ESP_LOGW(TAG, "蓝牙起不来：手机找不到 FoloToy（名片照样能用）");
    }
    if (bsp_lvgl_lock(1000)) {
        lv_timer_create(find_tick, 100, NULL);   // 一直在：任何画面都会处理手机的「找」
        bsp_lvgl_unlock();
    }

    s_queue = xQueueCreate(16, sizeof(input_t));   // 狂按挑战连按：按下 + 放开 + 单击，留多一点
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
