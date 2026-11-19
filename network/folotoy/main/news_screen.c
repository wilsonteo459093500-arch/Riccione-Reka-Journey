// news_screen.c —— 见 news_screen.h
//
//   目录                      标题列表                    一条
//   ┌──────────────────┐     ┌──────────────────┐       ┌──────────────────┐
//   │ 每日晨报          │     │ 一 今日必读   3/8 │       │ 一 今日必读 · 3/8 │
//   │ 2026-11-18 星期三 │     │ ▌英伟达董事会：无 │       │ 美国收紧对马来西亚│  ← 标题（黄铜色）
//   │▌今日三件事     3 │     │ ▌意让黄仁勋重返… │       │ 、新加坡等国……   │
//   │ 一 今日必读    8 │     │  英伟达第三季营收 │       │ 美国商务部收紧对… │  ← 摘要
//   │ 二 大马热议   10 │     │  翻倍至逾1150亿…  │       │ ……               │
//   │ 上下 选 · 确定 打开│     │  …               │       │ 下 下一条 · 按住念 │
//   └──────────────────┘     └──────────────────┘       └──────────────────┘
//
// 字型：space_font_news_20（GB2312 全部 6,763 个汉字 + 符号，build.sh 编的时候才产生，不放进仓库）；
// 英文、数字交给 Montserrat 20。app 送来的字只会用这套字型有的字（app 的 assets/news_chars.txt）。
#include "news_screen.h"

#include <stdio.h>
#include <string.h>

#include "ble_remote.h"
#include "bsp_display.h"
#include "deku_model.h"
#include "esp_timer.h"
#include "news_model.h"
#include "news_store.h"
#include "pocket_ui.h"

extern const lv_font_t space_font_news_20;
#define FONT (&space_font_news_20)

#define TICK_MS 250
#define X_L 20               // 左右留白（避开圆角）
#define TEXT_W 200
#define DIR_Y 70
#define DIR_H 34
#define LIST_Y 44
#define LIST_H 66
#define VIEW_Y 40
#define VIEW_H 248
#define LINE_GAP (-4)        // 中文字型行高 30px，内文行距收一点（26px 一行）
#define TOAST_MS 2500

static news_doc_t s_doc;
static news_nav_t s_nav;
static bool s_nav_init;
static uint32_t s_loaded = UINT32_MAX;   // 载入的是第几版（news_store_version）
static lv_obj_t *s_scr;
static lv_obj_t *s_footer;
static lv_timer_t *s_timer;
static uint32_t s_toast_until;
static bool s_receiving;
static char s_raw[1200];
static char s_wrap[1600];

static uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

static int glyph_w(uint32_t cp, void *ctx) {
    (void)ctx;
    return lv_font_get_glyph_width(FONT, cp, 0);
}

// 从晨报里复制一段（不是 0 结尾）到 dst；太长就在 UTF-8 字的边界截掉
static const char *copy_field(char *dst, size_t cap, uint32_t at, uint32_t len) {
    if (!s_doc.text || cap == 0) return "";
    if (len >= cap) {
        len = (uint32_t)cap - 1;
        while (len > 0 && ((unsigned char)s_doc.text[at + len] & 0xC0) == 0x80) len--;
    }
    memcpy(dst, s_doc.text + at, len);
    dst[len] = 0;
    return dst;
}

static const char *wrapped(const char *text, int width) {
    deku_wrap(text, s_wrap, sizeof s_wrap, width - 4, glyph_w, NULL);
    return s_wrap;
}

// 只留前两行；还有就在第二行最后换成「…」
static const char *two_lines(const char *text, int width) {
    wrapped(text, width);
    char *nl1 = strchr(s_wrap, '\n');
    char *nl2 = nl1 ? strchr(nl1 + 1, '\n') : NULL;
    if (!nl2) return s_wrap;
    char *end = nl2;
    do end--; while (end > nl1 && ((unsigned char)*end & 0xC0) == 0x80);   // 拿掉最后一个字
    if ((size_t)(end - s_wrap) + 4 > sizeof s_wrap) return s_wrap;
    memcpy(end, "\xE2\x80\xA6", 4);   // …（连 0 结尾）
    return s_wrap;
}

static void load_doc(void) {
    const uint32_t v = news_store_version();
    if (v == s_loaded && s_nav_init) return;   // 同一份：翻到哪里还记得
    s_loaded = v;
    const char *text;
    size_t len;
    uint32_t crc;
    if (!news_store_map(&text, &len, &crc) || !news_parse(text, len, crc, &s_doc)) memset(&s_doc, 0, sizeof s_doc);
    news_nav_reset(&s_nav);   // 新的一份：回到目录
    s_nav_init = true;
}

static lv_obj_t *label(lv_obj_t *parent, uint32_t color, const char *text) {
    return ui_label(parent, FONT, color, text);
}

static lv_obj_t *row_box(int32_t y, int32_t h, bool on) {
    lv_obj_t *row = lv_obj_create(s_scr);
    lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(row, 216, h - 4);
    lv_obj_set_style_radius(row, 8, 0);
    lv_obj_set_style_border_width(row, 0, 0);
    lv_obj_set_style_pad_all(row, 0, 0);
    lv_obj_set_style_bg_color(row, lv_color_hex(UI_BRASS), 0);
    lv_obj_set_style_bg_opa(row, on ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
    lv_obj_align(row, LV_ALIGN_TOP_MID, 0, y);
    return row;
}

static void footer(const char *text) {
    s_footer = ui_hint(s_scr, 288, text);
    lv_obj_set_style_text_font(s_footer, FONT, 0);
}

static void draw_empty(void) {
    lv_obj_t *t = label(s_scr, UI_BRASS, "每日晨报");
    lv_obj_align(t, LV_ALIGN_TOP_MID, 0, 40);
    lv_obj_t *msg = label(s_scr, UI_TEXT, "还没有晨报");
    lv_obj_align(msg, LV_ALIGN_TOP_MID, 0, 96);
    lv_obj_t *how = ui_hint(s_scr, 146, "打开手机车控 app\n填好 Gmail 之后\n靠近就会传过来");
    lv_obj_set_style_text_font(how, FONT, 0);
    lv_obj_set_style_text_line_space(how, 2, 0);
    footer("上 长按 回菜单");
}

static void draw_dir(void) {
    lv_obj_t *t = label(s_scr, UI_BRASS, "每日晨报");
    lv_obj_align(t, LV_ALIGN_TOP_LEFT, X_L + 4, 10);
    lv_obj_t *d = label(s_scr, UI_MUTED, copy_field(s_raw, sizeof s_raw, s_doc.date, s_doc.date_len));
    lv_obj_align(d, LV_ALIGN_TOP_LEFT, X_L + 4, 36);
    for (int r = 0; r < NEWS_DIR_VISIBLE; r++) {
        const int sec = s_nav.sec_top + r;
        if (sec >= s_doc.nsec) break;
        const bool on = sec == s_nav.sec;
        lv_obj_t *row = row_box(DIR_Y + r * DIR_H, DIR_H, on);
        const news_sec_t *s = &s_doc.sec[sec];
        lv_obj_t *name = label(row, on ? UI_BG : UI_TEXT, copy_field(s_raw, sizeof s_raw, s->name, s->name_len));
        lv_label_set_long_mode(name, LV_LABEL_LONG_MODE_CLIP);
        lv_obj_set_width(name, 160);
        lv_obj_align(name, LV_ALIGN_LEFT_MID, 10, 0);
        char n[8];
        snprintf(n, sizeof n, "%u", s->count);
        lv_obj_t *cnt = ui_label(row, &lv_font_montserrat_20, on ? UI_BG : UI_MUTED, n);
        lv_obj_align(cnt, LV_ALIGN_RIGHT_MID, -10, 0);
    }
    if (s_nav.sec_top > 0) lv_obj_align(ui_label(s_scr, &lv_font_montserrat_14, UI_MUTED, LV_SYMBOL_UP), LV_ALIGN_TOP_MID, 0, DIR_Y - 14);
    if (s_nav.sec_top + NEWS_DIR_VISIBLE < s_doc.nsec)
        lv_obj_align(ui_label(s_scr, &lv_font_montserrat_14, UI_MUTED, LV_SYMBOL_DOWN), LV_ALIGN_TOP_MID, 0, DIR_Y + NEWS_DIR_VISIBLE * DIR_H - 4);
    footer("上下 选 · 确定 打开");
}

static void header(const news_sec_t *s, bool detail) {
    char pos[16];
    snprintf(pos, sizeof pos, "%u/%u", s_nav.item + 1, s->count);
    lv_obj_t *name = label(s_scr, detail ? UI_MUTED : UI_BRASS, copy_field(s_raw, sizeof s_raw, s->name, s->name_len));
    lv_label_set_long_mode(name, LV_LABEL_LONG_MODE_CLIP);
    lv_obj_set_width(name, 150);
    lv_obj_align(name, LV_ALIGN_TOP_LEFT, X_L, 8);
    lv_obj_t *p = ui_label(s_scr, &lv_font_montserrat_20, UI_MUTED, pos);
    lv_obj_align(p, LV_ALIGN_TOP_RIGHT, -X_L, 12);
}

static void draw_list(void) {
    const news_sec_t *s = &s_doc.sec[s_nav.sec];
    header(s, false);
    for (int r = 0; r < NEWS_LIST_VISIBLE; r++) {
        const int item = s_nav.item_top + r;
        if (item >= s->count) break;
        const bool on = item == s_nav.item;
        lv_obj_t *row = row_box(LIST_Y + r * LIST_H, LIST_H, on);
        const news_item_t *it = &s_doc.item[s->first + item];
        lv_obj_t *t = label(row, on ? UI_BG : UI_TEXT, two_lines(copy_field(s_raw, sizeof s_raw, it->title, it->title_len), TEXT_W));
        lv_obj_set_style_text_line_space(t, LINE_GAP, 0);
        lv_obj_align(t, LV_ALIGN_LEFT_MID, 8, 0);
    }
    if (s_nav.item_top + NEWS_LIST_VISIBLE < s->count)
        lv_obj_align(ui_label(s_scr, &lv_font_montserrat_14, UI_MUTED, LV_SYMBOL_DOWN), LV_ALIGN_BOTTOM_MID, 0, -2);
}

static void detail_footer(void) {
    const news_sec_t *s = &s_doc.sec[s_nav.sec];
    const bool last = s_nav.sec + 1 >= s_doc.nsec && s_nav.item + 1 >= s->count;
    const char *t;
    if (s_nav.page + 1 < s_nav.pages) t = "下 往下翻";
    else if (last) t = "全部看完了";
    else t = s_nav.item + 1 < s->count ? "下 下一条 · 按住念" : "下 下一栏 · 按住念";
    lv_label_set_text(s_footer, t);
}

static void draw_detail(void) {
    const news_sec_t *s = &s_doc.sec[s_nav.sec];
    const news_item_t *it = &s_doc.item[s->first + s_nav.item];
    header(s, true);

    lv_obj_t *view = lv_obj_create(s_scr);   // 看得到的那一块；内文往上移来翻页，超出的部分被裁掉
    lv_obj_remove_flag(view, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(view, TEXT_W + 8, VIEW_H);
    lv_obj_set_style_bg_opa(view, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(view, 0, 0);
    lv_obj_set_style_pad_all(view, 0, 0);
    lv_obj_set_style_radius(view, 0, 0);
    lv_obj_align(view, LV_ALIGN_TOP_MID, 0, VIEW_Y);

    lv_obj_t *body = lv_obj_create(view);
    lv_obj_remove_flag(body, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_width(body, TEXT_W + 8);
    lv_obj_set_height(body, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(body, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(body, 0, 0);
    lv_obj_set_style_pad_all(body, 0, 0);
    lv_obj_set_style_pad_row(body, 10, 0);
    lv_obj_set_flex_flow(body, LV_FLEX_FLOW_COLUMN);

    lv_obj_t *title = label(body, UI_BRASS, wrapped(copy_field(s_raw, sizeof s_raw, it->title, it->title_len), TEXT_W));
    lv_obj_set_style_text_line_space(title, LINE_GAP, 0);
    if (it->sum_len) {
        lv_obj_t *sum = label(body, UI_TEXT, wrapped(copy_field(s_raw, sizeof s_raw, it->sum, it->sum_len), TEXT_W));
        lv_obj_set_style_text_line_space(sum, LINE_GAP, 0);
    }
    lv_obj_update_layout(s_scr);
    const int32_t h = lv_obj_get_height(body);
    const int32_t step = VIEW_H - 26;   // 翻一页留一行接着看
    s_nav.pages = h <= VIEW_H ? 1 : (uint16_t)(1 + (h - VIEW_H + step - 1) / step);
    if (s_nav.page >= s_nav.pages) s_nav.page = (uint16_t)(s_nav.pages - 1);
    lv_obj_set_y(body, -(int32_t)s_nav.page * step);

    footer("");
    detail_footer();
}

static void draw(void) {
    lv_obj_clean(s_scr);
    s_footer = NULL;
    if (s_doc.nsec == 0) draw_empty();
    else if (s_nav.level == NEWS_DIR) draw_dir();
    else if (s_nav.level == NEWS_LIST) draw_list();
    else draw_detail();
}

static void toast(const char *text) {
    if (!s_footer) return;
    lv_label_set_text(s_footer, text);
    s_toast_until = now_ms() + TOAST_MS;
}

static void tick_cb(lv_timer_t *t) {
    (void)t;
    if (!s_scr) return;
    if (news_store_version() != s_loaded) {   // 手机传来新的一份
        load_doc();
        draw();
    }
    // 正在接收：底下那行提示换成进度；收完（或失败）重画回原来的提示
    const int p = news_store_progress();
    if (p >= 0 && s_footer) {
        lv_label_set_text_fmt(s_footer, "正在接收晨报 %d%%", p);
        lv_obj_set_style_text_color(s_footer, lv_color_hex(UI_BRASS), 0);
        s_receiving = true;
    } else if (p < 0 && s_receiving) {
        s_receiving = false;
        draw();
    }
    if (s_toast_until && (int32_t)(now_ms() - s_toast_until) >= 0) {
        s_toast_until = 0;
        if (s_nav.level == NEWS_DETAIL && s_doc.nsec) detail_footer();
        else draw();
    }
}

void news_screen_show(void) {
    load_doc();
    s_scr = ui_screen();
    draw();
    lv_screen_load(s_scr);
    bsp_display_backlight(100);
    s_timer = lv_timer_create(tick_cb, TICK_MS, NULL);
}

bool news_screen_on_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (!s_scr) return false;
    const news_out_t o = news_on_key(&s_nav, s_doc.nsec ? &s_doc : NULL, btn, ev);
    if (o.action == NEWS_DO_EXIT) return true;
    if (o.action == NEWS_DO_REDRAW) {
        s_toast_until = 0;
        draw();
    }
    if (o.evt_len) toast(ble_remote_notify_raw(o.evt, o.evt_len) ? "手机念这条……" : "手机 app 没连上");
    return false;
}

void news_screen_hide(void) {
    if (s_timer) lv_timer_delete(s_timer);
    s_timer = NULL;
    s_scr = NULL;   // 画面本身由 main.c 换画面时删掉
    s_footer = NULL;
    s_toast_until = 0;
    s_receiving = false;
}
