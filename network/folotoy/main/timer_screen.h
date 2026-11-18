// timer_screen.h —— 计时器 / 倒数计时画面。都要在持有 bsp_lvgl_lock() 时呼叫。
#pragma once

#include <stdbool.h>

#include "pocket_model.h"

// 两个一起传，countdown_mode 决定显示哪一个（状态放在 main.c，离开画面再回来时间还在）
void timer_screen_show(stopwatch_t *sw, countdown_t *cd, bool countdown_mode);
void timer_screen_update(void);   // 按键之后
void timer_screen_hide(void);
