// car_remote_model.h —— 「车用遥控器」模式的纯逻辑（不碰 ESP-IDF / LVGL / 蓝牙，有 host 测试）
//
// FoloToy 当成 Android 的蓝牙媒体遥控器（BLE HID，手机不用装 app）：
//   确定 短按   播放 / 暂停（微信读书听书、Spotify、YouTube……谁在播就控制谁）
//   上 / 下 短按 上一段 / 下一段
//   确定 长按   叫出语音助理（Google 助理：「用 WhatsApp 打给 Ah Meng」）
//   上 长按     回名片模式
//   闲置 60 秒调暗；调暗时按键照样有效（开车不用先按一下叫醒）
//
// 手机装了「SPACE 车控」app、连上 SPACE 车控通道（自订 GATT 服务）之后：
//   下 长按     → 交给 app：打开微信读书（继续上次那本）
//   确定 长按   → 交给 app：选朋友打 WhatsApp（没装 app 时照旧是语音助理）
//   app 叫 FoloToy 进「选择模式」时：所有按键都只交给 app，不送媒体键；画面显示 app 传来的两行字
//   按下 / 放开 也转给 app（按住确定录语音讯息，放开就送出）
//
// 名片模式里「下」长按 → 进车用模式。模式存在机器里，下次开机停在同一个模式。
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "space_card_model.h"   // 共用 space_card_btn_t / space_card_ev_t

typedef enum {
    APP_MODE_CARD = 0,   // 名片二维码（预设）
    APP_MODE_CAR = 1,    // 车用遥控器
} app_mode_t;

typedef enum {
    CAR_ACT_NONE = 0,
    CAR_ACT_PLAY_PAUSE,
    CAR_ACT_NEXT,
    CAR_ACT_PREV,
    CAR_ACT_VOICE,
    CAR_ACT_EXIT,        // 回名片模式（不送给手机）
    CAR_ACT_APP,         // 交给手机 app（经 SPACE 车控通道送按键），不送媒体键
} car_action_t;

// 蓝牙连线状态（ble_remote.c 回报，画面照这个显示）
typedef enum {
    CAR_LINK_STARTING = 0,   // 蓝牙启动中
    CAR_LINK_ADVERTISING,    // 等手机连（第一次要在手机蓝牙设定里配对）
    CAR_LINK_CONNECTED,      // 连上了，还在加密 / 等手机订阅
    CAR_LINK_READY,          // 可以用了
    CAR_LINK_ERROR,          // 蓝牙起不来
} car_link_t;

#define CAR_TEXT_MAX 28

typedef struct {
    bool dimmed;
    car_action_t last;       // 最后一个动作（画面中间显示，1 秒后淡掉）
    bool app_present;        // 手机 app 连上 SPACE 车控通道（订阅了按键通知）
    bool app_select;         // app 要的选择模式：按键只给 app
    char title[CAR_TEXT_MAX + 1];   // 选择模式第一行（app 传来，ASCII）
    char item[CAR_TEXT_MAX + 1];    // 选择模式第二行
} car_remote_state_t;

// ---- SPACE 车控通道（FoloToy ⇄ 手机 app）的封包 ----
// 按键通知（FoloToy → app，notify）：[按键 0 上 / 1 下 / 2 确定, 事件 0 单击 / 1 长按 / 2 按下 / 3 放开]
// 指令（app → FoloToy，write）：
//   [0x01, 模式]            模式 0 = 一般（媒体键）、1 = 选择模式（按键只给 app）
//   [0x02, 行 0/1, 文字…]   选择模式画面的第一 / 二行（ASCII，最多 28 字；超过截掉、非 ASCII 换成 ?）
#define CAR_CMD_MODE 0x01
#define CAR_CMD_TEXT 0x02
#define CAR_EVT_CLICK 0
#define CAR_EVT_LONG 1
#define CAR_EVT_PRESS 2
#define CAR_EVT_RELEASE 3

// 按键 → 通知封包；不用转的事件回 false
bool car_evt_encode(space_card_btn_t btn, space_card_ev_t ev, uint8_t out[2]);

// 收到 app 的指令 → 改状态；回 true = 画面要重画。格式不对就忽略（回 false）
bool car_cmd_apply(car_remote_state_t *s, const uint8_t *data, size_t len);

// app 断线 / 不订阅了：回到一般模式
void car_remote_app_gone(car_remote_state_t *s);

// HID Consumer Control 用法码（USB HID Usage Tables，Consumer page 0x0C）
#define CAR_USAGE_PLAY_PAUSE 0x00CD
#define CAR_USAGE_NEXT       0x00B5   // Scan Next Track
#define CAR_USAGE_PREV       0x00B6   // Scan Previous Track
#define CAR_USAGE_VOICE      0x00CF   // Voice Command → Android KEYCODE_VOICE_ASSIST

// 从哪个模式按哪个键要换模式；要换回 true 并填 *next
bool app_mode_switch(app_mode_t cur, space_card_btn_t btn, space_card_ev_t ev, app_mode_t *next);

// NVS 里存的值 → 模式（读不到 / 乱值都当名片模式）
app_mode_t app_mode_from_stored(int32_t stored, bool found);

void car_remote_init(car_remote_state_t *s);

// 按键 → 要做的动作；也会叫醒调暗的画面（不会吃掉这一下）
car_action_t car_remote_on_key(car_remote_state_t *s, space_card_btn_t btn, space_card_ev_t ev);

// 闲置多久（毫秒）→ 要不要调暗；回 true 代表要改背光
bool car_remote_on_idle(car_remote_state_t *s, uint32_t idle_ms);

uint8_t car_remote_backlight(const car_remote_state_t *s);

// 动作 → HID 用法码；不送给手机的动作回 0
uint16_t car_remote_usage(car_action_t a);

// 填一笔 Consumer Control 输入报告（2 bytes、little endian）；usage = 0 就是「放开」
void car_remote_report(uint16_t usage, uint8_t out[2]);

// 画面上的字（ASCII，预设字型没有中文）
const char *car_remote_action_text(car_action_t a);
const char *car_remote_link_text(car_link_t link);
