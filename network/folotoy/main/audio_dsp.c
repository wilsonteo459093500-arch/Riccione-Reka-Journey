// audio_dsp.c —— 见 audio_dsp.h（纯 C、只用整数，host 测试：tests/test_audio_dsp.c）
#include "audio_dsp.h"

#include <string.h>

// ---------------- 旋律：C 大调，3/4 拍，从弱起拍开始 ----------------
// G4=67 A4=69 B4=71 C5=72 D5=74 E5=76 F5=77 G5=79
static const dsp_note_t MELODY[] = {
    {67, 3}, {67, 1}, {69, 4}, {67, 4}, {72, 4}, {71, 8},            // 祝你生日快乐 / Happy birthday to you
    {67, 3}, {67, 1}, {69, 4}, {67, 4}, {74, 4}, {72, 8},            // 祝你生日快乐 / Happy birthday to you
    {67, 3}, {67, 1}, {79, 4}, {76, 4}, {72, 4}, {71, 4}, {69, 4},   // 祝你生日快乐 / Happy birthday dear friend
    {77, 3}, {77, 1}, {76, 4}, {72, 4}, {74, 4}, {72, 8},            // 祝你生日快乐 / Happy birthday to you
};
static const uint8_t LINE_START[MELODY_LINES] = { 0, 6, 12, 19 };
#define BEAT_MS 560u   // 约 107 拍 / 分钟

static const char *const LYRIC_ZH[MELODY_LINES] = { "祝你生日快乐", "祝你生日快乐", "祝你生日快乐", "祝你生日快乐" };
static const char *const LYRIC_EN[MELODY_LINES] = {
    "Happy birthday to you", "Happy birthday to you", "Happy birthday, dear friend", "Happy birthday to you",
};

size_t melody_len(void) {
    return sizeof MELODY / sizeof MELODY[0];
}

const dsp_note_t *melody_note(size_t i) {
    return i < melody_len() ? &MELODY[i] : NULL;
}

int melody_line_of(size_t note_index) {
    int line = 0;
    for (int l = 0; l < MELODY_LINES; l++)
        if (note_index >= LINE_START[l]) line = l;
    return line;
}

uint32_t melody_note_ms(const dsp_note_t *n) {
    return n ? (uint32_t)n->sixteenths * BEAT_MS / 4u : 0;
}

uint32_t melody_total_ms(void) {
    uint32_t t = 0;
    for (size_t i = 0; i < melody_len(); i++) t += melody_note_ms(&MELODY[i]);
    return t;
}

const char *melody_lyric(int line, bool zh) {
    if (line < 0 || line >= MELODY_LINES) return "";
    return zh ? LYRIC_ZH[line] : LYRIC_EN[line];
}

// ---------------- 合成 ----------------
// 正弦表：256 格、振幅 32767（一个周期）
static int16_t s_sine[256];
static bool s_sine_ready;

// 整数正弦：用二次逼近（Bhaskara 风格），只在第一次用时建表，误差 < 0.2%
static void build_sine(void) {
    for (int i = 0; i < 256; i++) {
        // 把 0..255 对应到 0..2π；先算半周期 0..128 → 0..π，用 4x(π-x)/(...) 形式的整数版
        const int half = i & 127;                 // 0..127 → 0..π
        const int64_t x = half;                   // 角度单位：π/128
        const int64_t num = 16 * x * (128 - x);   // Bhaskara：sin(x) ≈ 16x(π−x) / (5π² − 4x(π−x))
        const int64_t den = 5 * 128 * 128 - 4 * x * (128 - x);
        int32_t v = (int32_t)(num * 32767 / den);
        s_sine[i] = (int16_t)(i < 128 ? v : -v);
    }
    s_sine_ready = true;
}

// MIDI 号码 → 相位步进：freq × 2^32 / RATE；freq = 440 × 2^((m−69)/12)
// 12 个半音的比例表（× 2^16），整数完成
static const uint32_t SEMITONE_Q16[12] = {
    65536, 69433, 73562, 77936, 82570, 87480, 92682, 98193, 104032, 110218, 116772, 123715,
};

uint32_t dsp_phase_step(uint8_t midi) {
    // 以 A4（69）为基准：先算出 m 相对 A4 的八度和半音
    const int rel = (int)midi - 69;
    int oct = rel >= 0 ? rel / 12 : -((11 - rel) / 12);
    const int semi = rel - oct * 12;              // 0..11
    // 440 Hz 的步进 = 440 × 2^32 / 16000 = 118111600（取整）
    uint64_t step = (uint64_t)118111600u * SEMITONE_Q16[semi] >> 16;
    if (oct >= 0) step <<= oct;
    else step >>= -oct;
    return (uint32_t)step;
}

#define AMP 14000            // 峰值（留余量，三个泛音加起来不会爆）
#define ATTACK_S (DSP_RATE / 200)     // 5ms 起音
#define DECAY_S (DSP_RATE / 4)        // 250ms 内降到 55%
#define RELEASE_S (DSP_RATE / 40)     // 25ms 收尾

void dsp_render_note(uint8_t midi, uint32_t note_samples, uint32_t from, int16_t *out, size_t n) {
    if (!s_sine_ready) build_sine();
    const uint32_t sound = note_samples - note_samples * 15u / 100u;   // 最后 15% 停顿
    const uint32_t step = dsp_phase_step(midi);
    for (size_t k = 0; k < n; k++) {
        const uint32_t t = from + (uint32_t)k;
        if (t >= sound) { out[k] = 0; continue; }
        // 包络（0..1024）
        int32_t env;
        if (t < ATTACK_S) env = (int32_t)(t * 1024u / ATTACK_S);
        else if (t < ATTACK_S + DECAY_S) env = 1024 - (int32_t)((t - ATTACK_S) * 461u / DECAY_S);   // → 563（55%）
        else env = 563;
        if (sound - t < RELEASE_S) env = env * (int32_t)(sound - t) / RELEASE_S;
        // 相位直接由 t 算（不累积误差）：基音 + 0.35 × 二倍泛音 + 0.12 × 三倍泛音
        const uint32_t ph = step * t;
        const int32_t s = s_sine[ph >> 24] + (s_sine[(ph * 2) >> 24] * 35) / 100 + (s_sine[(ph * 3) >> 24] * 12) / 100;
        out[k] = (int16_t)((int64_t)s * AMP / 32767 * env / 1024 * 100 / 147);   // ÷1.47：泛音加总的峰值
    }
}

void dsp_render_beep(uint32_t freq_hz, int16_t *out, size_t n) {
    if (!s_sine_ready) build_sine();
    const uint32_t step = (uint32_t)(((uint64_t)freq_hz << 32) / DSP_RATE);
    const size_t fade = DSP_RATE / 200;   // 5ms
    for (size_t k = 0; k < n; k++) {
        int32_t env = 1024;
        if (k < fade) env = (int32_t)(k * 1024 / fade);
        if (n - k < fade) env = (int32_t)((n - k) * 1024 / fade);
        out[k] = (int16_t)((int32_t)s_sine[(step * (uint32_t)k) >> 24] * AMP / 32767 * env / 1024);
    }
}

void dsp_render_knock(uint32_t from, int16_t *out, size_t n) {
    if (!s_sine_ready) build_sine();
    const uint32_t step1 = (uint32_t)(((uint64_t)620 << 32) / DSP_RATE);
    const uint32_t step2 = (uint32_t)(((uint64_t)1180 << 32) / DSP_RATE);
    for (size_t k = 0; k < n; k++) {
        const uint32_t t = from + (uint32_t)k;
        if (t >= KNOCK_SAMPLES) { out[k] = 0; continue; }
        // 衰减：(剩下比例)^3，低音慢一点、高音快一点（木头的「咚」）
        const int64_t rem = KNOCK_SAMPLES - t;
        const int64_t e1 = rem * rem * rem / ((int64_t)KNOCK_SAMPLES * KNOCK_SAMPLES);            // 0..KNOCK_SAMPLES
        const int64_t e2 = e1 * rem / KNOCK_SAMPLES * rem / KNOCK_SAMPLES;
        const int64_t attack = t < 40 ? (int64_t)t * 1024 / 40 : 1024;                           // 2.5ms 起音，不会「啪」
        const int64_t v = ((int64_t)s_sine[(step1 * t) >> 24] * e1 + (int64_t)s_sine[(step2 * t) >> 24] * e2 / 2)
                          * AMP / 32767 / KNOCK_SAMPLES * attack / 1024;
        out[k] = (int16_t)(v > 32767 ? 32767 : v < -32768 ? -32768 : v);
    }
}

// ---------------- 吹气 ----------------
void blow_init(blow_detector_t *d) {
    memset(d, 0, sizeof(*d));
    d->floor = 300;   // 安静房间的起始值，几秒内会自动跟上实际环境
}

bool blow_feed(blow_detector_t *d, const int16_t *pcm, size_t n) {
    if (!pcm || n < 2) return false;
    uint64_t sum_abs = 0, sum_sq = 0, sum_dsq = 0;
    uint32_t clipped = 0;
    for (size_t i = 0; i < n; i++) {
        const int32_t x = pcm[i];
        sum_abs += (uint32_t)(x < 0 ? -x : x);
        sum_sq += (uint64_t)((int64_t)x * x);
        if (x >= 32000 || x <= -32000) clipped++;
        if (i) {
            const int32_t dx = x - pcm[i - 1];
            sum_dsq += (uint64_t)((int64_t)dx * dx);
        }
    }
    const uint32_t level = (uint32_t)(sum_abs / n);
    // 「沙沙感」：相邻取样差的能量 / 总能量 × 100。纯音 300 Hz ≈ 1、人声多半 < 8、气流噪音明显更高
    const uint32_t hiss = sum_sq ? (uint32_t)(sum_dsq * 100 / sum_sq) : 0;
    const bool clip = clipped * 50 >= n;   // ≥ 2% 爆音：嘴巴贴近麦克风吹气的典型现象

    const bool loud = level >= BLOW_ABS_MIN && level >= d->floor * BLOW_OVER_FLOOR;
    const bool blowy = loud && (hiss >= 8 || clip);
    d->history = (uint8_t)((d->history << 1) | (blowy ? 1 : 0));

    // 环境噪音只在「不大声」时慢慢跟（1/16），说话吹气不会把门槛拉高
    if (!loud) d->floor = d->floor + level / 16 - d->floor / 16;
    if (d->floor < 50) d->floor = 50;

    const uint32_t lv = level / 64;   // 16384 → 255
    d->level = (uint8_t)(lv > 255 ? 255 : lv);

    int count = 0;
    for (uint8_t h = d->history; h; h >>= 1) count += h & 1;
    if (count >= BLOW_NEED_FRAMES) {
        d->history = 0;   // 一口气只算一次
        return true;
    }
    return false;
}
