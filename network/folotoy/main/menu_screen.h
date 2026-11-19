// menu_screen.h —— 口袋机菜单画面。都要在持有 bsp_lvgl_lock() 时呼叫。
#pragma once

#include "pocket_model.h"

void menu_screen_show(const menu_state_t *m);
void menu_screen_update(void);   // 游标动了
void menu_screen_hide(void);
