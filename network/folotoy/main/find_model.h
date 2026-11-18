// find_model.h —— 「手机找 FoloToy」的纯逻辑（不碰 ESP-IDF / LVGL / 蓝牙，有 host 测试）
//
// 手机「SPACE 车控」app 按「找 FoloToy」→ 经 SPACE 车控通道送指令 → FoloToy 嘀嘀响 + 屏幕红白闪 + 全亮。
//   - 任何模式、任何画面都会响（名片、口袋机、车用遥控器）
//   - 按任何键就停（这一下只用来停，不会传给底下的画面）；30 秒没人按也会自己停
//   - 停了告诉手机为什么停（app 显示「找到了 ✓」或「响了 30 秒没人按」）
//
// 蓝牙（2026-11-18 用户选定）：车用模式照旧常开；名片 / 口袋机低频广播（约每秒一次），
// 而且只让已经配对过的手机连（新手机要在车用模式配对）。见 ble_remote.h。
//
// 封包（跟 car_remote_model.h 同一条通道）：
//   指令（app → FoloToy）：[0x03, 1] 开始响、[0x03, 0] 停
//   通知（FoloToy → app）：[0x80, 状态]  0 = app 叫停、1 = 正在响、2 = 有人按键（找到了）、3 = 30 秒没人按
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "space_card_model.h"   // space_card_ev_t

#define FIND_CMD 0x03
#define FIND_EVT 0x80
#define FIND_TIMEOUT_MS 30000u   // 响 30 秒没人按就停
#define FIND_FLASH_MS 400u       // 红 / 白 各 0.4 秒
#define FIND_SWALLOW_MS 1000u    // 按键停了之后，放开后 1 秒内的「单击」也吃掉

#define FIND_EVT_STOPPED 0
#define FIND_EVT_RINGING 1
#define FIND_EVT_FOUND 2
#define FIND_EVT_TIMEOUT 3

typedef enum {
    FIND_SWALLOW_NONE = 0,
    FIND_SWALLOW_UNTIL_RELEASE,   // 停的那一下还按着：长按、放开都吃掉
    FIND_SWALLOW_CLICK,           // 放开了：接着来的单击判定也吃掉（到 swallow_until_ms 为止）
} find_swallow_t;

typedef struct {
    bool active;
    uint32_t started_ms;
    find_swallow_t swallow;
    uint32_t swallow_until_ms;
} find_state_t;

// 停下来的原因（都会通知手机）
typedef enum {
    FIND_STOP_NONE = 0,
    FIND_STOP_KEY,       // 有人按了键（找到了）
    FIND_STOP_TIMEOUT,   // 30 秒没人按
    FIND_STOP_APP,       // app 叫停
} find_stop_t;

void find_init(find_state_t *s);

// 解析 app 的指令：不是「找」的指令回 -1；[0x03, 0] 回 0；[0x03, 非 0] 回 1
int find_cmd_parse(const uint8_t *data, size_t len);

// 通知封包：ringing = true → 正在响；false → 照 why 填停的原因
void find_evt_encode(bool ringing, find_stop_t why, uint8_t out[2]);

// 开始响（已经在响就重新算 30 秒）；回 true = 本来没在响（要开画面 / 声音）
bool find_start(find_state_t *s, uint32_t now_ms);

// app 叫停；回 true = 本来在响
bool find_stop(find_state_t *s);

// 定时呼叫；时间到回 FIND_STOP_TIMEOUT（已经停了），不然回 FIND_STOP_NONE
find_stop_t find_on_tick(find_state_t *s, uint32_t now_ms);

// 现在要显示红色（true）还是白色（false）
bool find_flash_red(const find_state_t *s, uint32_t now_ms);

// 按键先给这里：回 true = 这个事件被吃掉（不要传给底下的画面）。
// 正在响时任何按键都会停（*stopped = FIND_STOP_KEY）；停了以后那一下的长按 / 放开 / 单击也吃掉。
bool find_on_key(find_state_t *s, space_card_ev_t ev, uint32_t now_ms, find_stop_t *stopped);
