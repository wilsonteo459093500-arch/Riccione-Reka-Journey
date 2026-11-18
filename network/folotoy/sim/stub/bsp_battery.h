#pragma once
// 模拟器用的假标头（只给 sim/ 用，不会编进韧体）
static inline int bsp_battery_soc(void){ extern int g_soc; return g_soc; }
