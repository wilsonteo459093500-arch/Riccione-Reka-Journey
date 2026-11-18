// menu_screen.c —— 口袋机菜单（LVGL 9）
//
//   ┌──────────────────────┐
//   │ SPACE                │
//   │ ▌蜡烛与生日歌     >  │  ← 选到的那一行：黄铜色底
//   │  计时器              │
//   │  倒数计时            │
//   │  车用遥控器          │
//   │  返回名片            │
//   │  上下 选择 · 确定 打开│
//   └──────────────────────┘
#include "menu_screen.h"

#include "bsp_display.h"
#include "pocket_ui.h"

#define ROW_H 42
#define ROW_Y 50

static const menu_state_t *s_menu;
static lv_obj_t *s_rows[MENU_VISIBLE];
static lv_obj_t *s_texts[MENU_VISIBLE];
static lv_obj_t *s_arrow;
static lv_obj_t *s_section;
static lv_obj_t *s_more_up;
static lv_obj_t *s_more_down;

// 画面上的 MENU_VISIBLE 行显示第 top..top+4 项；游标那一行黄铜色底
void menu_screen_update(void) {
    for (int r = 0; r < MENU_VISIBLE; r++) {
        const int item = s_menu->top + r;
        const bool on = item == (int)s_menu->cursor;
        lv_label_set_text(s_texts[r], item < MENU_COUNT ? menu_item_text((menu_item_t)item) : "");
        lv_obj_set_style_bg_opa(s_rows[r], on ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
        lv_obj_set_style_text_color(s_texts[r], lv_color_hex(on ? UI_BG : UI_TEXT), 0);
        if (on) {
            lv_obj_set_parent(s_arrow, s_rows[r]);
            lv_obj_align(s_arrow, LV_ALIGN_RIGHT_MID, -10, 0);
        }
    }
    lv_label_set_text(s_section, menu_section(s_menu->cursor));
    // 上面 / 下面还有：显示小箭头
    if (s_menu->top > 0) lv_obj_remove_flag(s_more_up, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(s_more_up, LV_OBJ_FLAG_HIDDEN);
    if (s_menu->top + MENU_VISIBLE < MENU_COUNT) lv_obj_remove_flag(s_more_down, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(s_more_down, LV_OBJ_FLAG_HIDDEN);
}

void menu_screen_show(const menu_state_t *m) {
    s_menu = m;
    lv_obj_t *scr = ui_screen();

    lv_obj_t *brand = ui_label(scr, &lv_font_montserrat_14, UI_BRASS, "SPACE");
    lv_obj_set_style_text_letter_space(brand, 3, 0);
    lv_obj_align(brand, LV_ALIGN_TOP_LEFT, 30, 14);
    s_section = ui_label(scr, &space_font_cjk_20, UI_MUTED, "");
    lv_obj_align(s_section, LV_ALIGN_TOP_RIGHT, -30, 9);

    for (int r = 0; r < MENU_VISIBLE; r++) {
        lv_obj_t *row = lv_obj_create(scr);
        lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(row, 200, ROW_H - 6);
        lv_obj_set_style_radius(row, 10, 0);
        lv_obj_set_style_border_width(row, 0, 0);
        lv_obj_set_style_pad_all(row, 0, 0);
        lv_obj_set_style_bg_color(row, lv_color_hex(UI_BRASS), 0);
        lv_obj_align(row, LV_ALIGN_TOP_MID, 0, ROW_Y + r * ROW_H);
        s_rows[r] = row;
        s_texts[r] = ui_label(row, &space_font_cjk_20, UI_TEXT, "");
        lv_obj_align(s_texts[r], LV_ALIGN_LEFT_MID, 14, 0);
    }
    s_arrow = ui_label(s_rows[0], &lv_font_montserrat_14, UI_BG, LV_SYMBOL_RIGHT);
    s_more_up = ui_label(scr, &lv_font_montserrat_14, UI_MUTED, LV_SYMBOL_UP);
    lv_obj_align(s_more_up, LV_ALIGN_TOP_MID, 0, ROW_Y - 16);
    s_more_down = ui_label(scr, &lv_font_montserrat_14, UI_MUTED, LV_SYMBOL_DOWN);
    lv_obj_align(s_more_down, LV_ALIGN_TOP_MID, 0, ROW_Y + MENU_VISIBLE * ROW_H - 4);

    ui_hint(scr, ROW_Y + MENU_VISIBLE * ROW_H + 12, "上下 选择 · 确定 打开");

    menu_screen_update();
    lv_screen_load(scr);
    bsp_display_backlight(100);
}

void menu_screen_hide(void) {
    s_menu = NULL;   // 画面本身由 main.c 换画面时删掉
}
