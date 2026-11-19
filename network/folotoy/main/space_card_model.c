// space_card_model.c —— 见 space_card_model.h（纯 C，host 测试：tests/test_space_card_model.c）
#include "space_card_model.h"

#include <stdio.h>
#include <string.h>

static const uint8_t BRIGHTNESS[] = { 100, 60, 30 };
#define DIM_PERCENT 15
#define DIM_AFTER_MS 60000u
#define COVER_AFTER_MS 30000u

bool space_card_tag_url(const char *in, char *out, size_t out_len) {
    if (!in || !out || out_len == 0) return false;
    out[0] = '\0';
    size_t n = strlen(in);
    while (n > 0 && (in[n - 1] == ' ' || in[n - 1] == '\n' || in[n - 1] == '\r')) n--;
    if (n < 9 || strncmp(in, "https://", 8) != 0) return false;
    for (size_t i = 0; i < n; i++) {
        unsigned char c = (unsigned char)in[i];
        if (c <= 0x20 || c >= 0x7f) return false;   // 只收 ASCII、不能有空白
    }
    const char *q = memchr(in, '?', n);
    const char *hash = memchr(in, '#', n);
    if (hash) return false;                          // 名片网址不会有 #，有的话多半贴错
    bool has_s = false;
    if (q) {
        for (const char *p = q + 1; p < in + n; p++) {
            if ((p == q + 1 || p[-1] == '&') && p + 1 < in + n && p[0] == 's' && p[1] == '=') { has_s = true; break; }
        }
    }
    const char *suffix = has_s ? "" : (q ? (in[n - 1] == '?' || in[n - 1] == '&' ? "s=folotoy" : "&s=folotoy") : "?s=folotoy");
    size_t need = n + strlen(suffix);
    if (need > SPACE_CARD_URL_MAX || need + 1 > out_len) return false;
    memcpy(out, in, n);
    memcpy(out + n, suffix, strlen(suffix) + 1);
    return true;
}

static void copy_label(char *dst, const char *src, const char *fallback) {
    const char *s = (src && src[0]) ? src : fallback;
    size_t j = 0;
    for (size_t i = 0; s[i] && j < SPACE_CARD_LABEL_MAX; i++) {
        unsigned char c = (unsigned char)s[i];
        dst[j++] = (c >= 0x20 && c < 0x7f) ? (char)c : '?';   // 预设字型没有中文 → 换成 ?
    }
    dst[j] = '\0';
}

void space_card_init(space_card_state_t *s,
                     const char *card_url, const char *card_label,
                     const char *event_url, const char *event_label) {
    memset(s, 0, sizeof(*s));
    if (space_card_tag_url(card_url, s->links[0].url, sizeof(s->links[0].url))) {
        copy_label(s->links[0].label, card_label, "Scan to connect");
        s->count = 1;
        if (event_url && event_url[0] &&
            space_card_tag_url(event_url, s->links[1].url, sizeof(s->links[1].url))) {
            copy_label(s->links[1].label, event_label, "Event");
            s->count = 2;
        }
        s->cover = true;   // 开机先显示封面
    }
}

int space_card_on_key(space_card_state_t *s, space_card_btn_t btn, space_card_ev_t ev) {
    int redraw = SPACE_CARD_REDRAW_NONE;
    if (s->dimmed) {                      // 调暗时第一下只叫醒，不做别的事
        s->dimmed = false;
        return SPACE_CARD_REDRAW_BACKLIGHT;
    }
    if (ev != SPACE_CARD_EV_CLICK && ev != SPACE_CARD_EV_LONG) return redraw;
    if (s->cover) {                       // 封面：只有 确定 短按 有用（→ 二维码）
        if (ev == SPACE_CARD_EV_CLICK && btn == SPACE_CARD_BTN_OK) {
            s->cover = false;
            return SPACE_CARD_REDRAW_LAYOUT | SPACE_CARD_REDRAW_QR;
        }
        return redraw;
    }
    if (ev == SPACE_CARD_EV_CLICK && (btn == SPACE_CARD_BTN_UP || btn == SPACE_CARD_BTN_DOWN)) {
        if (s->count > 1) {
            s->current = btn == SPACE_CARD_BTN_DOWN ? (s->current + 1) % s->count
                                                    : (s->current + s->count - 1) % s->count;
            redraw |= SPACE_CARD_REDRAW_QR;
        }
    } else if (ev == SPACE_CARD_EV_CLICK && btn == SPACE_CARD_BTN_OK) {
        s->brightness_idx = (uint8_t)((s->brightness_idx + 1) % (sizeof(BRIGHTNESS) / sizeof(BRIGHTNESS[0])));
        redraw |= SPACE_CARD_REDRAW_BACKLIGHT;
    } else if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_OK) {
        s->big = !s->big;
        redraw |= SPACE_CARD_REDRAW_LAYOUT | SPACE_CARD_REDRAW_QR;
    }
    return redraw;
}

bool space_card_on_idle(space_card_state_t *s, uint32_t idle_ms) {
    bool want = idle_ms >= DIM_AFTER_MS;
    if (want == s->dimmed) return false;
    s->dimmed = want;
    return true;
}

uint8_t space_card_backlight(const space_card_state_t *s) {
    return s->dimmed ? DIM_PERCENT : BRIGHTNESS[s->brightness_idx % 3];
}

int32_t space_card_qr_px(const space_card_state_t *s) {
    // 屏幕 240 宽、四角圆角半径 30：一般模式二维码 176px（上面留名字、下面留小字），大模式 224px
    return s->big ? 224 : 176;
}

int space_card_qr_version(size_t len) {
    // ECC M、byte 模式，版本 1..10 的容量（字节）
    static const uint16_t CAP[] = { 14, 26, 42, 62, 84, 106, 122, 152, 180, 213 };
    for (int v = 1; v <= 10; v++) if (len <= CAP[v - 1]) return v;
    return 0;
}

int space_card_module_px(size_t url_len, int32_t px) {
    int v = space_card_qr_version(url_len);
    if (v == 0 || px <= 0) return 0;
    int modules = 17 + 4 * v + 8;          // + 两边各 4 格白边
    return (int)(px / modules);
}

void space_card_battery_text(int soc, char *out, size_t out_len) {
    if (!out || out_len == 0) return;
    if (soc < 0) { out[0] = '\0'; return; }
    if (soc > 100) soc = 100;
    snprintf(out, out_len, "%d%%", soc);
}

bool space_card_cover_idle(space_card_state_t *s, uint32_t idle_ms) {
    if (s->cover || s->count == 0 || idle_ms < COVER_AFTER_MS) return false;
    s->cover = true;
    s->big = false;
    return true;
}
