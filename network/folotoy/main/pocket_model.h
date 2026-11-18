// pocket_model.h —— 「口袋机」小功能的纯逻辑（不碰 ESP-IDF / LVGL，有 host 测试）
//
// 名片画面「上」长按 → 菜单：蜡烛与生日歌 / 计时器 / 倒数计时 / 车用遥控器 / 返回名片
// 每个功能里「上」长按 → 回菜单。
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "space_card_model.h"   // 共用 space_card_btn_t / space_card_ev_t

// ---------------- 菜单 ----------------
typedef enum {
    MENU_CANDLE = 0,
    MENU_STOPWATCH,
    MENU_COUNTDOWN,
    MENU_CAR,
    MENU_BACK,
    MENU_COUNT,
} menu_item_t;

typedef enum {
    NAV_NONE = 0,        // 留在原画面
    NAV_REDRAW,          // 留在原画面、要重画
    NAV_OPEN,            // 打开 menu_state_t.cursor 那一项
    NAV_TO_MENU,         // 回菜单
    NAV_TO_CARD,         // 回名片
} nav_t;

typedef struct {
    menu_item_t cursor;
} menu_state_t;

void menu_init(menu_state_t *m);
// 上 / 下 移动（到两端就停，不绕圈）、确定打开、上 长按 回名片
nav_t menu_on_key(menu_state_t *m, space_card_btn_t btn, space_card_ev_t ev);
const char *menu_item_text(menu_item_t item);

// ---------------- 蜡烛与生日歌 ----------------
typedef enum {
    CANDLE_LIT = 0,      // 点着，等人唱歌 / 吹
    CANDLE_SINGING,      // FoloToy 在放生日歌（这时候不听吹气：麦克风会听到歌）
    CANDLE_OUT,          // 吹熄了：冒烟 +「生日快乐」
} candle_phase_t;

typedef enum {
    SONG_ZH = 0,         // 祝你生日快乐
    SONG_EN,             // Happy Birthday
} song_lang_t;

typedef enum {
    CANDLE_DO_NONE = 0,
    CANDLE_DO_REDRAW,        // 年龄变了 / 重新点燃
    CANDLE_DO_SING,          // 开始唱（lang 看 state.lang）
    CANDLE_DO_STOP_SONG,     // 唱到一半按键 → 停
    CANDLE_DO_BLOW_OUT,      // 熄灭（按键或吹气）
    CANDLE_DO_EXIT,          // 回菜单
} candle_do_t;

#define CANDLE_AGE_MIN 0
#define CANDLE_AGE_MAX 99
#define CANDLE_AGE_DEFAULT 18

typedef struct {
    candle_phase_t phase;
    uint8_t age;
    song_lang_t lang;
} candle_state_t;

void candle_init(candle_state_t *c);
// 上 / 下 短按：年龄 ±1｜确定 短按：唱华语｜下 长按：唱英语｜确定 长按：熄灭 / 点燃｜上 长按：回菜单
// 熄灭后 确定 短按：重新点燃。唱歌时按任何键（上长按除外）：停歌
candle_do_t candle_on_key(candle_state_t *c, space_card_btn_t btn, space_card_ev_t ev);
void candle_song_done(candle_state_t *c);   // 歌唱完 → 回到点着（开始听吹气）
void candle_blown(candle_state_t *c);       // 听到吹气 → 熄灭
// 年龄 → 蜡烛的数字字串（"0" ~ "99"），out 至少 3 bytes
void candle_age_text(uint8_t age, char *out, size_t out_len);

// ---------------- 计时器（正数）----------------
typedef struct {
    bool running;
    uint32_t base_ms;    // 暂停前累积
    uint32_t start_ms;   // 这次开始的时间
} stopwatch_t;

void stopwatch_init(stopwatch_t *s);
uint32_t stopwatch_elapsed(const stopwatch_t *s, uint32_t now_ms);
// 确定：开始 / 暂停｜下 短按（暂停时）：归零｜上 长按：回菜单
nav_t stopwatch_on_key(stopwatch_t *s, space_card_btn_t btn, space_card_ev_t ev, uint32_t now_ms);

// ---------------- 倒数计时 ----------------
typedef enum {
    CD_SET = 0,          // 设定中（上下调分钟）
    CD_RUNNING,
    CD_PAUSED,
    CD_DONE,             // 时间到：响铃，按任何键停
} cd_phase_t;

#define CD_DEFAULT_S 300
#define CD_MIN_S 60
#define CD_MAX_S (99 * 60)
#define CD_STEP_S 60

typedef struct {
    cd_phase_t phase;
    uint32_t set_s;          // 设定的秒数
    uint32_t remaining_ms;   // 暂停 / 设定时剩多少
    uint32_t end_ms;         // 跑的时候：几时到
} countdown_t;

void countdown_init(countdown_t *c);
uint32_t countdown_remaining(const countdown_t *c, uint32_t now_ms);
// 每次画面更新时呼叫：时间到了就换成 CD_DONE，回 true（要开始响铃）
bool countdown_tick(countdown_t *c, uint32_t now_ms);
// 设定中：上 / 下 ±1 分｜确定：开始 / 暂停 / 继续｜确定 长按：归零回设定｜时间到：任何键停铃回设定｜上 长按：回菜单
nav_t countdown_on_key(countdown_t *c, space_card_btn_t btn, space_card_ev_t ev, uint32_t now_ms);

// 时间文字："05:00"、"1:02:03"（≥ 1 小时）；with_tenths：正数计时加一位小数 "05:00.3"
void format_duration(uint32_t ms, bool with_tenths, char *out, size_t out_len);
