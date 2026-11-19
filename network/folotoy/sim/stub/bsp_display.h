#pragma once
// 模拟器用的假标头（只给 sim/ 用，不会编进韧体）
#include <stdint.h>
#include <stdbool.h>
static inline void bsp_display_backlight(uint8_t p){ extern int g_bl; g_bl=p; }
