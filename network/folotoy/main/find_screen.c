// find_screen.c —— 见 find_screen.h
#include "find_screen.h"

#include "lvgl.h"
#include "pocket_ui.h"

#define C_RED 0xD8342C
#define C_WHITE 0xFFFFFF

static lv_obj_t *s_panel;
static lv_obj_t *s_icon;
static lv_obj_t *s_title;
static lv_obj_t *s_hint;

void find_screen_show(void) {
    if (s_panel) return;
    s_panel = lv_obj_create(lv_layer_top());
    lv_obj_remove_style_all(s_panel);
    lv_obj_set_size(s_panel, LV_PCT(100), LV_PCT(100));
    lv_obj_set_style_bg_opa(s_panel, LV_OPA_COVER, 0);
    lv_obj_remove_flag(s_panel, LV_OBJ_FLAG_SCROLLABLE);

    s_icon = ui_label(s_panel, &lv_font_montserrat_48, C_WHITE, LV_SYMBOL_BELL);
    lv_obj_align(s_icon, LV_ALIGN_CENTER, 0, -70);
    s_title = ui_label(s_panel, &space_font_cjk_32, C_WHITE, "我在这里！");
    lv_obj_align(s_title, LV_ALIGN_CENTER, 0, 0);
    s_hint = ui_label(s_panel, &space_font_cjk_20, C_WHITE, "按任何键停");
    lv_obj_align(s_hint, LV_ALIGN_CENTER, 0, 60);
    find_screen_update(true);
}

void find_screen_update(bool red) {
    if (!s_panel) return;
    const lv_color_t bg = lv_color_hex(red ? C_RED : C_WHITE);
    const lv_color_t fg = lv_color_hex(red ? C_WHITE : C_RED);
    lv_obj_set_style_bg_color(s_panel, bg, 0);
    lv_obj_set_style_text_color(s_icon, fg, 0);
    lv_obj_set_style_text_color(s_title, fg, 0);
    lv_obj_set_style_text_color(s_hint, fg, 0);
}

void find_screen_hide(void) {
    if (!s_panel) return;
    lv_obj_delete(s_panel);
    s_panel = s_icon = s_title = s_hint = NULL;
}
