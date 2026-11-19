// games_model.h —— 口袋机小游戏的纯逻辑（不碰 ESP-IDF / LVGL，有 host 测试）
//   叠叠乐、记忆三色、求签、抽奖、落落方块；解压：泡泡纸、狂按挑战、捏捏乐。乱数由呼叫的人给种子（韧体用开机时间 + 硬体乱数，测试用固定值）。
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

// ---------------- 落落方块 ----------------
// 10×20 格，七种四格方块（袋子洗牌：每七块各出一次）。满一行就消掉；每消 10 行升一级、掉更快。
// 三个键：上 左移、下 右移（按住连续移）、确定 短按旋转（靠墙会自动挪一格再转）、确定 按住加速往下掉。
#define FALL_COLS 10
#define FALL_ROWS 20
#define FALL_KINDS 7

typedef enum { FALL_PLAYING = 0, FALL_PAUSED, FALL_OVER } fall_phase_t;

typedef struct {
    fall_phase_t phase;
    uint8_t grid[FALL_ROWS][FALL_COLS];   // 0 = 空，1..7 = 哪一种方块落下来的（颜色）
    int8_t kind, rot, x, y;               // 正在掉的那块：种类 0..6、方向 0..3、4×4 框的左上角（格）
    int8_t next;                          // 下一块
    uint8_t bag[FALL_KINDS];
    int8_t bag_pos;
    uint32_t score;
    uint16_t lines;
    uint32_t acc_ms;                      // 累积的时间（到了就往下一格）
    uint32_t seed;
    uint32_t cleared;                     // 上一下消掉哪几行（位元；画面闪一下用）
} fall_t;

void fall_init(fall_t *f, uint32_t seed);
// 方块 kind、方向 rot 在 4×4 框里第 (r, c) 格有没有东西
bool fall_shape_cell(int kind, int rot, int r, int c);
bool fall_move(fall_t *f, int dx);           // 左右移；挡住回 false
bool fall_rotate(fall_t *f);                 // 顺时针转；转不了回 false
// 时间往前走 dt 毫秒（fast = 确定按住：加速）；回这次消了几行（0..4）
int fall_tick(fall_t *f, uint32_t dt_ms, bool fast);
int fall_level(const fall_t *f);             // 1 起，每 10 行 +1
uint32_t fall_interval_ms(const fall_t *f);  // 现在每几毫秒掉一格
int fall_ghost_y(const fall_t *f);           // 正在掉的那块直直落下会停在哪一行（画面画虚影）

// ---------------- 泡泡纸 ----------------
// 一张 5×6 的泡泡：上 / 下 移到上一个 / 下一个还没捏的泡泡，确定 捏破；全部捏完 → 确定 换一张新的
#define BUBBLE_COLS 5
#define BUBBLE_ROWS 6
#define BUBBLE_COUNT (BUBBLE_COLS * BUBBLE_ROWS)

typedef struct {
    bool popped[BUBBLE_COUNT];
    int cursor;          // 选到哪一个泡泡
    int left;            // 还剩几个
    uint32_t total;      // 这次开机一共捏了几个
} bubble_t;

void bubble_init(bubble_t *b);
void bubble_new_sheet(bubble_t *b);          // 换一张（total 不归零）
// 确定：捏破选到的那个（回 true），游标跳到下一个还没捏的
bool bubble_pop(bubble_t *b);
void bubble_step(bubble_t *b, int dir);      // 上 -1 / 下 +1：跳到上一个 / 下一个还没捏的（绕圈）

// ---------------- 狂按挑战 ----------------
// 第一下开始算，10 秒内按越多越好（三个键都算）。结束后 1.5 秒内的按键不算（免得一不小心就重开）。
#define MASH_MS 10000
#define MASH_COOLDOWN_MS 1500

typedef enum { MASH_READY = 0, MASH_RUNNING, MASH_OVER } mash_phase_t;

typedef struct {
    mash_phase_t phase;
    uint32_t t0;         // 开始时间
    uint32_t end_ms;     // 结束时间（冷却从这里算）
    uint16_t count;
    uint16_t best;       // 这次开机最高
} mash_t;

void mash_init(mash_t *m);
// 按一下：回 true = 有算到（READY 时这一下就开始）
bool mash_press(mash_t *m, uint32_t now_ms);
// 每次画面更新呼叫：时间到了就结束，回 true（这一下刚结束）
bool mash_tick(mash_t *m, uint32_t now_ms);
uint32_t mash_left_ms(const mash_t *m, uint32_t now_ms);
// 结束后：确定 再来（冷却过了才算）；回 true = 重新准备好了
bool mash_restart(mash_t *m, uint32_t now_ms);
// 每秒几下 ×10（"7.3"）
uint16_t mash_rate_x10(const mash_t *m);

// ---------------- 捏捏乐 ----------------
// 确定 按住：捏扁（越按越扁）；放开：像软糖一样弹回来、晃几下。上 / 下：换颜色。
#define SQUISH_TOYS 3

typedef struct {
    float pos;           // 0 = 圆圆的，1 = 捏到最扁；放开时会冲过头变负（往上弹高）
    float vel;
    bool held;
    uint32_t count;      // 捏了几下
    uint8_t toy;         // 第几个颜色
} squish_t;

void squish_init(squish_t *s);
void squish_press(squish_t *s);
void squish_release(squish_t *s);
void squish_tick(squish_t *s, uint32_t dt_ms);
uint32_t squish_color(uint8_t toy);
const char *squish_name(uint8_t toy);
