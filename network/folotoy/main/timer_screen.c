// timer_screen.c —— 计时器（正数）/ 倒数计时（LVGL 9）
//
//   ┌──────────────────────┐
//   │ 倒数计时              │
//   │      ╭──────╮        │  ← 倒数：剩下的比例（圆环）；计时器：没有圆环
//   │      │ 05:00 │        │  ← 大数字
//   │      ╰──────╯        │
//   │ 上下 调分钟 · 确定 开始│  ← 现在可以按什么
//   │      上长按 返回       │
//   └──────────────────────┘
// 倒数时间到：整个画面红白闪 + 嘀嘀嘀，按任何键停。
//
// 所有函数都要在持有 bsp_lvgl_lock() 时呼叫（main.c 负责）。
#include "timer_screen.h"

#include "bsp_display.h"
#include "esp_timer.h"
#include "pocket_ui.h"
#include "sound.h"

#define C_RING_BG 0x2A2420
#define TICK_MS 100
#define DIM_AFTER_MS 60000u
#define DIM_PERCENT 30

static stopwatch_t *s_sw;
static countdown_t *s_cd;
static bool s_is_cd;
static lv_obj_t *s_scr;
static lv_obj_t *s_time;
static lv_obj_t *s_state;
static lv_obj_t *s_arc;
static lv_timer_t *s_timer;
static uint32_t s_last_input_ms;
static bool s_dimmed;
static bool s_alarm;
static uint32_t s_flash;

static uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

static const char *state_text(void) {
    if (!s_is_cd) {
        if (s_sw->running) return "计时中 · 确定 暂停";
        return s_sw->base_ms ? "已暂停 · 确定 继续\n下 归零" : "确定 开始";
    }
    switch (s_cd->phase) {
    case CD_SET: return "上下 调分钟\n确定 开始";
    case CD_RUNNING: return "倒数中 · 确定 暂停";
    case CD_PAUSED: return "已暂停 · 确定 继续\n长按确定 归零";
    case CD_DONE: return "时间到！按任意键";
    default: return "";
    }
}

static void set_alarm(bool on) {
    if (on == s_alarm) return;
    s_alarm = on;
    if (on) sound_start();
    sound_alarm(on);
    if (!on) lv_obj_set_style_bg_color(s_scr, lv_color_hex(UI_BG), 0);
}

static void refresh(void) {
    const uint32_t now = now_ms();
    char text[16];
    if (s_is_cd) {
        const uint32_t left = countdown_remaining(s_cd, now);
        format_duration(left, false, text, sizeof text);
        const uint32_t total = s_cd->set_s * 1000u;
        lv_arc_set_value(s_arc, total ? (int32_t)((uint64_t)left * 1000 / total) : 0);
    } else {
        format_duration(stopwatch_elapsed(s_sw, now), true, text, sizeof text);
    }
    lv_label_set_text(s_time, text);
    lv_label_set_text(s_state, state_text());
}

static void tick_cb(lv_timer_t *t) {
    (void)t;
    const uint32_t now = now_ms();
    if (s_is_cd && countdown_tick(s_cd, now)) {
        set_alarm(true);
        s_last_input_ms = now;   // 时间到：亮起来
    }
    if (s_alarm) {   // 红白闪
        s_flash++;
        lv_obj_set_style_bg_color(s_scr, lv_color_hex((s_flash / 3) % 2 ? UI_ALERT : UI_BG), 0);
    }
    // 闲置调暗（时间到时不暗）
    const bool want_dim = !s_alarm && now - s_last_input_ms >= DIM_AFTER_MS;
    if (want_dim != s_dimmed) {
        s_dimmed = want_dim;
        bsp_display_backlight(want_dim ? DIM_PERCENT : 100);
    }
    refresh();
}

void timer_screen_show(stopwatch_t *sw, countdown_t *cd, bool countdown_mode) {
    s_sw = sw;
    s_cd = cd;
    s_is_cd = countdown_mode;
    s_scr = ui_screen();

    lv_obj_t *title = ui_label(s_scr, &space_font_cjk_20, UI_BRASS, countdown_mode ? "倒数计时" : "计时器");
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 30, 14);

    s_arc = lv_arc_create(s_scr);
    lv_obj_remove_flag(s_arc, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(s_arc, 190, 190);
    lv_arc_set_rotation(s_arc, 270);
    lv_arc_set_bg_angles(s_arc, 0, 360);
    lv_arc_set_range(s_arc, 0, 1000);
    lv_obj_remove_style(s_arc, NULL, LV_PART_KNOB);
    lv_obj_set_style_arc_width(s_arc, 8, LV_PART_MAIN);
    lv_obj_set_style_arc_width(s_arc, 8, LV_PART_INDICATOR);
    lv_obj_set_style_arc_color(s_arc, lv_color_hex(C_RING_BG), LV_PART_MAIN);
    lv_obj_set_style_arc_color(s_arc, lv_color_hex(UI_BRASS), LV_PART_INDICATOR);
    lv_obj_align(s_arc, LV_ALIGN_TOP_MID, 0, 42);
    if (!countdown_mode) lv_obj_add_flag(s_arc, LV_OBJ_FLAG_HIDDEN);

    s_time = ui_label(s_scr, &space_font_digits_64, UI_TEXT, "");
    lv_obj_set_width(s_time, 240);   // 固定宽度、置中：数字变来变去也不会左右跳（"01:23.4" 约 225px）
    lv_obj_set_style_text_align(s_time, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align_to(s_time, s_arc, LV_ALIGN_CENTER, 0, -3);   // 字形中心比标签中心低 3px

    s_state = ui_hint(s_scr, 246, "");

    s_last_input_ms = now_ms();
    s_dimmed = false;
    s_alarm = false;
    s_flash = 0;
    refresh();
    lv_screen_load(s_scr);
    bsp_display_backlight(100);
    s_timer = lv_timer_create(tick_cb, TICK_MS, NULL);
}

void timer_screen_update(void) {
    if (!s_scr) return;
    s_last_input_ms = now_ms();
    if (s_dimmed) {
        s_dimmed = false;
        bsp_display_backlight(100);
    }
    if (s_is_cd && s_cd->phase != CD_DONE) set_alarm(false);
    refresh();
}

void timer_screen_hide(void) {
    set_alarm(false);
    if (s_timer) lv_timer_delete(s_timer);
    s_timer = NULL;
    s_scr = NULL;
}
