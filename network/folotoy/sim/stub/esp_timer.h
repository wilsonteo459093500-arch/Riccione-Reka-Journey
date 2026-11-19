#pragma once
// 模拟器用的假标头（只给 sim/ 用，不会编进韧体）
#include <stdint.h>
static inline int64_t esp_timer_get_time(void){ extern int64_t g_now_us; return g_now_us; }
