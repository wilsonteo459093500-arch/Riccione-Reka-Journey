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
// 开机封面：整片像素夜空 + 原创像素星星 S.T.A.R（上下飘、眨眼、旁边小闪光），不放公司字标（用户 2026-11-19）
// （tools/make_cover.py、make_star.py 产生）；确定 → 上面的名片画面。
// 有书摘（手机 app 传来的微信读书笔记，2026-11-19 用户选定）时：星星往上移，下面三行轮播书摘 + 书名；
//   短的停 8 秒换下一段，长的先停 2.5 秒、每 1.5 秒往上跳一行到底、再停 2.5 秒才换（一轮里每段一次）。
//
// 所有函数都要在持有 bsp_lvgl_lock() 时呼叫（main.c 负责）。
#include "space_card.h"
#include "star_img.h"

#include <stdio.h>
#include <string.h>

#include "bsp_battery.h"
#include "bsp_display.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "lvgl.h"
#include "deku_model.h"  // deku_wrap：中文断行
#include "news_model.h"
#include "news_store.h"
#include "pocket_ui.h"   // 中文字型

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
static lv_obj_t *s_cover_img;
static lv_obj_t *s_cover_hint;
static lv_obj_t *s_star;       // 封面的 S.T.A.R（192×192）
static lv_obj_t *s_spark;      // 旁边的小闪光
static lv_timer_t *s_star_timer;
extern const lv_image_dsc_t space_cover_img;
static volatile int64_t s_last_input_us;

// ---- 封面书摘轮播 ----
extern const lv_font_t space_font_news_20;
#define Q_Y 208          // 书摘框：星星下面
#define Q_H 78           // 三行（一行 26px）
#define Q_W 212
#define Q_HOLD_SHORT_MS 8000
#define Q_HOLD_MS 2500
#define Q_LINE 26               // 一行高（行距收过）
#define Q_STEP_MS 1500           // 长的：每 1.5 秒往上跳一行（一整行一整行跳，停着时不会切到半行）
static lv_obj_t *s_qview, *s_qbody, *s_qtext, *s_qbook;
static uint32_t s_q_version = UINT32_MAX;
static const char *s_q_doc;
static size_t s_q_len, s_q_n;
static quotes_order_t s_q_order;
static enum { Q_HOLD_TOP, Q_SCROLL, Q_HOLD_END } s_q_phase;
static uint32_t s_q_since;
static int32_t s_q_over;   // 内容比框高多少（要卷多少）
static char s_q_raw[1200];
static char s_q_wrap[1600];
static int32_t s_star_y = 48;

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

#define STAR_X 24
#define STAR_Y 48    // 跟 tools/make_cover.py 的 STAR_Y 一样（预览图对得上）
#define STAR_Y_QUOTES 12   // 有书摘时往上移，下面留三行

static int q_glyph_w(uint32_t cp, void *ctx) {
    (void)ctx;
    return lv_font_get_glyph_width(&space_font_news_20, cp, 0);
}

static uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

// 换下一段书摘（文字 + 「——《书名》」），从头开始
static void quote_next(void) {
    const char *q, *b;
    size_t ql, bl;
    if (!s_q_n || !quotes_get(s_q_doc, s_q_len, quotes_order_next(&s_q_order), &q, &ql, &b, &bl)) return;
    if (ql >= sizeof s_q_raw) ql = sizeof s_q_raw - 1;
    while (ql > 0 && ((unsigned char)q[ql] & 0xC0) == 0x80) ql--;   // 太长截掉时不切在字中间
    memcpy(s_q_raw, q, ql);
    s_q_raw[ql] = 0;
    deku_wrap(s_q_raw, s_q_wrap, sizeof s_q_wrap, Q_W - 4, q_glyph_w, NULL);
    lv_label_set_text(s_qtext, s_q_wrap);
    if (bl) {
        if (bl > 120) bl = 120;
        snprintf(s_q_raw, sizeof s_q_raw, "——《%.*s》", (int)bl, b);
        lv_label_set_text(s_qbook, s_q_raw);
        lv_obj_remove_flag(s_qbook, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_qbook, LV_OBJ_FLAG_HIDDEN);
    }
    lv_obj_update_layout(s_qview);
    const int32_t h = lv_obj_get_height(s_qbody);
    s_q_over = h > Q_H ? h - Q_H : 0;
    lv_obj_set_y(s_qbody, 0);
    s_q_phase = Q_HOLD_TOP;
    s_q_since = now_ms();
}

// 手机传来新的书摘（或第一次）：重新映射、数段数
static void quotes_reload(void) {
    s_q_version = quotes_store_version();
    s_q_n = 0;
    if (quotes_store_map(&s_q_doc, &s_q_len)) s_q_n = quotes_count(s_q_doc, s_q_len);
    quotes_order_init(&s_q_order, s_q_n, (uint32_t)esp_timer_get_time() | 1u);
    s_star_y = s_q_n ? STAR_Y_QUOTES : STAR_Y;
    if (s_star) lv_obj_set_y(s_star, s_star_y);
    if (s_spark) lv_obj_set_y(s_spark, s_star_y + 24);
    if (s_cover_hint) lv_obj_align(s_cover_hint, LV_ALIGN_TOP_MID, 0, s_q_n ? 288 : 262);
    if (s_q_n) quote_next();
}

static void quote_tick(void) {
    if (!s_qview) return;
    if (quotes_store_version() != s_q_version) {
        quotes_reload();
        if (s_state) {
            if (s_state->cover && s_q_n) lv_obj_remove_flag(s_qview, LV_OBJ_FLAG_HIDDEN);
            else lv_obj_add_flag(s_qview, LV_OBJ_FLAG_HIDDEN);
        }
    }
    if (!s_q_n) return;
    const uint32_t t = now_ms() - s_q_since;
    switch (s_q_phase) {
    case Q_HOLD_TOP:
        if (s_q_over == 0) {
            if (t >= Q_HOLD_SHORT_MS) quote_next();
        } else if (t >= Q_HOLD_MS) {
            s_q_phase = Q_SCROLL;
            s_q_since = now_ms();
        }
        break;
    case Q_SCROLL: {
        int32_t y = (int32_t)(1 + t / Q_STEP_MS) * Q_LINE;
        if (y >= s_q_over) {
            y = s_q_over;
            s_q_phase = Q_HOLD_END;
            s_q_since = now_ms();
        }
        lv_obj_set_y(s_qbody, -y);
        break;
    }
    case Q_HOLD_END:
        if (t >= Q_HOLD_MS) quote_next();
        break;
    }
}

// 封面动画：星星上下飘（±4px，2.4 秒一圈）、约 3 秒眨一次眼、闪光一亮一暗
static void star_tick(lv_timer_t *t) {
    (void)t;
    if (!s_state || !s_state->cover || !s_star) return;
    quote_tick();
    const uint32_t ms = (uint32_t)(esp_timer_get_time() / 1000);
    const int32_t dy = lv_trigo_sin((int32_t)((ms % 2400) * 360 / 2400)) * 4 / LV_TRIGO_SIN_MAX;
    lv_obj_set_y(s_star, s_star_y + dy);
    lv_image_set_src(s_star, (ms % 3200) < 150 ? &star_cover_blink : &star_cover_idle);
    if ((ms % 1200) < 700) lv_obj_remove_flag(s_spark, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(s_spark, LV_OBJ_FLAG_HIDDEN);
}

static void apply_layout(void) {
    lv_obj_t *cover_parts[] = { s_cover_img, s_cover_hint, s_star, s_spark };
    for (size_t i = 0; i < sizeof cover_parts / sizeof cover_parts[0]; i++) {
        if (s_state->cover) lv_obj_remove_flag(cover_parts[i], LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(cover_parts[i], LV_OBJ_FLAG_HIDDEN);
    }
    if (s_qview) {
        if (s_state->cover && s_q_n) lv_obj_remove_flag(s_qview, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(s_qview, LV_OBJ_FLAG_HIDDEN);
    }
    if (s_state->cover) {
        lv_obj_t *qr_parts[] = { s_brand, s_battery, s_name, s_caption, s_dots[0], s_dots[1], s_panel };
        for (size_t i = 0; i < sizeof qr_parts / sizeof qr_parts[0]; i++)
            if (qr_parts[i]) lv_obj_add_flag(qr_parts[i], LV_OBJ_FLAG_HIDDEN);
        return;
    }
    lv_obj_remove_flag(s_panel, LV_OBJ_FLAG_HIDDEN);
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
    if (space_card_cover_idle(s_state, (uint32_t)(idle_us / 1000))) apply_layout();   // 闲置 30 秒回封面
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

    // 开机封面（最底层；显示二维码时藏起来）
    s_cover_img = lv_image_create(s_scr);
    lv_image_set_src(s_cover_img, &space_cover_img);
    lv_obj_set_pos(s_cover_img, 0, 0);
    s_star = lv_image_create(s_scr);
    lv_image_set_src(s_star, &star_cover_idle);
    lv_obj_set_pos(s_star, STAR_X, STAR_Y);
    s_spark = lv_image_create(s_scr);
    lv_image_set_src(s_spark, &star_sparkle);
    lv_obj_set_pos(s_spark, 196, STAR_Y + 24);
    s_cover_hint = ui_label(s_scr, &space_font_cjk_20, C_MUTED, "确定 看名片");
    lv_obj_align(s_cover_hint, LV_ALIGN_TOP_MID, 0, 262);

    // 书摘框（没有书摘就藏起来）：内文往上移来卷动，框外的被裁掉
    s_qview = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_qview, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(s_qview, Q_W + 8, Q_H);
    lv_obj_set_style_bg_color(s_qview, lv_color_hex(C_BG), 0);
    lv_obj_set_style_bg_opa(s_qview, LV_OPA_50, 0);
    lv_obj_set_style_border_width(s_qview, 0, 0);
    lv_obj_set_style_radius(s_qview, 6, 0);
    lv_obj_set_style_pad_all(s_qview, 0, 0);
    lv_obj_align(s_qview, LV_ALIGN_TOP_MID, 0, Q_Y);
    s_qbody = lv_obj_create(s_qview);
    lv_obj_remove_flag(s_qbody, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(s_qbody, Q_W, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(s_qbody, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_qbody, 0, 0);
    lv_obj_set_style_pad_all(s_qbody, 0, 0);
    lv_obj_set_style_pad_row(s_qbody, 0, 0);
    lv_obj_set_flex_flow(s_qbody, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(s_qbody, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_END);
    lv_obj_set_x(s_qbody, 4);
    s_qtext = ui_label(s_qbody, &space_font_news_20, C_TEXT, "");
    lv_obj_set_style_text_line_space(s_qtext, -4, 0);
    lv_obj_set_width(s_qtext, Q_W);
    s_qbook = ui_label(s_qbody, &space_font_news_20, C_BRASS, "");
    lv_obj_set_style_text_line_space(s_qbook, -4, 0);
    s_q_version = UINT32_MAX;   // 下一个 tick 载入
    quotes_reload();

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
    s_star_timer = lv_timer_create(star_tick, 50, NULL);
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
    if (s_star_timer) lv_timer_delete(s_star_timer);
    s_star_timer = NULL;
    s_star = s_spark = NULL;
    s_qview = s_qbody = s_qtext = s_qbook = NULL;
    if (s_tick) lv_timer_delete(s_tick);
    s_tick = NULL;
    s_state = NULL;
}
