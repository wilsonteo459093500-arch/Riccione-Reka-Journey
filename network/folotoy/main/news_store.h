// news_store.h —— 每日晨报存在 flash（分区 brief，A / B 两格），蓝牙收进来、画面读出去
//
// 收：蓝牙回呼（NimBLE task）把 0x06 / 0x07 封包丢给 news_store_push → 这里自己的 task 写 flash（擦一格要几十 ms，
//     不能卡在蓝牙 task 里）→ 回 app [0x83, 状态, crc]。开始传时请手机加快连线，传完 / 10 秒没下一段就放慢。
// 读：画面（持 LVGL 锁）呼叫 news_store_map，拿到 flash 映射的位址直接读，不用整份搬进 RAM。
//     news_store_version() 变了就是有新的一份，画面要重新 map + 解析。
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define NEWS_PKT_MAX 252   // 一个封包最长（MTU 247 - 3 = 244，留一点余量）

// app_main 呼叫一次（NVS / 蓝牙之前之后都可以）；找不到分区就不收（画面会说「还没有晨报」）
void news_store_start(void);

// 蓝牙回呼呼叫：复制一份排进 queue；满了等一下，还是满就回 false（app 会重传）
bool news_store_push(const uint8_t *data, size_t len);

// 现在那份的版本（每存好一份新的 +1）
uint32_t news_store_version(void);

// 映射现在那份（只在 LVGL 锁里呼叫）；没有回 false。上一次 map 的位址会失效
bool news_store_map(const char **text, size_t *len, uint32_t *crc);

// 正在接收：0–99；没有在收回 -1
int news_store_progress(void);
