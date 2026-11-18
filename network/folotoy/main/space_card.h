// space_card.h —— SPACE 名片 app 的画面。两个函数都要在持有 bsp_lvgl_lock() 时呼叫。
#pragma once

#include "space_card_model.h"

// 建好画面并载入；state 要一直活着（main.c 里的 static）
void space_card_show(space_card_state_t *state);

// 按键处理完之后呼叫：redraw = space_card_on_key() 的回传值；也会重设闲置计时
void space_card_on_input(int redraw);
