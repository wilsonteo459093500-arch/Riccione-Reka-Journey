// news_screen.h —— 每日晨报的画面：目录 → 标题列表 → 一条（标题 + 摘要）。按键见 news_model.h。
// 都要在持 LVGL 锁时呼叫。翻到哪里离开再回来还记得（新的一份晨报传进来才回到目录）。
#pragma once

#include <stdbool.h>

#include "space_card_model.h"

void news_screen_show(void);
bool news_screen_on_key(space_card_btn_t btn, space_card_ev_t ev);   // 回 true = 回菜单
void news_screen_hide(void);
