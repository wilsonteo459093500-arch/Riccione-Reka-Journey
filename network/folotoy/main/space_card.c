// space_card.c —— SPACE 名片 app 的画面（LVGL 9）
//
// 240×320 直屏、四角圆角 30px。深色底（跟手机上的公开名片页同一套颜色）：
//   ┌──────────────────────┐
//   │ SPACE          87%   │  ← 左上品牌字、右上电量（读不到就不显示）
//   │      Wilson Teo      │  ← 名字（ASCII；预设字型没有中文）
//   │  ┌────────────────┐  │
//   │  │   QR 176×176   │  │  ← 白底二维码（含白边）
//   │  └────────────────┘  │
//   │   Scan to connect    │  ← 这个二维码是什么（名片 / 活动名）
//   │        ● ○           │  ← 有两个二维码时的页点
//   └──────────────────────┘
// 大二维码模式（确定长按）：只剩 224×224 的二维码，远一点也扫得到。
//
// 所有函数都要在持有 bsp_lvgl_lock() 时呼叫（main.c 负责）。
#include "space_card.h"

#include <stdio.h>
#include <string.h>

#include "bsp_battery.h"
#include "bsp_display.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "lvgl.h"

static const char *TAG = "space_card";

#define C_BG     0x14110F
#define C_TEXT   0xF4EFE6
#define C_MUTED  0xB8AE9F
#define C_BRASS  0xC8A46B
#define C_DOT    0x4A423A

static space_card_state_t *s_state;
static lv_obj_t *s_scr;
static lv_obj_t *s_brand;
static lv_obj_t *s_battery;
static lv_obj_t *s_name;
static lv_obj_t *s_panel;
static lv_obj_t *s_qr;
static lv_obj_t *s_caption;
static lv_obj_t *s_dots[SPACE_CARD_MAX_LINKS];
static lv_timer_t *s_tick;
static volatile int64_t s_last_input_us;

static void style_label(lv_obj_t *l, const lv_font_t *font, uint32_t color) {
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
}

static void update_battery(void) {
    char text[8];
    space_card_battery_text(bsp_battery_soc(), text, sizeof text);
    lv_label_set_text(s_battery, text);
}

static void apply_qr(void) {
    const space_card_link_t *link = &s_state->links[s_state->current];
    const int32_t px = space_card_qr_px(s_state);
    lv_qrcode_set_size(s_qr, px);
    lv_qrcode_set_quiet_zone(s_qr, true);
    if (lv_qrcode_update(s_qr, link->url, (uint32_t)strlen(link->url)) != LV_RESULT_OK) {
        ESP_LOGE(TAG, "二维码画不出来（网址太长？%u 字）", (unsigned)strlen(link->url));
    }
    const int mpx = space_card_module_px(strlen(link->url), px);
    if (mpx < 3) ESP_LOGW(TAG, "每格只有 %d px，扫码可能吃力：网址短一点、或长按确定用大二维码", mpx);
    lv_label_set_text(s_caption, link->label);
    for (size_t i = 0; i < SPACE_CARD_MAX_LINKS; i++) {
        if (!s_dots[i]) continue;
        lv_obj_set_style_bg_color(s_dots[i], lv_color_hex(i == s_state->current ? C_BRASS : C_DOT), 0);
    }
}

static void apply_layout(void) {
    const bool big = s_state->big;
    const int32_t px = space_card_qr_px(s_state);
    lv_obj_t *small_only[] = { s_brand, s_battery, s_name, s_caption, s_dots[0], s_dots[1] };
    for (size_t i = 0; i < sizeof small_only / sizeof small_only[0]; i++) {
        if (!small_only[i]) continue;
        if (big) lv_obj_add_flag(small_only[i], LV_OBJ_FLAG_HIDDEN);
        else lv_obj_remove_flag(small_only[i], LV_OBJ_FLAG_HIDDEN);
    }
    // 一般模式：白色圆角面板包住二维码；大模式：二维码自己就是白底
    lv_obj_set_size(s_panel, px + (big ? 0 : 12), px + (big ? 0 : 12));
    lv_obj_set_style_radius(s_panel, big ? 0 : 14, 0);
    if (big) lv_obj_center(s_panel);
    else lv_obj_align(s_panel, LV_ALIGN_TOP_MID, 0, 74);
}

static void tick_cb(lv_timer_t *t) {
    (void)t;
    static uint32_t n;
    if (!s_state) return;
    const int64_t idle_us = esp_timer_get_time() - s_last_input_us;
    if (space_card_on_idle(s_state, (uint32_t)(idle_us / 1000))) {
        bsp_display_backlight(space_card_backlight(s_state));
    }
    if (++n % 10 == 0) update_battery();   // 电量 10 秒更新一次
}

static void build_setup_hint(void) {
    lv_obj_t *l = lv_label_create(s_scr);
    style_label(l, &lv_font_montserrat_14, C_TEXT);
    lv_label_set_long_mode(l, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_width(l, 190);
    lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(l, "SPACE card\n\nSet SPACE_CARD_URL\n(idf.py menuconfig ->\nSPACE card)\nto an https:// link\nand flash again.");
    lv_obj_center(l);
}

void space_card_show(space_card_state_t *state) {
    s_state = state;
    s_last_input_us = esp_timer_get_time();

    s_scr = lv_obj_create(NULL);
    lv_obj_remove_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(C_BG), 0);
    lv_obj_set_style_bg_opa(s_scr, LV_OPA_COVER, 0);

    if (state->count == 0) {
        build_setup_hint();
        lv_screen_load(s_scr);
        return;
    }

    // 左上品牌字、右上电量（避开 30px 圆角：往内缩）
    s_brand = lv_label_create(s_scr);
    style_label(s_brand, &lv_font_montserrat_14, C_BRASS);
    lv_obj_set_style_text_letter_space(s_brand, 3, 0);
    lv_label_set_text(s_brand, "SPACE");
    lv_obj_align(s_brand, LV_ALIGN_TOP_LEFT, 30, 14);

    s_battery = lv_label_create(s_scr);
    style_label(s_battery, &lv_font_montserrat_14, C_MUTED);
    lv_obj_align(s_battery, LV_ALIGN_TOP_RIGHT, -30, 14);
    update_battery();

    s_name = lv_label_create(s_scr);
    style_label(s_name, &lv_font_montserrat_20, C_TEXT);
    lv_label_set_long_mode(s_name, LV_LABEL_LONG_MODE_DOTS);
    lv_obj_set_width(s_name, 200);
    lv_obj_set_style_text_align(s_name, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_name, CONFIG_SPACE_CARD_NAME);
    lv_obj_align(s_name, LV_ALIGN_TOP_MID, 0, 40);

    s_panel = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(s_panel, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(s_panel, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(s_panel, 0, 0);
    lv_obj_set_style_pad_all(s_panel, 0, 0);

    s_qr = lv_qrcode_create(s_panel);
    lv_qrcode_set_dark_color(s_qr, lv_color_black());
    lv_qrcode_set_light_color(s_qr, lv_color_white());
    lv_obj_center(s_qr);

    s_caption = lv_label_create(s_scr);
    style_label(s_caption, &lv_font_montserrat_14, C_MUTED);
    lv_label_set_long_mode(s_caption, LV_LABEL_LONG_MODE_DOTS);
    lv_obj_set_width(s_caption, 190);
    lv_obj_set_style_text_align(s_caption, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(s_caption, LV_ALIGN_TOP_MID, 0, 270);

    memset(s_dots, 0, sizeof s_dots);
    if (state->count > 1) {
        for (size_t i = 0; i < state->count; i++) {
            s_dots[i] = lv_obj_create(s_scr);
            lv_obj_remove_flag(s_dots[i], LV_OBJ_FLAG_SCROLLABLE);
            lv_obj_set_size(s_dots[i], 7, 7);
            lv_obj_set_style_radius(s_dots[i], LV_RADIUS_CIRCLE, 0);
            lv_obj_set_style_border_width(s_dots[i], 0, 0);
            lv_obj_align(s_dots[i], LV_ALIGN_TOP_MID, (int32_t)i * 14 - 7, 294);
        }
    }

    apply_layout();
    apply_qr();
    lv_obj_center(s_qr);
    lv_screen_load(s_scr);
    s_tick = lv_timer_create(tick_cb, 1000, NULL);
}

void space_card_on_input(int redraw) {
    s_last_input_us = esp_timer_get_time();
    if (!s_state) return;
    if (!s_state || s_state->count == 0) return;
    if (redraw & SPACE_CARD_REDRAW_LAYOUT) apply_layout();
    if (redraw & SPACE_CARD_REDRAW_QR) {
        apply_qr();
        lv_obj_center(s_qr);
    }
    if (redraw & SPACE_CARD_REDRAW_BACKLIGHT) bsp_display_backlight(space_card_backlight(s_state));
}

void space_card_hide(void) {
    if (s_tick) lv_timer_delete(s_tick);
    s_tick = NULL;
    s_state = NULL;
}
