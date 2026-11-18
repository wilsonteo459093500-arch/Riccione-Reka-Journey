// games_model.h —— 口袋机小游戏的纯逻辑（不碰 ESP-IDF / LVGL，有 host 测试）
//   叠叠乐、记忆三色、求签、抽奖。乱数由呼叫的人给种子（韧体用开机时间 + 硬体乱数，测试用固定值）。
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "space_card_model.h"

uint32_t game_rand(uint32_t *seed);   // xorshift32，种子不能是 0

// ---------------- 叠叠乐 ----------------
// 方块在顶层左右来回滑，确定放下：跟下面那层没对齐的部分切掉；越叠越快。完全对齐（±2px）不切。
#define STACK_W 240          // 场地宽（像素，跟屏幕一样）
#define STACK_BASE_W 120     // 第一块的宽
#define STACK_MAX 64         // 最多记几层（画面只画最上面十几层）
#define STACK_PERFECT_PX 2

typedef enum { STACK_PLAYING = 0, STACK_OVER } stack_phase_t;

typedef struct {
    stack_phase_t phase;
    int16_t left[STACK_MAX];   // 每层的左边 x
    int16_t width[STACK_MAX];  // 每层的宽
    int n;                     // 已经叠了几层（含底座）
    int32_t x_q8;              // 正在滑的那块：左边 x（×256，平滑移动）
    int8_t dir;                // 1 往右、-1 往左
    uint16_t speed;            // 每秒几像素
    bool perfect;              // 上一下完全对齐
    int16_t cut_left, cut_width;   // 上一下切掉的那块（画面让它掉下去）；没有就 width = 0
} stack_t_;

void stack_init(stack_t_ *s);
void stack_tick(stack_t_ *s, uint32_t dt_ms);   // 移动正在滑的方块
// 放下；回 true = 叠上去了、false = 没叠到（游戏结束）
bool stack_drop(stack_t_ *s);
int stack_score(const stack_t_ *s);              // 叠了几层（不含底座）
int16_t stack_moving_x(const stack_t_ *s);
int16_t stack_moving_w(const stack_t_ *s);

// ---------------- 记忆三色 ----------------
// 机器亮一串颜色（上 / 下 / 确定 各一色一音），照顺序按回去；对了加一个再来，错了结束。
#define SIMON_MAX 64
#define SIMON_ON_MS 450      // 每一个亮多久
#define SIMON_GAP_MS 200     // 中间暗多久
#define SIMON_NEXT_MS 700    // 答对后多久出下一题

typedef enum { SIMON_SHOWING = 0, SIMON_INPUT, SIMON_OVER } simon_phase_t;

typedef struct {
    simon_phase_t phase;
    uint8_t seq[SIMON_MAX];
    int len;                 // 这一题多长
    int pos;                 // 播放 / 输入到第几个
    uint32_t t0;             // 这个阶段从几时开始
    uint32_t seed;
} simon_t;

void simon_init(simon_t *s, uint32_t seed, uint32_t now_ms);
// 每次画面更新呼叫：回传现在要亮哪一个（0 上 / 1 下 / 2 确定），不亮回 -1
int simon_tick(simon_t *s, uint32_t now_ms);
// 玩家按键（只在 SIMON_INPUT 有用）：回 1 = 对、0 = 不算、-1 = 错（结束）
int simon_press(simon_t *s, space_card_btn_t btn, uint32_t now_ms);
int simon_score(const simon_t *s);          // 答对几题

// ---------------- 求签 ----------------
// 签文是自己写的吉祥话（不是传统观音灵签原文），用户审过才算定稿。抽过的先不重复，全部抽过再洗牌。
#define FORTUNE_COUNT 24

typedef struct {
    uint8_t order[FORTUNE_COUNT];
    int next;
    uint32_t seed;
} fortune_t;

void fortune_init(fortune_t *f, uint32_t seed);
int fortune_draw(fortune_t *f);              // 回第几支签（0..FORTUNE_COUNT-1）
const char *fortune_level(int i);            // 「上上签」「上签」「中签」
const char *fortune_text(int i);             // 签文（两句）

// ---------------- 抽奖 ----------------
// 奖项和比例先用占位，用户给真的奖项再改（之后可在 SPACE 设定）
#define LOTTERY_PRIZES 4
const char *lottery_prize(int i);
uint16_t lottery_weight(int i);
int lottery_draw(uint32_t *seed);            // 按比例抽，回第几项
