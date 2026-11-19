// tools_screen.c —— 木鱼、手电筒、番茄钟（LVGL 9）
//
// 木鱼：深色底、中间一个木鱼（木色椭圆 + 开口），确定敲一下：木鱼缩一下、「功德 +1」往上飘、「咚」
// 手电筒：整个画面一个颜色（白 / 暖 / 红）+ 背光 100%
// 番茄钟：跟倒数一样的圆环，专注红、休息绿；时间到红白闪 + 嘀嘀嘀
//
// 所有函数都要在持有 bsp_lvgl_lock() 时呼叫（main.c 负责）。
#include "tools_screen.h"

#include <stdio.h>

#include "bsp_display.h"
#include "esp_timer.h"
#include "pocket_ui.h"
#include "sound.h"

static lv_timer_t *s_timer;
static lv_obj_t *s_scr;

static uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

static void stop_timer(void) {
    if (s_timer) lv_timer_delete(s_timer);
    s_timer = NULL;
}

// =====================================================================
// 木鱼
// =====================================================================
#define C_WOOD   0xA0672F
#define C_WOOD_D 0x6B3F18
#define C_GOLD   0xF2C46B

static muyu_t *s_muyu;
static lv_obj_t *s_fish;
static lv_obj_t *s_count;
static lv_obj_t *s_auto;
static lv_obj_t *s_merit[3];   // 「功德 +1」三个轮流用（连敲时会叠）
static int s_merit_next;

static void anim_y(void *o, int32_t v) { lv_obj_set_y((lv_obj_t *)o, v); }
static void anim_opa(void *o, int32_t v) { lv_obj_set_style_opa((lv_obj_t *)o, (lv_opa_t)v, 0); }
static void anim_scale(void *o, int32_t v) { lv_obj_set_style_transform_scale((lv_obj_t *)o, v, 0); }

static void muyu_text(void) {
    char t[32];
    snprintf(t, sizeof t, "功德 %lu", (unsigned long)s_muyu->count);
    lv_label_set_text(s_count, t);
    lv_label_set_text(s_auto, s_muyu->auto_on ? "自动敲 · 上下 停" : "确定 敲 · 上下 自动");
}

static void muyu_hit_fx(void) {
    sound_knock();
    // 木鱼缩一下再弹回来
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, s_fish);
    lv_anim_set_exec_cb(&a, anim_scale);
    lv_anim_set_values(&a, 236, 256);   // 256 = 原大小
    lv_anim_set_duration(&a, 160);
    lv_anim_start(&a);
    // 「功德 +1」往上飘、淡掉
    lv_obj_t *m = s_merit[s_merit_next];
    s_merit_next = (s_merit_next + 1) % 3;
    lv_anim_delete(m, NULL);
    lv_anim_init(&a);
    lv_anim_set_var(&a, m);
    lv_anim_set_exec_cb(&a, anim_y);
    lv_anim_set_values(&a, 96, 40);
    lv_anim_set_duration(&a, 700);
    lv_anim_start(&a);
    lv_anim_set_exec_cb(&a, anim_opa);
    lv_anim_set_values(&a, LV_OPA_COVER, LV_OPA_TRANSP);
    lv_anim_start(&a);
    muyu_text();
}

static void muyu_tick_cb(lv_timer_t *t) {
    (void)t;
    if (s_muyu && muyu_tick(s_muyu, now_ms())) muyu_hit_fx();
}

void muyu_screen_show(muyu_t *m) {
    s_muyu = m;
    s_scr = ui_screen();

    s_count = ui_label(s_scr, &space_font_cjk_32, C_GOLD, "");
    lv_obj_align(s_count, LV_ALIGN_TOP_MID, 0, 18);

    // 木鱼：木色大椭圆 + 深色的开口 + 小把手
    s_fish = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_fish, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(s_fish, 170, 130);
    lv_obj_set_style_radius(s_fish, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(s_fish, 0, 0);
    lv_obj_set_style_bg_color(s_fish, lv_color_hex(0xC4874A), 0);
    lv_obj_set_style_bg_grad_color(s_fish, lv_color_hex(C_WOOD_D), 0);
    lv_obj_set_style_bg_grad_dir(s_fish, LV_GRAD_DIR_VER, 0);
    lv_obj_set_style_transform_pivot_x(s_fish, 85, 0);
    lv_obj_set_style_transform_pivot_y(s_fish, 65, 0);
    lv_obj_align(s_fish, LV_ALIGN_TOP_MID, 0, 120);
    lv_obj_t *mouth = lv_obj_create(s_fish);
    lv_obj_remove_flag(mouth, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(mouth, 120, 14);
    lv_obj_set_style_radius(mouth, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(mouth, 0, 0);
    lv_obj_set_style_bg_color(mouth, lv_color_hex(0x2A170A), 0);
    lv_obj_align(mouth, LV_ALIGN_CENTER, 0, 18);
    lv_obj_t *shine = lv_obj_create(s_fish);   // 上面一道亮光：看起来圆圆的
    lv_obj_remove_flag(shine, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(shine, 70, 16);
    lv_obj_set_style_radius(shine, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(shine, 0, 0);
    lv_obj_set_style_bg_color(shine, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(shine, 60, 0);
    lv_obj_align(shine, LV_ALIGN_TOP_MID, -18, 14);

    for (int i = 0; i < 3; i++) {
        s_merit[i] = ui_label(s_scr, &space_font_cjk_20, C_GOLD, "功德 +1");
        lv_obj_align(s_merit[i], LV_ALIGN_TOP_MID, 0, 96);
        lv_obj_set_style_opa(s_merit[i], LV_OPA_TRANSP, 0);
    }
    s_auto = ui_hint(s_scr, 274, "");
    s_merit_next = 0;

    muyu_text();
    lv_screen_load(s_scr);
    bsp_display_backlight(100);
    sound_start();
    s_timer = lv_timer_create(muyu_tick_cb, 50, NULL);
}

void muyu_screen_on_key(int what) {
    if (!s_muyu) return;
    if (what & MUYU_HIT) muyu_hit_fx();
    if (what & MUYU_TOGGLE) muyu_text();
}

void muyu_screen_hide(void) {
    stop_timer();
    for (int i = 0; i < 3; i++) if (s_merit[i]) lv_anim_delete(s_merit[i], NULL);
    if (s_fish) lv_anim_delete(s_fish, NULL);
    s_muyu = NULL;
    s_fish = NULL;
}

// =====================================================================
// 手电筒
// =====================================================================
static uint8_t *s_flash;
static lv_obj_t *s_flash_name;

void flashlight_screen_update(void) {
    if (!s_flash) return;
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(flashlight_color(*s_flash)), 0);
    lv_label_set_text(s_flash_name, flashlight_name(*s_flash));
}

void flashlight_screen_show(uint8_t *color_idx) {
    s_flash = color_idx;
    s_scr = ui_screen();
    s_flash_name = ui_label(s_scr, &space_font_cjk_20, 0x5A4A3C, "");
    lv_obj_align(s_flash_name, LV_ALIGN_BOTTOM_MID, 0, -14);
    lv_obj_set_style_opa(s_flash_name, 150, 0);
    flashlight_screen_update();
    lv_screen_load(s_scr);
    bsp_display_backlight(100);   // 一直全亮、不调暗
}

void flashlight_screen_hide(void) {
    s_flash = NULL;
}

// =====================================================================
// 番茄钟
// =====================================================================
#define C_FOCUS 0xE0605A
#define C_BREAK 0x5FBF77

static pomodoro_t *s_pomo;
static lv_obj_t *s_arc;
static lv_obj_t *s_time;
static lv_obj_t *s_title;
static lv_obj_t *s_state;
static lv_obj_t *s_done;
static bool s_alarm;
static uint32_t s_flash_n;

static void pomo_refresh(void) {
    const uint32_t now = now_ms();
    const uint32_t left = countdown_remaining(&s_pomo->cd, now);
    char t[32];
    format_duration(left, false, t, sizeof t);
    lv_label_set_text(s_time, t);
    const uint32_t total = s_pomo->cd.set_s * 1000u;
    lv_arc_set_value(s_arc, total ? (int32_t)((uint64_t)left * 1000 / total) : 0);
    lv_obj_set_style_arc_color(s_arc, lv_color_hex(s_pomo->focus ? C_FOCUS : C_BREAK), LV_PART_INDICATOR);
    lv_label_set_text(s_title, s_pomo->focus ? "番茄钟 · 专注" : "番茄钟 · 休息");
    snprintf(t, sizeof t, "完成 %u 个番茄", (unsigned)s_pomo->done);
    lv_label_set_text(s_done, t);
    const char *st;
    if (s_pomo->ringing) st = s_pomo->focus ? "专注结束！按任意键 休息" : "休息结束！按任意键 专注";
    else if (s_pomo->cd.phase == CD_RUNNING) st = "确定 暂停";
    else if (s_pomo->cd.phase == CD_PAUSED) st = "已暂停 · 确定 继续\n长按确定 重来";
    else st = "确定 开始";
    lv_label_set_text(s_state, st);
}

static void pomo_set_alarm(bool on) {
    if (on == s_alarm) return;
    s_alarm = on;
    sound_alarm(on);
    if (!on) lv_obj_set_style_bg_color(s_scr, lv_color_hex(UI_BG), 0);
}

static void pomo_tick_cb(lv_timer_t *t) {
    (void)t;
    if (!s_pomo) return;
    if (pomodoro_tick(s_pomo, now_ms())) pomo_set_alarm(true);
    if (s_alarm) {
        s_flash_n++;
        lv_obj_set_style_bg_color(s_scr, lv_color_hex((s_flash_n / 3) % 2 ? UI_ALERT : UI_BG), 0);
    }
    pomo_refresh();
}

void pomodoro_screen_show(pomodoro_t *p) {
    s_pomo = p;
    s_scr = ui_screen();
    s_title = ui_label(s_scr, &space_font_cjk_20, UI_BRASS, "");
    lv_obj_align(s_title, LV_ALIGN_TOP_LEFT, 30, 14);

    s_arc = lv_arc_create(s_scr);
    lv_obj_remove_flag(s_arc, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(s_arc, 190, 190);
    lv_arc_set_rotation(s_arc, 270);
    lv_arc_set_bg_angles(s_arc, 0, 360);
    lv_arc_set_range(s_arc, 0, 1000);
    lv_obj_remove_style(s_arc, NULL, LV_PART_KNOB);
    lv_obj_set_style_arc_width(s_arc, 8, LV_PART_MAIN);
    lv_obj_set_style_arc_width(s_arc, 8, LV_PART_INDICATOR);
    lv_obj_set_style_arc_color(s_arc, lv_color_hex(UI_LINE), LV_PART_MAIN);
    lv_obj_align(s_arc, LV_ALIGN_TOP_MID, 0, 42);

    s_time = ui_label(s_scr, &space_font_digits_64, UI_TEXT, "");
    lv_obj_set_width(s_time, 240);
    lv_obj_set_style_text_align(s_time, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align_to(s_time, s_arc, LV_ALIGN_CENTER, 0, -3);

    s_done = ui_label(s_scr, &space_font_cjk_20, UI_MUTED, "");
    lv_obj_set_width(s_done, 160);   // 固定宽度置中（字还没设，不能靠字的宽度对齐）
    lv_obj_set_style_text_align(s_done, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align_to(s_done, s_arc, LV_ALIGN_CENTER, 0, 46);
    s_state = ui_hint(s_scr, 246, "");

    s_alarm = false;
    s_flash_n = 0;
    pomo_refresh();
    lv_screen_load(s_scr);
    bsp_display_backlight(100);
    sound_start();
    s_timer = lv_timer_create(pomo_tick_cb, 100, NULL);
}

void pomodoro_screen_update(void) {
    if (!s_pomo) return;
    if (!s_pomo->ringing) pomo_set_alarm(false);
    pomo_refresh();
}

void pomodoro_screen_hide(void) {
    pomo_set_alarm(false);
    stop_timer();
    s_pomo = NULL;
}
