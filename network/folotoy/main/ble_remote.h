// ble_remote.h —— FoloToy 当蓝牙媒体遥控器（BLE HID Consumer Control，Android 不用装 app）
//
// 第一次：手机「设定 → 连接 → 蓝牙」→ 扫描 → 点「SPACE Remote」配对（Just Works，不用输入密码）。
// 之后 FoloToy 开机就会自动重连（配对资料存在 NVS，最多记 3 台手机，满了删最旧的）。
//
// 每个模式都开蓝牙（2026-11-18 起，给「手机找 FoloToy」用）；换模式会重开机，所以没有 stop：
//   车用模式：快速广播（30–50ms）、手机设定里看得到、可以配对新手机
//   名片 / 口袋机：低频广播（约每秒一次）、手机设定里看不到、只让配对过的手机连（新手机要在车用模式配对），
//                 连上后请手机放慢连线（约 0.3 秒一次），手机离开约 4 秒就知道断线
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "car_remote_model.h"
#include "find_model.h"

// 启动蓝牙并开始广播。呼叫前 NVS 要先初始化（main.c 负责）。失败回 false，状态会是 CAR_LINK_ERROR。
// car_mode = true：车用遥控器（快速广播、可以配对）；false：名片 / 口袋机（低频、只认配对过的手机）
bool ble_remote_start(const char *device_name, bool car_mode);

// 现在的连线状态（蓝牙 task 更新，任何 task 都可以读）
car_link_t ble_remote_link(void);

// 送一个媒体键（按下 → 放开）。还没连好就回 false。会短暂 sleep，不要在持 LVGL 锁时呼叫。
bool ble_remote_send(uint16_t usage);

// 更新手机上看到的电量（0–100；< 0 不更新）
void ble_remote_set_battery(int percent);

// ---- SPACE 车控通道（自订 GATT 服务，给手机「SPACE 车控」app 用；封包格式见 car_remote_model.h）----
// 服务 UUID 8d6f0001-6b3a-4c2e-9a51-535041434552；按键通知 …0002（notify）；指令 …0003（write，要加密连线）
bool ble_remote_app_present(void);                     // app 订阅了按键通知
bool ble_remote_notify_key(const uint8_t evt[2]);      // 送一个按键给 app；app 没连回 false
// 取出一笔 app 送来的指令（画面计时器在持 LVGL 锁时呼叫）；没有回 false。「找」的指令不放这里，见下面
bool ble_remote_take_cmd(uint8_t *buf, size_t *len, size_t cap);

// ---- 手机找 FoloToy（封包见 find_model.h）----
int ble_remote_take_find(void);                        // app 送来的「找」：-1 没有、0 停、1 开始响（读一次就清掉）
bool ble_remote_notify_find(bool ringing, find_stop_t why);

// 送一个任意封包给 app（DEKU 用：开始听 / 放开 / 念这句）；app 没连回 false
bool ble_remote_notify_raw(const uint8_t *data, size_t len);

// 名片 / 口袋机：请手机加快连线（传晨报时，约 15–30ms 一次）/ 放慢回平常（240–400ms）。车用模式不用
void ble_remote_set_fast(bool fast);   // 告诉 app 在响 / 为什么停了；app 没连回 false
