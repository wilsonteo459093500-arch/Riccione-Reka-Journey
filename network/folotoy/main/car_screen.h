// car_screen.h —— 「车用遥控器」模式的画面。都要在持有 bsp_lvgl_lock() 时呼叫。
#pragma once

#include <stdbool.h>

#include "car_remote_model.h"

// 建好画面并载入；state 要一直活着（main.c 里的 static）
void car_screen_show(car_remote_state_t *state, const char *device_name);

// 按键处理完之后呼叫：a = 这次的动作，sent = 有没有送到手机（没连上会显示 Not connected）
void car_screen_on_action(car_action_t a, bool sent);

// 停掉画面的计时器（韧体里离开车用模式是重开机，用不到；模拟器换画面时用）
void car_screen_hide(void);
