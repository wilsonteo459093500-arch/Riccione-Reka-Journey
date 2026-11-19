// deku_screen.c —— 见 deku_screen.h
//
// 小助理叫 S.T.A.R（2026-11-19 用户改名；程序里的名字还是 deku_*）。
// 样子：原创像素星星（tools/star_art.py → main/star_img.c，跟开机封面同一颗），
// 五个表情图（平常 / 眨眼 / 在听 / 想 / 说话）+ 旁边的小符号（在听 🔊、想 …、没听懂 ?）。
#include "deku_screen.h"

#include "ble_remote.h"
#include "bsp_display.h"
#include "esp_timer.h"
#include "lvgl.h"
#include "pocket_ui.h"
#include "star_img.h"

#define TICK_MS 100
#define STAR_Y 34        // 平常的位置（96×96）
#define STAR_Y_SAY 8     // 说话时往上移，留地方给句子

static deku_state_t *s_state;
static lv_timer_t *s_timer;
static lv_obj_t *s_name, *s_head, *s_mark;
static char s_wrapped[512];   // 断好行的句子
static char s_wrapped_src[128];
static lv_obj_t *s_text, *s_source, *s_hint;
static bool s_app;   // 上次画的时候 app 在不在

static uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

static const char *hint_text(void) {
    if (DEKU_LINE_COUNT == 0) return "";
    switch (s_state->face) {
    case DEKU_FACE_SAY: return "";   // 句子最长 45 字 + 出处，要整块空间
    case DEKU_FACE_LISTEN: return "在听……说完放开";
    case DEKU_FACE_THINK: return "想一下……";
    case DEKU_FACE_CONFUSED: return s_app ? "可以说：笑话、稻盛\n郭鹤年、马斯克" : "上 笑话 · 下 名人的话";
    default: return s_app ? "按住确定说话\n上 笑话 · 下 名人" : "上 笑话 · 下 名人的话";
    }
}

static int glyph_w(uint32_t cp, void *ctx) {
    return lv_font_get_glyph_width((const lv_font_t *)ctx, cp, 0);
}

// 中文断行（标点不放行首）后再给 label；宽度留 4px 余量，免得 LVGL 自己又折一次
static void set_wrapped(lv_obj_t *label, char *buf, size_t cap, const char *text, int32_t width) {
    deku_wrap(text, buf, cap, width - 4, glyph_w, (void *)&space_font_cjk_20);
    lv_label_set_text(label, buf);
}

static void draw_text(void) {
    if (DEKU_LINE_COUNT == 0) {
        lv_label_set_text(s_text, "句库还在审，\n审好就有了");
        lv_label_set_text(s_source, "");
    } else if (s_state->face == DEKU_FACE_SAY && s_state->line >= 0) {
        set_wrapped(s_text, s_wrapped, sizeof s_wrapped, DEKU_LINES[s_state->line].text, 216);
        set_wrapped(s_source, s_wrapped_src, sizeof s_wrapped_src, DEKU_LINES[s_state->line].source, 216);
    } else if (s_state->face == DEKU_FACE_CONFUSED) {
        lv_label_set_text(s_text, "没听清楚，再说一次？");
        lv_label_set_text(s_source, "");
    } else if (s_state->face == DEKU_FACE_IDLE) {
        lv_label_set_text(s_text, "我是 S.T.A.R。\n要听笑话，\n还是名人的话？");
        lv_label_set_text(s_source, "");
    } else {
        lv_label_set_text(s_text, "");
        lv_label_set_text(s_source, "");
    }
    lv_label_set_text(s_hint, hint_text());
    // 说话时：脸往上移、「DEKU」字拿掉、字区放宽，45 字的句子 + 两行出处也放得下
    const bool say = s_state->face == DEKU_FACE_SAY;
    if (say) lv_obj_add_flag(s_name, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_remove_flag(s_name, LV_OBJ_FLAG_HIDDEN);
    lv_obj_align(s_head, LV_ALIGN_TOP_MID, 0, say ? STAR_Y_SAY : STAR_Y);
    lv_obj_align(s_mark, LV_ALIGN_TOP_MID, 72, (say ? STAR_Y_SAY : STAR_Y) + 14);
    lv_obj_set_width(s_text, say ? 216 : 204);
    lv_obj_set_width(s_source, say ? 216 : 204);
    lv_obj_set_style_text_line_space(s_text, say ? 2 : 4, 0);
    lv_obj_align(s_text, LV_ALIGN_TOP_MID, 0, say ? 122 : 156);
    lv_obj_align_to(s_source, s_text, LV_ALIGN_OUT_BOTTOM_RIGHT, 0, 4);
}

// 表情（每 100ms 跑一次：眨眼、说话时嘴巴开合、想的时候点点点）
static void animate(void) {
    const uint32_t t = now_ms() - s_state->since_ms;
    const void *src = &star_face_idle;
    const char *mark = "";
    switch (s_state->face) {
    case DEKU_FACE_LISTEN:
        src = &star_face_listen;
        mark = (t / 400) % 2 ? LV_SYMBOL_VOLUME_MAX : LV_SYMBOL_VOLUME_MID;
        break;
    case DEKU_FACE_THINK:
        src = &star_face_think;
        mark = (t / 300) % 3 == 0 ? "." : (t / 300) % 3 == 1 ? ".." : "...";
        break;
    case DEKU_FACE_SAY:   // 刚开始说的 1.6 秒嘴巴一开一合
        src = t < 1600 && (t / 200) % 2 == 0 ? &star_face_say : &star_face_idle;
        break;
    case DEKU_FACE_CONFUSED:
        src = &star_face_think;
        mark = "?";
        break;
    default:
        src = (t % 3200) < 150 ? &star_face_blink : &star_face_idle;   // 大约 3 秒眨一次
        break;
    }
    if (lv_image_get_src(s_head) != src) lv_image_set_src(s_head, src);
    lv_label_set_text(s_mark, mark);
}

static void tick_cb(lv_timer_t *t) {
    (void)t;
    if (!s_state) return;
    deku_out_t out;
    bool redraw = deku_on_tick(s_state, now_ms(), &out);
    if (out.evt_len) (void)ble_remote_notify_raw(out.evt, out.evt_len);
    const bool app = ble_remote_app_present();
    if (app != s_app) {
        s_app = app;
        redraw = true;
    }
    if (redraw) draw_text();
    animate();
}

void deku_screen_show(deku_state_t *state) {
    s_state = state;
    s_app = ble_remote_app_present();
    lv_obj_t *scr = ui_screen();

    s_name = ui_label(scr, &lv_font_montserrat_20, UI_BRASS, "S.T.A.R");
    lv_obj_set_style_text_letter_space(s_name, 4, 0);
    lv_obj_align(s_name, LV_ALIGN_TOP_MID, 0, 10);

    s_head = lv_image_create(scr);
    lv_image_set_src(s_head, &star_face_idle);
    lv_obj_align(s_head, LV_ALIGN_TOP_MID, 0, STAR_Y);
    s_mark = ui_label(scr, &lv_font_montserrat_32, UI_BRASS, "");
    lv_obj_align(s_mark, LV_ALIGN_TOP_MID, 72, STAR_Y + 14);

    s_text = ui_label(scr, &space_font_cjk_20, UI_TEXT, "");
    lv_obj_set_width(s_text, 204);
    lv_label_set_long_mode(s_text, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(s_text, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_line_space(s_text, 4, 0);
    lv_obj_align(s_text, LV_ALIGN_TOP_MID, 0, 156);
    s_source = ui_label(scr, &space_font_cjk_20, UI_BRASS, "");
    lv_obj_set_width(s_source, 204);
    lv_label_set_long_mode(s_source, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(s_source, LV_TEXT_ALIGN_RIGHT, 0);
    lv_obj_align_to(s_source, s_text, LV_ALIGN_OUT_BOTTOM_RIGHT, 0, 6);
    s_hint = ui_hint(scr, 258, "");
    lv_obj_set_style_text_line_space(s_hint, 2, 0);

    lv_screen_load(scr);
    draw_text();
    animate();
    bsp_display_backlight(100);
    s_timer = lv_timer_create(tick_cb, TICK_MS, NULL);
}

void deku_screen_update(void) {
    if (!s_state) return;
    draw_text();
    animate();
}

void deku_screen_hide(void) {
    if (s_timer) lv_timer_delete(s_timer);
    s_timer = NULL;
    s_state = NULL;
}
