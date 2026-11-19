// audio_dsp.h —— 生日歌旋律、音色合成、吹气判断（纯整数运算，ESP32-C3 没有浮点硬件；有 host 测试）
//
// 「祝你生日快乐 / Happy Birthday to You」旋律与歌词已经是公有领域（美国 2016 年判决确定），
// 这里只用旋律自己合成音色，没有录音、没有人声。
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DSP_RATE 16000           // 取样率（播放、录音都用这个）
#define DSP_FRAME 320            // 吹气判断一格 = 20ms

// ---------------- 生日歌 ----------------
typedef struct {
    uint8_t midi;                // 音高（MIDI 号码，60 = 中央 C）
    uint8_t sixteenths;          // 长度，单位是 1/4 拍（4 = 一拍）
} dsp_note_t;

#define MELODY_LINES 4
size_t melody_len(void);
const dsp_note_t *melody_note(size_t i);
int melody_line_of(size_t note_index);          // 这个音在第几句（0..3）
uint32_t melody_note_ms(const dsp_note_t *n);   // 这个音几毫秒（含音与音之间的小停顿）
uint32_t melody_total_ms(void);
// 第 line 句歌词：zh = true 华语、false 英语
const char *melody_lyric(int line, bool zh);

// 音高 → 相位每取样前进多少（32 位相位，用来查正弦表）
uint32_t dsp_phase_step(uint8_t midi);

// 合成一个音的第 [from, from+n) 个取样到 out：正弦 + 泛音（像音乐盒），起音 / 衰减 / 收尾都有包络。
// note_samples = 整个音的长度（取样数）；最后约 15% 是停顿（同音高连续两个音才听得出是两下）。
void dsp_render_note(uint8_t midi, uint32_t note_samples, uint32_t from, int16_t *out, size_t n);

// 嘀声（倒数时间到）：freq_hz、n 个取样，头尾有淡入淡出不会「啪」一声
void dsp_render_beep(uint32_t freq_hz, int16_t *out, size_t n);

// 木鱼「咚」：两个会很快衰减的音（约 620 / 1180 Hz）叠起来，像敲木头；共 KNOCK_SAMPLES 个取样
#define KNOCK_SAMPLES (DSP_RATE * 160 / 1000)
void dsp_render_knock(uint32_t from, int16_t *out, size_t n);

// ---------------- 吹气判断 ----------------
// 对着麦克风吹气 = 很大声、持续、而且有「沙沙」的噪音感或爆音。
// 说话 / 唱歌通常没那么大声，也比较「有音调」。门槛要用真机再调（README 有写）。
typedef struct {
    uint32_t floor;              // 环境噪音（平均绝对值，慢慢跟着环境变）
    uint8_t history;             // 最近 8 格（每格 20ms）是不是「像吹气」，一格一个位元
    uint8_t level;               // 0..255：现在多大声（给火苗晃动用）
} blow_detector_t;

#define BLOW_ABS_MIN 6000        // 平均绝对值至少这么大（约 -15 dBFS）
#define BLOW_OVER_FLOOR 6        // 也要是环境噪音的 6 倍以上（约 +15 dB）
#define BLOW_NEED_FRAMES 6       // 最近 8 格里至少 6 格像吹气（约 120ms 以上）

void blow_init(blow_detector_t *d);
// 喂一格（DSP_FRAME 个取样），听到吹气回 true
bool blow_feed(blow_detector_t *d, const int16_t *pcm, size_t n);
