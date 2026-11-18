// deku_model.c —— 见 deku_model.h
#include "deku_model.h"

#include <string.h>

static uint32_t next_rand(deku_state_t *s) {
    s->rng = s->rng * 1664525u + 1013904223u;
    return s->rng >> 8;
}

static void set_face(deku_state_t *s, deku_face_t f, uint32_t now_ms) {
    s->face = f;
    s->since_ms = now_ms;
}

void deku_init(deku_state_t *s, uint32_t seed) {
    memset(s, 0, sizeof *s);
    s->line = -1;
    s->next_person = DEKU_INAMORI;
    s->rng = seed ? seed : 1;
}

size_t deku_count(deku_kind_t k) {
    size_t n = 0;
    for (size_t i = 0; i < DEKU_LINE_COUNT; i++) n += DEKU_LINES[i].kind == k;
    return n;
}

int deku_pick(deku_state_t *s, deku_kind_t k) {
    if (k >= DEKU_KINDS) return -1;
    size_t free_n = 0, total = 0;
    for (size_t i = 0; i < DEKU_LINE_COUNT && i < 256; i++) {
        if (DEKU_LINES[i].kind != k) continue;
        total++;
        if (!(s->used[k][i / 32] & (1u << (i % 32)))) free_n++;
    }
    if (total == 0) return -1;
    if (free_n == 0) {   // 一轮抽完：重来，但不要马上又是刚刚那句
        memset(s->used[k], 0, sizeof s->used[k]);
        free_n = total;
        if (total > 1 && s->line >= 0 && DEKU_LINES[s->line].kind == k) {
            s->used[k][s->line / 32] |= 1u << (s->line % 32);
            free_n--;
        }
    }
    size_t want = next_rand(s) % free_n;
    for (size_t i = 0; i < DEKU_LINE_COUNT && i < 256; i++) {
        if (DEKU_LINES[i].kind != k || (s->used[k][i / 32] & (1u << (i % 32)))) continue;
        if (want-- == 0) {
            s->used[k][i / 32] |= 1u << (i % 32);
            return (int)i;
        }
    }
    return -1;
}

int deku_find(const char *id, size_t len) {
    if (!id || len == 0 || len > DEKU_ID_MAX) return -1;
    for (size_t i = 0; i < DEKU_LINE_COUNT; i++) {
        if (strlen(DEKU_LINES[i].id) == len && memcmp(DEKU_LINES[i].id, id, len) == 0) return (int)i;
    }
    return -1;
}

static void evt_say(deku_out_t *o, int line) {
    const char *id = DEKU_LINES[line].id;
    size_t n = strlen(id);
    if (n > DEKU_ID_MAX) n = DEKU_ID_MAX;
    o->evt[0] = DEKU_EVT_SAY;
    memcpy(o->evt + 1, id, n);
    o->evt_len = 1 + n;
}

static void evt_listen(deku_out_t *o, bool on) {
    o->evt[0] = DEKU_EVT_LISTEN;
    o->evt[1] = on ? 1 : 0;
    o->evt_len = 2;
}

static void show(deku_state_t *s, int line, uint32_t now_ms, deku_out_t *o) {
    if (line < 0) {
        set_face(s, DEKU_FACE_CONFUSED, now_ms);
        s->line = -1;
    } else {
        set_face(s, DEKU_FACE_SAY, now_ms);
        s->line = line;
        if (o) evt_say(o, line);
    }
    if (o) o->action = DEKU_DO_REDRAW;
}

// 下 短按：轮到下一位有审过句子的人
static int pick_person(deku_state_t *s) {
    for (int tries = 0; tries < 3; tries++) {
        const deku_kind_t k = (deku_kind_t)s->next_person;
        s->next_person = s->next_person >= DEKU_MUSK ? DEKU_INAMORI : (uint8_t)(s->next_person + 1);
        const int line = deku_pick(s, k);
        if (line >= 0) return line;
    }
    return -1;
}

deku_out_t deku_on_key(deku_state_t *s, space_card_btn_t btn, space_card_ev_t ev, bool app_present, uint32_t now_ms) {
    deku_out_t o = { 0 };
    if (btn == SPACE_CARD_BTN_UP && ev == SPACE_CARD_EV_LONG) {
        if (s->face == DEKU_FACE_LISTEN) evt_listen(&o, false);
        o.action = DEKU_DO_EXIT;
        return o;
    }
    if (btn == SPACE_CARD_BTN_OK) {
        if (ev == SPACE_CARD_EV_PRESS && app_present && DEKU_LINE_COUNT > 0) {
            set_face(s, DEKU_FACE_LISTEN, now_ms);
            evt_listen(&o, true);
            o.action = DEKU_DO_REDRAW;
        } else if (ev == SPACE_CARD_EV_RELEASE && s->face == DEKU_FACE_LISTEN) {
            set_face(s, DEKU_FACE_THINK, now_ms);
            evt_listen(&o, false);
            o.action = DEKU_DO_REDRAW;
        } else if (ev == SPACE_CARD_EV_CLICK && !app_present) {
            show(s, deku_pick(s, DEKU_JOKE), now_ms, &o);   // 没有 app：确定也来一个笑话
            o.evt_len = 0;
        }
        return o;
    }
    if (ev != SPACE_CARD_EV_CLICK || s->face == DEKU_FACE_LISTEN) return o;
    const int line = btn == SPACE_CARD_BTN_UP ? deku_pick(s, DEKU_JOKE) : pick_person(s);
    show(s, line, now_ms, &o);
    if (!app_present) o.evt_len = 0;
    return o;
}

bool deku_on_cmd(deku_state_t *s, const uint8_t *data, size_t len, uint32_t now_ms) {
    if (!data || len == 0) return false;
    if (data[0] == DEKU_CMD_SHOW && len >= 2) {
        const int line = deku_find((const char *)data + 1, len - 1);
        if (line < 0) return false;   // app 的句库比 FoloToy 新：不显示（手机照样念）
        show(s, line, now_ms, NULL);
        return true;
    }
    if (data[0] == DEKU_CMD_UNKNOWN && len == 1) {
        set_face(s, DEKU_FACE_CONFUSED, now_ms);
        s->line = -1;
        return true;
    }
    return false;
}

bool deku_on_tick(deku_state_t *s, uint32_t now_ms, deku_out_t *out) {
    if (out) memset(out, 0, sizeof *out);
    const uint32_t dt = now_ms - s->since_ms;
    if (s->face == DEKU_FACE_LISTEN && dt >= DEKU_LISTEN_MAX_MS) {
        set_face(s, DEKU_FACE_THINK, now_ms);
        if (out) evt_listen(out, false);
        return true;
    }
    if (s->face == DEKU_FACE_THINK && dt >= DEKU_THINK_TIMEOUT_MS) {
        set_face(s, DEKU_FACE_CONFUSED, now_ms);
        s->line = -1;
        return true;
    }
    return false;
}

const char *deku_kind_name(deku_kind_t k) {
    switch (k) {
    case DEKU_JOKE: return "笑话";
    case DEKU_INAMORI: return "稻盛和夫";
    case DEKU_KUOK: return "郭鹤年";
    case DEKU_MUSK: return "Elon Musk";
    default: return "";
    }
}

// ---- 中文断行 ----
static size_t utf8_next(const char *s, uint32_t *cp) {
    const unsigned char c = (unsigned char)s[0];
    if (c < 0x80) { *cp = c; return 1; }
    if ((c >> 5) == 6 && s[1]) { *cp = ((uint32_t)(c & 0x1F) << 6) | (s[1] & 0x3F); return 2; }
    if ((c >> 4) == 14 && s[1] && s[2]) {
        *cp = ((uint32_t)(c & 0x0F) << 12) | ((uint32_t)(s[1] & 0x3F) << 6) | (s[2] & 0x3F);
        return 3;
    }
    if ((c >> 3) == 30 && s[1] && s[2] && s[3]) {
        *cp = ((uint32_t)(c & 0x07) << 18) | ((uint32_t)(s[1] & 0x3F) << 12) | ((uint32_t)(s[2] & 0x3F) << 6) | (s[3] & 0x3F);
        return 4;
    }
    *cp = '?';
    return 1;
}

static bool no_line_start(uint32_t cp) {   // 不能放行首
    static const uint32_t P[] = { 0xFF0C, 0x3002, 0x3001, 0xFF01, 0xFF1F, 0xFF1B, 0xFF1A, 0x300D, 0x300F, 0xFF09,
                                  0x300B, 0x2026, 0x2014, 0x00B7, ',', '.', '!', '?', ';', ':', ')', '%' };
    for (size_t i = 0; i < sizeof P / sizeof P[0]; i++) if (P[i] == cp) return true;
    return false;
}

static bool no_line_end(uint32_t cp) {     // 不能放行尾
    return cp == 0x300C || cp == 0x300E || cp == 0xFF08 || cp == 0x300A || cp == '(' || cp == 0x201C;
}

static bool is_word(uint32_t cp) {          // 英文、数字连在一起的一个词
    return (cp >= 'a' && cp <= 'z') || (cp >= 'A' && cp <= 'Z') || (cp >= '0' && cp <= '9') || cp == '-' || cp == '\'' || cp == '%';
}

#define WRAP_MAX_TOK 160
typedef struct { size_t at, len; int w; uint32_t first, last; } tok_t;

int deku_wrap(const char *in, char *out, size_t cap, int max_w, deku_width_fn width, void *ctx) {
    if (!out || cap == 0) return 0;
    out[0] = 0;
    if (!in || !width) return 0;
    // 1. 切成一个个「不能再拆」的单位：一个中文字 / 标点，或一个英文词
    tok_t tok[WRAP_MAX_TOK];
    size_t n = 0, i = 0;
    while (in[i] && n < WRAP_MAX_TOK) {
        uint32_t cp;
        size_t step = utf8_next(in + i, &cp);
        tok_t t = { i, step, width(cp, ctx), cp, cp };
        while (is_word(cp)) {
            const char *p = in + t.at + t.len;
            if (!*p) break;
            uint32_t c2;
            const size_t s2 = utf8_next(p, &c2);
            if (!is_word(c2)) break;
            t.w += width(c2, ctx);
            t.len += s2;
            t.last = c2;
        }
        tok[n++] = t;
        i = t.at + t.len;
    }
    // 2. 一行一行排；遇到不能放行首的标点 / 不能放行尾的括号，就把前一个单位一起移下去
    size_t start[WRAP_MAX_TOK + 1];
    int lines = 0;
    size_t line_from = 0;
    int line_w = 0;
    for (size_t k = 0; k < n; k++) {
        if (tok[k].first == '\n') {   // 句子里本来就有的换行
            start[lines++] = line_from;
            line_from = k + 1;
            line_w = 0;
            continue;
        }
        if (k == line_from && tok[k].first == ' ') {   // 行首空白不要
            line_from = k + 1;
            continue;
        }
        if (line_w + tok[k].w <= max_w || k == line_from) {
            line_w += tok[k].w;
            continue;
        }
        size_t brk = k;   // 新的一行从 brk 开始
        while (brk - line_from >= 2 && no_line_start(tok[brk].first)) brk--;   // 「。」」连着两个也一起
        while (brk - line_from >= 2 && no_line_end(tok[brk - 1].first)) brk--;
        start[lines++] = line_from;
        line_from = brk;
        line_w = 0;
        for (size_t j = brk; j <= k; j++) line_w += tok[j].w;
    }
    start[lines++] = line_from;
    // 3. 接起来
    size_t o = 0;
    for (int L = 0; L < lines; L++) {
        const size_t a = start[L];
        size_t b = L + 1 < lines ? start[L + 1] : n;
        while (b > a && (tok[b - 1].first == ' ' || tok[b - 1].first == '\n')) b--;   // 行尾空白 / 原来的换行不要
        if (L > 0 && o + 1 < cap) out[o++] = '\n';
        for (size_t k = a; k < b; k++) {
            if (o + tok[k].len >= cap) { out[o] = 0; return L + 1; }
            memcpy(out + o, in + tok[k].at, tok[k].len);
            o += tok[k].len;
        }
    }
    out[o] = 0;
    return lines;
}
