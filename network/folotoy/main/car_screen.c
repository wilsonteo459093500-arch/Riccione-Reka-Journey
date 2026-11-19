// car_screen.c —— 「车用遥控器」画面（LVGL 9）
//
//   ┌──────────────────────┐
//   │ SPACE  CAR     87%   │  ← 品牌字、模式、电量
//   │          ⦿           │  ← 蓝牙图示：绿 = 可以用、黄 = 等手机、红 = 出错
//   │      Connected       │  ← 连线状态（大字）
//   │   SPACE Remote       │  ← 手机上看到的名字
//   │          ▶           │  ← 刚按的动作（大图示，1.2 秒后消失）
//   │     Play / Pause     │
//   │ OK      Play / Pause │  ← 按键说明
//   │ Up/Down Prev / Next  │
//   │ Hold OK Voice        │
//   │ Hold Up Card         │
//   └──────────────────────┘
// 开车只要瞄一眼：颜色看连线、图示看刚按了什么。
//
// 所有函数都要在持有 bsp_lvgl_lock() 时呼叫（main.c 负责）。
#include "car_screen.h"

#include <stdio.h>

#include "ble_remote.h"
#include "bsp_battery.h"
#include "bsp_display.h"
#include "esp_timer.h"
#include "lvgl.h"

#define C_BG     0x14110F
#define C_TEXT   0xF4EFE6
#define C_MUTED  0xB8AE9F
#define C_BRASS  0xC8A46B
#define C_OK     0x5FBF77
#define C_WAIT   0xE0B44C
#define C_ERR    0xE0605A
#define C_LINE   0x2A2420

#define ACTION_SHOW_MS 1200

static car_remote_state_t *s_state;
static lv_obj_t *s_battery;
static lv_obj_t *s_bt_icon;
static lv_obj_t *s_link_text;
static lv_obj_t *s_pair_hint;
static lv_obj_t *s_action_icon;
static lv_obj_t *s_action_text;
static lv_timer_t *s_tick;
static car_link_t s_shown_link = (car_link_t)-1;
static int64_t s_last_input_us;
static int64_t s_action_until_us;
static lv_obj_t *s_name;
static const char *s_device_name;
static lv_obj_t *s_sel_title;      // 选择模式：app 传来的两行字
static lv_obj_t *s_sel_item;
#define HINT_ROWS 5
static lv_obj_t *s_hint_key[HINT_ROWS];
static lv_obj_t *s_hint_what[HINT_ROWS];
static int s_shown_view = -1;      // 0 = 没有 app、1 = 有 app、2 = 选择模式

static lv_obj_t *label(lv_obj_t *parent, const lv_font_t *font, uint32_t color) {
    lv_obj_t *l = lv_label_create(parent);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
    return l;
}

static uint32_t link_color(car_link_t link) {
    return link == CAR_LINK_READY ? C_OK : link == CAR_LINK_ERROR ? C_ERR : C_WAIT;
}

static void update_link(void) {
    const car_link_t link = ble_remote_link();
    if (link != s_shown_link) {
        s_shown_link = link;
        lv_obj_set_style_text_color(s_bt_icon, lv_color_hex(link_color(link)), 0);
        lv_label_set_text(s_link_text, car_remote_link_text(link));
    }
    // 第一次用要去手机配对：等手机连的时候提示一下（刚按的动作在显示时先让位）
    if (link == CAR_LINK_ADVERTISING && s_action_until_us == 0) lv_obj_remove_flag(s_pair_hint, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(s_pair_hint, LV_OBJ_FLAG_HIDDEN);
}

// 按键说明跟着情况换：没有 app / 有 app / app 的选择模式
static void update_view(bool force) {
    static const char *const ROWS[3][HINT_ROWS][2] = {
        { {"OK", "Play / Pause"}, {"Up / Dn", "Prev / Next"}, {"Hold OK", "Voice assistant"}, {"Hold Up", "Back to card"}, {"", ""} },
        { {"OK", "Play / Pause"}, {"Up / Dn", "Prev / Next"}, {"Hold OK", "WhatsApp"}, {"Hold Dn", "WeRead"}, {"Hold Up", "Back to card"} },
        { {"Up / Dn", "Choose"}, {"OK", "Select / Call"}, {"Hold OK", "Voice message"}, {"Hold Up", "Cancel"}, {"", ""} },
    };
    const int view = !s_state->app_present ? 0 : s_state->app_select ? 2 : 1;
    if (view == 2) {   // 选择模式的两行字可能每次都变
        lv_label_set_text(s_sel_title, s_state->title);
        lv_label_set_text(s_sel_item, s_state->item);
    }
    if (view == s_shown_view && !force) return;
    s_shown_view = view;
    for (int i = 0; i < HINT_ROWS; i++) {
        lv_label_set_text(s_hint_key[i], ROWS[view][i][0]);
        lv_label_set_text(s_hint_what[i], ROWS[view][i][1]);
    }
    lv_label_set_text_fmt(s_name, view ? "%s  +  App" : "%s", s_device_name);
    if (view == 2) {
        s_action_until_us = 0;   // 刚按的动作跟两行字同一块位置：先清掉
        lv_label_set_text(s_action_icon, "");
        lv_label_set_text(s_action_text, "");
        lv_obj_remove_flag(s_sel_title, LV_OBJ_FLAG_HIDDEN);
        lv_obj_remove_flag(s_sel_item, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_sel_title, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(s_sel_item, LV_OBJ_FLAG_HIDDEN);
    }
}

// app 连线状态 + app 送来的指令（在 LVGL 锁里跑，跟 main.c 的按键处理不会同时改状态）
static void sync_app(void) {
    bool changed = false;
    const bool present = ble_remote_app_present();
    if (present != s_state->app_present) {
        if (present) s_state->app_present = true;
        else car_remote_app_gone(s_state);
        changed = true;
    }
    uint8_t buf[32];
    size_t len;
    while (ble_remote_take_cmd(buf, &len, sizeof buf)) changed |= car_cmd_apply(s_state, buf, len);
    if (changed) update_view(false);
}

static void update_battery(void) {
    char text[8];
    const int soc = bsp_battery_soc();
    space_card_battery_text(soc, text, sizeof text);
    lv_label_set_text(s_battery, text);
    ble_remote_set_battery(soc);
}

static const char *action_symbol(car_action_t a) {
    switch (a) {
    case CAR_ACT_PLAY_PAUSE: return LV_SYMBOL_PLAY;
    case CAR_ACT_NEXT: return LV_SYMBOL_NEXT;
    case CAR_ACT_PREV: return LV_SYMBOL_PREV;
    case CAR_ACT_VOICE: return LV_SYMBOL_AUDIO;
    case CAR_ACT_EXIT: return LV_SYMBOL_HOME;
    case CAR_ACT_APP: return LV_SYMBOL_UPLOAD;
    default: return "";
    }
}

static void tick_cb(lv_timer_t *t) {
    (void)t;
    static uint32_t n;
    const int64_t now = esp_timer_get_time();
    if (s_action_until_us && now >= s_action_until_us) {
        s_action_until_us = 0;
        lv_label_set_text(s_action_icon, "");
        lv_label_set_text(s_action_text, "");
    }
    update_link();
    sync_app();
    if (car_remote_on_idle(s_state, (uint32_t)((now - s_last_input_us) / 1000))) {
        bsp_display_backlight(car_remote_backlight(s_state));
    }
    if (++n % 40 == 0) update_battery();   // 250ms 一次 → 电量 10 秒更新一次
}

static void hint_row(lv_obj_t *parent, int i, int32_t y) {
    s_hint_key[i] = label(parent, &lv_font_montserrat_14, C_BRASS);
    lv_label_set_text(s_hint_key[i], "");
    lv_obj_align(s_hint_key[i], LV_ALIGN_TOP_LEFT, 30, y);
    s_hint_what[i] = label(parent, &lv_font_montserrat_14, C_MUTED);
    lv_label_set_text(s_hint_what[i], "");
    lv_obj_align(s_hint_what[i], LV_ALIGN_TOP_LEFT, 104, y);
}

void car_screen_show(car_remote_state_t *state, const char *device_name) {
    s_state = state;
    s_last_input_us = esp_timer_get_time();

    lv_obj_t *scr = lv_obj_create(NULL);
    lv_obj_remove_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(scr, lv_color_hex(C_BG), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    lv_obj_t *brand = label(scr, &lv_font_montserrat_14, C_BRASS);
    lv_obj_set_style_text_letter_space(brand, 3, 0);
    lv_label_set_text(brand, "SPACE  CAR");
    lv_obj_align(brand, LV_ALIGN_TOP_LEFT, 30, 14);

    s_battery = label(scr, &lv_font_montserrat_14, C_MUTED);
    lv_obj_align(s_battery, LV_ALIGN_TOP_RIGHT, -30, 14);

    s_bt_icon = label(scr, &lv_font_montserrat_48, C_WAIT);
    lv_label_set_text(s_bt_icon, LV_SYMBOL_BLUETOOTH);
    lv_obj_align(s_bt_icon, LV_ALIGN_TOP_MID, 0, 38);

    s_link_text = label(scr, &lv_font_montserrat_20, C_TEXT);
    lv_obj_align(s_link_text, LV_ALIGN_TOP_MID, 0, 94);
    lv_obj_set_style_text_align(s_link_text, LV_TEXT_ALIGN_CENTER, 0);

    s_device_name = device_name;
    s_name = label(scr, &lv_font_montserrat_14, C_MUTED);
    lv_label_set_text(s_name, device_name);
    lv_obj_align(s_name, LV_ALIGN_TOP_MID, 0, 120);

    // 选择模式（app 叫的）：两行字，在「刚按的动作」那块位置
    s_sel_title = label(scr, &lv_font_montserrat_20, C_BRASS);
    lv_obj_set_width(s_sel_title, 200);
    lv_label_set_long_mode(s_sel_title, LV_LABEL_LONG_MODE_DOTS);
    lv_obj_set_style_text_align(s_sel_title, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(s_sel_title, LV_ALIGN_TOP_MID, 0, 150);
    s_sel_item = label(scr, &lv_font_montserrat_20, C_TEXT);
    lv_obj_set_width(s_sel_item, 200);
    lv_label_set_long_mode(s_sel_item, LV_LABEL_LONG_MODE_DOTS);
    lv_obj_set_style_text_align(s_sel_item, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(s_sel_item, LV_ALIGN_TOP_MID, 0, 182);

    // 第一次配对提示（等手机连的时候才显示），跟「刚按的动作」用同一块位置
    s_pair_hint = label(scr, &lv_font_montserrat_14, C_TEXT);
    lv_obj_set_width(s_pair_hint, 200);
    lv_label_set_long_mode(s_pair_hint, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(s_pair_hint, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_pair_hint, "First time: pair this name in\nphone Bluetooth settings");
    lv_obj_align(s_pair_hint, LV_ALIGN_TOP_MID, 0, 156);

    s_action_icon = label(scr, &lv_font_montserrat_48, C_TEXT);
    lv_label_set_text(s_action_icon, "");
    lv_obj_align(s_action_icon, LV_ALIGN_TOP_MID, 0, 146);
    s_action_text = label(scr, &lv_font_montserrat_14, C_TEXT);
    lv_label_set_text(s_action_text, "");
    lv_obj_align(s_action_text, LV_ALIGN_TOP_MID, 0, 200);

    lv_obj_t *line = lv_obj_create(scr);
    lv_obj_remove_flag(line, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(line, 180, 1);
    lv_obj_set_style_bg_color(line, lv_color_hex(C_LINE), 0);
    lv_obj_set_style_border_width(line, 0, 0);
    lv_obj_align(line, LV_ALIGN_TOP_MID, 0, 220);

    for (int i = 0; i < HINT_ROWS; i++) hint_row(scr, i, 226 + i * 18);

    s_shown_view = -1;
    update_view(true);
    update_battery();
    update_link();
    lv_screen_load(scr);
    s_tick = lv_timer_create(tick_cb, 250, NULL);
}

void car_screen_on_action(car_action_t a, bool sent) {
    s_last_input_us = esp_timer_get_time();
    bsp_display_backlight(car_remote_backlight(s_state));
    if (a == CAR_ACT_NONE) return;
    if (a == CAR_ACT_APP && s_state->app_select) return;   // 选择模式：画面由 app 的两行字说话
    const bool needs_phone = car_remote_usage(a) != 0 || a == CAR_ACT_APP;
    const bool failed = needs_phone && !sent;
    lv_label_set_text(s_action_icon, action_symbol(a));
    lv_obj_set_style_text_color(s_action_icon, lv_color_hex(failed ? C_ERR : C_TEXT), 0);
    lv_label_set_text(s_action_text, failed ? "Not connected" : car_remote_action_text(a));
    lv_obj_set_style_text_color(s_action_text, lv_color_hex(failed ? C_ERR : C_TEXT), 0);
    s_action_until_us = esp_timer_get_time() + (int64_t)ACTION_SHOW_MS * 1000;
    update_link();   // 配对提示跟动作同一块位置：先藏起来
}

void car_screen_hide(void) {
    if (s_tick) lv_timer_delete(s_tick);
    s_tick = NULL;
}
