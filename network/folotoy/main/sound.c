// sound.c —— 见 sound.h
#include "sound.h"

#include <string.h>

#include "audio_dsp.h"
#include "bsp_audio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

static const char *TAG = "sound";

typedef enum {
    CMD_SONG_ZH, CMD_SONG_EN, CMD_STOP, CMD_ALARM_ON, CMD_ALARM_OFF, CMD_LISTEN_ON, CMD_LISTEN_OFF,
    CMD_SFX_KNOCK, CMD_SFX_TICK, CMD_SFX_WIN, CMD_SFX_LOSE,
    CMD_SFX_NOTE = 0x100,   // + MIDI 音高：一个短音（记忆三色）
} cmd_t;

#define LISTEN_GRACE_MS 1000   // 歌唱完 1 秒后才开始听（避免歌尾的回音、大家唱完的尾音）
#define SONG_VOLUME 80
#define ALARM_VOLUME 90

static QueueHandle_t s_cmd;
static volatile int s_line = -1;
static volatile bool s_song_done;
static volatile bool s_blow;
static volatile uint8_t s_level;
static int16_t s_buf[DSP_FRAME];

static void send(cmd_t c) {
    if (s_cmd) (void)xQueueSend(s_cmd, &c, 0);
}

void sound_play_song(bool zh) { send(zh ? CMD_SONG_ZH : CMD_SONG_EN); }
void sound_stop(void) { send(CMD_STOP); }
void sound_alarm(bool on) { send(on ? CMD_ALARM_ON : CMD_ALARM_OFF); }
void sound_listen(bool on) { send(on ? CMD_LISTEN_ON : CMD_LISTEN_OFF); }
void sound_knock(void) { send(CMD_SFX_KNOCK); }
void sound_tick(void) { send(CMD_SFX_TICK); }
void sound_win(void) { send(CMD_SFX_WIN); }
void sound_lose(void) { send(CMD_SFX_LOSE); }
void sound_note(uint8_t midi) { send((cmd_t)(CMD_SFX_NOTE + midi)); }
int sound_song_line(void) { return s_line; }
uint8_t sound_mic_level(void) { return s_level; }

bool sound_take_song_done(void) {
    const bool v = s_song_done;
    s_song_done = false;
    return v;
}

bool sound_take_blow(void) {
    const bool v = s_blow;
    s_blow = false;
    return v;
}

typedef struct {
    bool song, alarm, listen;
    // 短音效：木鱼「咚」，或一小串音（滴、赢、输、记忆三色）
    bool knock;
    uint32_t knock_pos;
    uint8_t fx_midi[4];
    uint16_t fx_ms[4];
    int fx_n, fx_i;
    uint32_t fx_pos;
    size_t note;              // 正在唱第几个音
    uint32_t note_pos;        // 这个音唱到第几个取样
    uint32_t alarm_pos;       // 响铃节奏里的位置（取样）
    TickType_t listen_after;  // 这个时间以后才听
    blow_detector_t blow;
} play_t;

static void apply(play_t *p, cmd_t c) {
    switch (c) {
    case CMD_SONG_ZH:
    case CMD_SONG_EN:
        p->song = true;
        p->note = 0;
        p->note_pos = 0;
        p->alarm = false;
        bsp_audio_set_volume(SONG_VOLUME);
        s_line = 0;
        break;
    case CMD_STOP:
        p->song = p->alarm = false;
        s_line = -1;
        break;
    case CMD_ALARM_ON:
        p->alarm = true;
        p->alarm_pos = 0;
        p->song = false;
        bsp_audio_set_volume(ALARM_VOLUME);
        break;
    case CMD_ALARM_OFF:
        p->alarm = false;
        break;
    case CMD_LISTEN_ON:
        if (!p->listen) blow_init(&p->blow);
        p->listen = true;
        break;
    case CMD_LISTEN_OFF:
        p->listen = false;
        s_level = 0;
        break;
    case CMD_SFX_KNOCK:
        p->knock = true;
        p->knock_pos = 0;
        bsp_audio_set_volume(SONG_VOLUME);
        break;
    default: {   // 一小串音
        static const uint8_t WIN[] = { 72, 76, 79, 84 }, LOSE[] = { 67, 64, 60 };
        const uint8_t *m = NULL;
        int n = 0;
        uint16_t ms = 120;
        if (c == CMD_SFX_TICK) { static const uint8_t T[] = { 96 }; m = T; n = 1; ms = 30; }
        else if (c == CMD_SFX_WIN) { m = WIN; n = 4; ms = 110; }
        else if (c == CMD_SFX_LOSE) { m = LOSE; n = 3; ms = 200; }
        else if (c >= CMD_SFX_NOTE) {
            static uint8_t one[1];
            one[0] = (uint8_t)(c - CMD_SFX_NOTE);
            m = one;
            n = 1;
            ms = 380;
        }
        if (!m) break;
        p->fx_n = n;
        p->fx_i = 0;
        p->fx_pos = 0;
        for (int i = 0; i < n; i++) { p->fx_midi[i] = m[i]; p->fx_ms[i] = ms; }
        bsp_audio_set_volume(SONG_VOLUME);
        break;
    }
    }
    if (c == CMD_SONG_ZH || c == CMD_SONG_EN || c == CMD_STOP) {
        p->listen_after = xTaskGetTickCount() + pdMS_TO_TICKS(LISTEN_GRACE_MS);
    }
}

// 送一格（20ms）歌
static void song_frame(play_t *p) {
    size_t filled = 0;
    while (filled < DSP_FRAME && p->song) {
        const dsp_note_t *n = melody_note(p->note);
        if (!n) {   // 唱完
            p->song = false;
            s_line = -1;
            s_song_done = true;
            p->listen_after = xTaskGetTickCount() + pdMS_TO_TICKS(LISTEN_GRACE_MS);
            break;
        }
        s_line = melody_line_of(p->note);
        const uint32_t total = melody_note_ms(n) * (DSP_RATE / 1000);
        uint32_t take = total - p->note_pos;
        if (take > DSP_FRAME - filled) take = (uint32_t)(DSP_FRAME - filled);
        dsp_render_note(n->midi, total, p->note_pos, s_buf + filled, take);
        filled += take;
        p->note_pos += take;
        if (p->note_pos >= total) {
            p->note++;
            p->note_pos = 0;
        }
    }
    if (filled < DSP_FRAME) memset(s_buf + filled, 0, (DSP_FRAME - filled) * sizeof(int16_t));
    bsp_audio_write(s_buf, sizeof s_buf);
}

// 响铃：嘀 嘀 嘀（各 150ms、间隔 100ms），停 600ms，再来。
// 一个「嘀」先整段算好（淡入淡出只在头尾），送的时候按位置切，不会每格都淡一次变成嗡嗡声。
#define BEEP_SAMPLES (DSP_RATE * 150 / 1000)
static int16_t s_beep[BEEP_SAMPLES];

static void alarm_frame(play_t *p) {
    const uint32_t unit = BEEP_SAMPLES + DSP_RATE / 10, cycle = 3 * unit + DSP_RATE * 6 / 10;
    for (size_t k = 0; k < DSP_FRAME; k++) {
        const uint32_t pos = (p->alarm_pos + (uint32_t)k) % cycle;
        const uint32_t in_unit = pos % unit;
        s_buf[k] = (pos < 3 * unit && in_unit < BEEP_SAMPLES) ? s_beep[in_unit] : 0;
    }
    p->alarm_pos += DSP_FRAME;
    bsp_audio_write(s_buf, sizeof s_buf);
}

// 送一格（20ms）音效
static void fx_frame(play_t *p) {
    if (p->knock) {
        uint32_t take = KNOCK_SAMPLES - p->knock_pos;
        if (take > DSP_FRAME) take = DSP_FRAME;
        dsp_render_knock(p->knock_pos, s_buf, DSP_FRAME);   // 超过长度的部分会补 0
        p->knock_pos += take;
        if (p->knock_pos >= KNOCK_SAMPLES) p->knock = false;
    } else {
        size_t filled = 0;
        while (filled < DSP_FRAME && p->fx_i < p->fx_n) {
            const uint32_t total = p->fx_ms[p->fx_i] * (DSP_RATE / 1000);
            uint32_t take = total - p->fx_pos;
            if (take > DSP_FRAME - filled) take = (uint32_t)(DSP_FRAME - filled);
            dsp_render_note(p->fx_midi[p->fx_i], total, p->fx_pos, s_buf + filled, take);
            filled += take;
            p->fx_pos += take;
            if (p->fx_pos >= total) { p->fx_i++; p->fx_pos = 0; }
        }
        if (filled < DSP_FRAME) memset(s_buf + filled, 0, (DSP_FRAME - filled) * sizeof(int16_t));
        if (p->fx_i >= p->fx_n) p->fx_n = 0;
    }
    bsp_audio_write(s_buf, sizeof s_buf);
}

static void listen_frame(play_t *p) {
    if (bsp_audio_read(s_buf, sizeof s_buf) != ESP_OK) {
        vTaskDelay(pdMS_TO_TICKS(20));
        return;
    }
    if (xTaskGetTickCount() < p->listen_after) return;   // 刚唱完：先不算
    if (blow_feed(&p->blow, s_buf, DSP_FRAME)) {
        ESP_LOGI(TAG, "听到吹气（环境噪音 %u）", (unsigned)p->blow.floor);
        s_blow = true;
    }
    s_level = p->blow.level;
}

static void sound_task(void *arg) {
    (void)arg;
    play_t p = { 0 };
    cmd_t c;
    for (;;) {
        const bool fx = p.knock || p.fx_n > 0;
        const bool busy = p.song || p.alarm || p.listen || fx;
        // 有事做：不等命令（看一下就走）；没事：一直等
        if (xQueueReceive(s_cmd, &c, busy ? 0 : portMAX_DELAY) == pdTRUE) {
            apply(&p, c);
            continue;
        }
        if (fx) fx_frame(&p);   // 音效最优先（很短）
        else if (p.song) song_frame(&p);
        else if (p.alarm) alarm_frame(&p);
        else if (p.listen) listen_frame(&p);
    }
}

bool sound_start(void) {
    if (s_cmd) return true;
    if (bsp_audio_init() != ESP_OK || bsp_audio_set_format(DSP_RATE, 16, 1) != ESP_OK) {
        ESP_LOGE(TAG, "喇叭 / 麦克风初始化失败：没有声音，吹气也听不到（按键照样能用）");
        return false;
    }
    dsp_render_beep(1760, s_beep, BEEP_SAMPLES);
    s_cmd = xQueueCreate(8, sizeof(cmd_t));
    if (!s_cmd) return false;
    if (xTaskCreate(sound_task, "sound", 4096, NULL, 6, NULL) != pdPASS) {
        vQueueDelete(s_cmd);
        s_cmd = NULL;
        return false;
    }
    return true;
}
