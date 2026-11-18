// sound.h —— 喇叭 / 麦克风的背景工作：放生日歌、倒数响铃、听吹气
//
// 一个 FreeRTOS task 独占 I2S（喇叭和麦克风同一条），其他地方只送命令、读状态，都不会卡住。
// 放歌时不听吹气（麦克风会听到歌声）；歌唱完等 1 秒再开始听。
#pragma once

#include <stdbool.h>
#include <stdint.h>

bool sound_start(void);            // 第一次用到时呼叫（初始化 codec + 建 task）；可重复呼叫
void sound_play_song(bool zh);     // 放生日歌（zh：歌词用华语，旋律一样）
void sound_stop(void);             // 停歌 / 停铃
void sound_alarm(bool on);         // 倒数时间到：嘀嘀嘀，一直响到 sound_alarm(false)
void sound_listen(bool on);        // 听吹气（蜡烛点着时开）

// 画面每次更新时读：
int sound_song_line(void);         // 正在唱第几句（0..3）；没在唱回 -1
bool sound_take_song_done(void);   // 歌唱完了吗（读一次就清掉）
bool sound_take_blow(void);        // 听到吹气了吗（读一次就清掉）
uint8_t sound_mic_level(void);     // 0..255：现在多大声（火苗晃动用）
