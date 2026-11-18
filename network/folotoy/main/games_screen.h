// games_screen.h —— 叠叠乐、记忆三色、求签、抽奖的画面。都要在持有 bsp_lvgl_lock() 时呼叫。
// 同一时间只开一个（main.c 换画面时先 hide 再 show 别的）。
#pragma once

#include <stdint.h>

#include "space_card_model.h"

typedef enum {
    GAME_STACK = 0, GAME_SIMON, GAME_FORTUNE, GAME_LOTTERY, GAME_FALL,
    GAME_BUBBLE, GAME_MASH, GAME_SQUISH,   // 解压
} game_kind_t;

// card_url：游戏结束画面的「想挑战我？扫码加我」二维码（名片网址，已经带 s=folotoy）
// seed：乱数种子（韧体用 esp_random()）
void games_screen_show(game_kind_t kind, const char *card_url, uint32_t seed);
// 回 true = 要回菜单（上 长按；落落方块玩的时候是暂停）。ev 也会收到按下 / 放开
bool games_screen_on_key(space_card_btn_t btn, space_card_ev_t ev);
void games_screen_hide(void);
// 叠叠乐 / 记忆三色 / 落落方块 / 狂按挑战是不是在结束画面（模拟器截图用）
bool games_screen_is_over(void);
