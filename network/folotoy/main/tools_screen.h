// tools_screen.h —— 木鱼、手电筒、番茄钟的画面。都要在持有 bsp_lvgl_lock() 时呼叫。
// 同一时间只会开一个（main.c 换画面时先 hide 再 show 别的）。
#pragma once

#include "pocket_model.h"

void muyu_screen_show(muyu_t *m);
void muyu_screen_on_key(int what);          // what = muyu_on_key() 的回传值（MUYU_*）
void muyu_screen_hide(void);

void flashlight_screen_show(uint8_t *color_idx);
void flashlight_screen_update(void);
void flashlight_screen_hide(void);

void pomodoro_screen_show(pomodoro_t *p);
void pomodoro_screen_update(void);          // 按键之后
void pomodoro_screen_hide(void);
