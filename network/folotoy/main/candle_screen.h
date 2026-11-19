// candle_screen.h —— 数字蜡烛 + 生日歌画面。都要在持有 bsp_lvgl_lock() 时呼叫。
#pragma once

#include "pocket_model.h"

void candle_screen_show(candle_state_t *c);
// 按键处理完之后呼叫：d = candle_on_key() 的回传值
void candle_screen_on_do(candle_do_t d);
void candle_screen_hide(void);
