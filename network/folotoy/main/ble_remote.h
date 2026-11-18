// ble_remote.h —— FoloToy 当蓝牙媒体遥控器（BLE HID Consumer Control，Android 不用装 app）
//
// 第一次：手机「设定 → 连接 → 蓝牙」→ 扫描 → 点「SPACE Remote」配对（Just Works，不用输入密码）。
// 之后 FoloToy 进车用模式就会自动重连（配对资料存在 NVS，最多记 3 台手机，满了删最旧的）。
//
// 只在车用模式启动；换模式会重开机，所以没有 stop。
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "car_remote_model.h"

// 启动蓝牙并开始广播。呼叫前 NVS 要先初始化（main.c 负责）。失败回 false，状态会是 CAR_LINK_ERROR。
bool ble_remote_start(const char *device_name);

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
// 取出一笔 app 送来的指令（画面计时器在持 LVGL 锁时呼叫）；没有回 false
bool ble_remote_take_cmd(uint8_t *buf, size_t *len, size_t cap);
