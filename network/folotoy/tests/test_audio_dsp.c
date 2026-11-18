// 生日歌 / 合成 / 吹气判断的 host 测试：
//   cc -std=c11 -Wall -Wextra -Werror -Imain main/audio_dsp.c tests/test_audio_dsp.c -lm -o /tmp/t && /tmp/t
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "audio_dsp.h"

static void test_melody(void) {
    assert(melody_len() == 25);
    // 四句的开头：都是两个短音（3/16 + 1/16 拍）的弱起
    assert(melody_line_of(0) == 0 && melody_line_of(6) == 1 && melody_line_of(12) == 2 && melody_line_of(19) == 3);
    assert(melody_line_of(24) == 3);
    uint32_t sixteenths = 0;
    for (size_t i = 0; i < melody_len(); i++) sixteenths += melody_note(i)->sixteenths;
    assert(sixteenths == 4 * 3 * 8);           // 3/4 拍 × 8 小节（含弱起和最后的长音）
    assert(melody_total_ms() > 12000 && melody_total_ms() < 15000);   // 一首约 13 秒
    assert(melody_note(25) == NULL);
    assert(strcmp(melody_lyric(0, true), "祝你生日快乐") == 0);
    assert(strcmp(melody_lyric(2, false), "Happy birthday, dear friend") == 0);
    assert(melody_lyric(9, true)[0] == '\0');
}

// 数「往上穿过 0」的次数估计频率
static double measure_hz(const int16_t *x, size_t n) {
    int crossings = 0;
    for (size_t i = 1; i < n; i++)
        if (x[i - 1] < 0 && x[i] >= 0) crossings++;
    return crossings * (double)DSP_RATE / (double)n;
}

static void test_pitch(void) {
    // A4 = 440 Hz、G4 = 392 Hz、G5 = 784 Hz：步进值误差 < 0.1%
    const struct { uint8_t m; double hz; } cases[] = { {69, 440.0}, {67, 392.0}, {79, 783.99}, {72, 523.25}, {77, 698.46} };
    for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
        const double hz = dsp_phase_step(cases[i].m) * (double)DSP_RATE / 4294967296.0;
        assert(fabs(hz - cases[i].hz) / cases[i].hz < 0.001);
    }
    // 实际合成出来的音：数过零点，频率对（泛音不会多穿零点）
    static int16_t buf[DSP_RATE];   // 1 秒
    dsp_render_note(69, DSP_RATE * 2, 0, buf, DSP_RATE);
    const double hz = measure_hz(buf + 800, DSP_RATE - 800);
    assert(fabs(hz - 440.0) < 6.0);
}

static void test_envelope(void) {
    static int16_t buf[DSP_RATE];
    const uint32_t note = DSP_RATE / 2;   // 0.5 秒
    dsp_render_note(72, note, 0, buf, note);
    int peak = 0;
    for (uint32_t i = 0; i < note; i++) if (abs(buf[i]) > peak) peak = abs(buf[i]);
    assert(peak > 8000 && peak < 16000);             // 够大声、不爆音
    assert(abs(buf[0]) < 200);                        // 起音从 0 开始（不会「啪」一声）
    for (uint32_t i = note - note * 15 / 100; i < note; i++) assert(buf[i] == 0);   // 最后 15% 是停顿
    // 分段合成 = 一次合成（播放时一段一段送）
    static int16_t part[DSP_RATE];
    dsp_render_note(72, note, 0, part, 1000);
    dsp_render_note(72, note, 1000, part + 1000, note - 1000);
    assert(memcmp(buf, part, note * sizeof(int16_t)) == 0);

    dsp_render_beep(1000, buf, 1600);
    assert(abs(buf[0]) < 200 && abs(buf[1599]) < 400);
    assert(fabs(measure_hz(buf, 1600) - 1000.0) < 15.0);
}

// ---- 吹气：用合成的声音模拟 ----
static uint32_t s_rng = 12345;
static int32_t noise(int32_t amp) {
    s_rng = s_rng * 1103515245u + 12345u;
    return (int32_t)((s_rng >> 8) % (uint32_t)(2 * amp + 1)) - amp;
}

static void fill_noise(int16_t *f, int32_t amp) {
    for (int i = 0; i < DSP_FRAME; i++) {
        int32_t v = noise(amp);
        f[i] = (int16_t)(v > 32767 ? 32767 : v < -32768 ? -32768 : v);
    }
}

static void fill_voice(int16_t *f, int32_t amp, int frame) {
    // 人声：200 Hz 基音 + 几个泛音（有音调、低频为主）
    for (int i = 0; i < DSP_FRAME; i++) {
        const double t = (frame * DSP_FRAME + i) / (double)DSP_RATE;
        const double v = sin(2 * M_PI * 200 * t) + 0.5 * sin(2 * M_PI * 400 * t) + 0.3 * sin(2 * M_PI * 600 * t);
        f[i] = (int16_t)(v / 1.8 * amp);
    }
}

static int frames_until_blow(void (*make)(int16_t *, int), int max_frames) {
    blow_detector_t d;
    blow_init(&d);
    int16_t f[DSP_FRAME];
    for (int i = 0; i < max_frames; i++) {
        make(f, i);
        if (blow_feed(&d, f, DSP_FRAME)) return i;
    }
    return -1;
}

static void make_quiet(int16_t *f, int i) { (void)i; fill_noise(f, 400); }
static void make_blow(int16_t *f, int i) { fill_noise(f, i < 50 ? 400 : 20000); }          // 安静 1 秒后用力吹
static void make_short_puff(int16_t *f, int i) { fill_noise(f, (i >= 50 && i < 53) ? 20000 : 400); }   // 60ms 的「噗」
static void make_loud_voice(int16_t *f, int i) { if (i < 50) fill_noise(f, 400); else fill_voice(f, 20000, i); }
static void make_soft_blow(int16_t *f, int i) { fill_noise(f, i < 50 ? 400 : 6000); }      // 离太远、太小力

static void test_blow(void) {
    assert(frames_until_blow(make_quiet, 300) == -1);        // 安静 6 秒：不会熄
    const int at = frames_until_blow(make_blow, 300);
    assert(at >= 50 + 5 && at <= 50 + 8);                    // 吹了约 120ms 就熄
    assert(frames_until_blow(make_short_puff, 300) == -1);   // 短短一下（拍桌、咳一声）不算
    assert(frames_until_blow(make_loud_voice, 300) == -1);   // 大声唱歌 / 说话不算
    assert(frames_until_blow(make_soft_blow, 300) == -1);    // 太小力不算（要真的对着吹）

    // 火苗晃动的强度：大声 → 接近 255、安静 → 很小
    blow_detector_t d;
    blow_init(&d);
    int16_t f[DSP_FRAME];
    fill_noise(f, 400);
    blow_feed(&d, f, DSP_FRAME);
    assert(d.level < 10);
    fill_noise(f, 30000);
    blow_feed(&d, f, DSP_FRAME);
    assert(d.level > 200);
    // 吵的环境（餐厅）：环境噪音会慢慢跟上，门槛跟着提高
    blow_init(&d);
    for (int i = 0; i < 200; i++) { fill_noise(f, 3000); blow_feed(&d, f, DSP_FRAME); }
    assert(d.floor > 1000);
}

int main(void) {
    test_melody();
    test_pitch();
    test_envelope();
    test_blow();
    printf("test_audio_dsp: OK\n");
    return 0;
}
