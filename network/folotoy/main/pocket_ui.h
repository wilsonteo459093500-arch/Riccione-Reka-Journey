// pocket_ui.h —— 口袋机各画面共用的颜色、字型、小工具（跟名片同一套深色底）
#pragma once

#include "lvgl.h"

#define UI_BG     0x14110F
#define UI_TEXT   0xF4EFE6
#define UI_MUTED  0xB8AE9F
#define UI_BRASS  0xC8A46B
#define UI_LINE   0x2A2420
#define UI_ALERT  0xE0605A

// tools/make_font.py 产生的字型（中文字型的英文 / 数字交给同字号 Montserrat）
extern const lv_font_t space_font_cjk_20;
extern const lv_font_t space_font_cjk_32;
extern const lv_font_t space_font_digits_64;
extern const lv_font_t space_font_digits_140;

static inline lv_obj_t *ui_screen(void) {
    lv_obj_t *scr = lv_obj_create(NULL);
    lv_obj_remove_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(scr, lv_color_hex(UI_BG), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    return scr;
}

static inline lv_obj_t *ui_label(lv_obj_t *parent, const lv_font_t *font, uint32_t color, const char *text) {
    lv_obj_t *l = lv_label_create(parent);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
    lv_label_set_text(l, text);
    return l;
}

// 置中的说明字（自动换行，宽 200：避开四角 30px 圆角）
static inline lv_obj_t *ui_hint(lv_obj_t *parent, int32_t y, const char *text) {
    lv_obj_t *l = ui_label(parent, &space_font_cjk_20, UI_MUTED, text);
    lv_obj_set_width(l, 200);
    lv_label_set_long_mode(l, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(l, LV_ALIGN_TOP_MID, 0, y);
    return l;
}
