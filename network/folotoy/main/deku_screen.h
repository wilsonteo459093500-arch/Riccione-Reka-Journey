// deku_screen.h —— DEKU 小助理的画面：原创的小木块脸（等你 / 在听 / 想 / 说 / 没听懂）+ 句子
// 都要在持 LVGL 锁时呼叫。
#pragma once

#include "deku_model.h"

void deku_screen_show(deku_state_t *state);
void deku_screen_update(void);   // 状态变了（按键、app 指令）之后重画
void deku_screen_hide(void);
