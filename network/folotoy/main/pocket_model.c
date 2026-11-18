// pocket_model.c —— 见 pocket_model.h（纯 C，host 测试：tests/test_pocket_model.c）
#include "pocket_model.h"

#include <stdio.h>
#include <string.h>

// ---------------- 菜单 ----------------
void menu_init(menu_state_t *m) {
    m->cursor = MENU_CANDLE;
}

nav_t menu_on_key(menu_state_t *m, space_card_btn_t btn, space_card_ev_t ev) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return NAV_TO_CARD;
    if (ev != SPACE_CARD_EV_CLICK) return NAV_NONE;
    if (btn == SPACE_CARD_BTN_UP) {
        if (m->cursor == 0) return NAV_NONE;   // 到顶就停（三个键的清单，绕圈容易迷路）
        m->cursor = (menu_item_t)(m->cursor - 1);
        return NAV_REDRAW;
    }
    if (btn == SPACE_CARD_BTN_DOWN) {
        if (m->cursor + 1 >= MENU_COUNT) return NAV_NONE;
        m->cursor = (menu_item_t)(m->cursor + 1);
        return NAV_REDRAW;
    }
    return m->cursor == MENU_BACK ? NAV_TO_CARD : NAV_OPEN;
}

const char *menu_item_text(menu_item_t item) {
    switch (item) {
    case MENU_CANDLE: return "蜡烛与生日歌";
    case MENU_STOPWATCH: return "计时器";
    case MENU_COUNTDOWN: return "倒数计时";
    case MENU_CAR: return "车用遥控器";
    case MENU_BACK: return "返回名片";
    default: return "";
    }
}

// ---------------- 蜡烛 ----------------
void candle_init(candle_state_t *c) {
    memset(c, 0, sizeof(*c));
    c->phase = CANDLE_LIT;
    c->age = CANDLE_AGE_DEFAULT;
    c->lang = SONG_ZH;
}

candle_do_t candle_on_key(candle_state_t *c, space_card_btn_t btn, space_card_ev_t ev) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return CANDLE_DO_EXIT;
    if (ev == SPACE_CARD_EV_OTHER) return CANDLE_DO_NONE;

    if (c->phase == CANDLE_SINGING) {   // 唱到一半：任何键都是「停」
        c->phase = CANDLE_LIT;
        return CANDLE_DO_STOP_SONG;
    }
    if (c->phase == CANDLE_OUT) {        // 熄了：确定（短 / 长）重新点燃；上下照样可以调年龄
        if (btn == SPACE_CARD_BTN_OK) {
            c->phase = CANDLE_LIT;
            return CANDLE_DO_REDRAW;
        }
    }
    if (ev == SPACE_CARD_EV_CLICK) {
        if (btn == SPACE_CARD_BTN_UP && c->age < CANDLE_AGE_MAX) { c->age++; return CANDLE_DO_REDRAW; }
        if (btn == SPACE_CARD_BTN_DOWN && c->age > CANDLE_AGE_MIN) { c->age--; return CANDLE_DO_REDRAW; }
        if (btn == SPACE_CARD_BTN_OK) {
            c->lang = SONG_ZH;
            c->phase = CANDLE_SINGING;
            return CANDLE_DO_SING;
        }
        return CANDLE_DO_NONE;
    }
    // 长按
    if (btn == SPACE_CARD_BTN_DOWN && c->phase == CANDLE_LIT) {
        c->lang = SONG_EN;
        c->phase = CANDLE_SINGING;
        return CANDLE_DO_SING;
    }
    if (btn == SPACE_CARD_BTN_OK && c->phase == CANDLE_LIT) {
        c->phase = CANDLE_OUT;
        return CANDLE_DO_BLOW_OUT;
    }
    return CANDLE_DO_NONE;
}

void candle_song_done(candle_state_t *c) {
    if (c->phase == CANDLE_SINGING) c->phase = CANDLE_LIT;
}

void candle_blown(candle_state_t *c) {
    if (c->phase == CANDLE_LIT) c->phase = CANDLE_OUT;
}

void candle_age_text(uint8_t age, char *out, size_t out_len) {
    if (!out || out_len == 0) return;
    if (age > CANDLE_AGE_MAX) age = CANDLE_AGE_MAX;
    snprintf(out, out_len, "%u", (unsigned)age);
}

// ---------------- 计时器 ----------------
void stopwatch_init(stopwatch_t *s) {
    memset(s, 0, sizeof(*s));
}

uint32_t stopwatch_elapsed(const stopwatch_t *s, uint32_t now_ms) {
    return s->base_ms + (s->running ? now_ms - s->start_ms : 0);
}

nav_t stopwatch_on_key(stopwatch_t *s, space_card_btn_t btn, space_card_ev_t ev, uint32_t now_ms) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return NAV_TO_MENU;
    if (ev != SPACE_CARD_EV_CLICK) return NAV_NONE;
    if (btn == SPACE_CARD_BTN_OK) {
        if (s->running) {
            s->base_ms += now_ms - s->start_ms;
            s->running = false;
        } else {
            s->start_ms = now_ms;
            s->running = true;
        }
        return NAV_REDRAW;
    }
    if (btn == SPACE_CARD_BTN_DOWN && !s->running && s->base_ms) {
        s->base_ms = 0;
        return NAV_REDRAW;
    }
    return NAV_NONE;
}

// ---------------- 倒数 ----------------
void countdown_init(countdown_t *c) {
    memset(c, 0, sizeof(*c));
    c->phase = CD_SET;
    c->set_s = CD_DEFAULT_S;
    c->remaining_ms = CD_DEFAULT_S * 1000u;
}

uint32_t countdown_remaining(const countdown_t *c, uint32_t now_ms) {
    if (c->phase == CD_RUNNING) {
        int32_t left = (int32_t)(c->end_ms - now_ms);
        return left > 0 ? (uint32_t)left : 0;
    }
    return c->phase == CD_DONE ? 0 : c->remaining_ms;
}

bool countdown_tick(countdown_t *c, uint32_t now_ms) {
    if (c->phase != CD_RUNNING) return false;
    if ((int32_t)(c->end_ms - now_ms) > 0) return false;
    c->phase = CD_DONE;
    c->remaining_ms = 0;
    return true;
}

static void cd_reset(countdown_t *c) {
    c->phase = CD_SET;
    c->remaining_ms = c->set_s * 1000u;
}

nav_t countdown_on_key(countdown_t *c, space_card_btn_t btn, space_card_ev_t ev, uint32_t now_ms) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return NAV_TO_MENU;
    if (ev == SPACE_CARD_EV_OTHER) return NAV_NONE;
    if (c->phase == CD_DONE) {   // 响铃中：任何键停铃，回到设定（同样的时间，方便再来一次）
        cd_reset(c);
        return NAV_REDRAW;
    }
    if (ev == SPACE_CARD_EV_LONG) {
        if (btn == SPACE_CARD_BTN_OK && c->phase != CD_SET) {
            cd_reset(c);
            return NAV_REDRAW;
        }
        return NAV_NONE;
    }
    // 短按
    if (btn == SPACE_CARD_BTN_OK) {
        if (c->phase == CD_RUNNING) {
            c->remaining_ms = countdown_remaining(c, now_ms);
            c->phase = CD_PAUSED;
        } else {
            c->end_ms = now_ms + c->remaining_ms;
            c->phase = CD_RUNNING;
        }
        return NAV_REDRAW;
    }
    if (c->phase != CD_SET) return NAV_NONE;   // 跑的时候不能改时间（避免碰到）
    if (btn == SPACE_CARD_BTN_UP && c->set_s + CD_STEP_S <= CD_MAX_S) c->set_s += CD_STEP_S;
    else if (btn == SPACE_CARD_BTN_DOWN && c->set_s >= CD_MIN_S + CD_STEP_S) c->set_s -= CD_STEP_S;
    else return NAV_NONE;
    c->remaining_ms = c->set_s * 1000u;
    return NAV_REDRAW;
}

void format_duration(uint32_t ms, bool with_tenths, char *out, size_t out_len) {
    if (!out || out_len == 0) return;
    // 倒数用「无条件进位」：剩 4.2 秒显示 00:05，到 0 才显示 00:00
    const uint32_t total_s = with_tenths ? ms / 1000u : (ms + 999u) / 1000u;
    const uint32_t h = total_s / 3600u, m = (total_s / 60u) % 60u, s = total_s % 60u;
    if (h > 0) {
        snprintf(out, out_len, "%u:%02u:%02u", (unsigned)h, (unsigned)m, (unsigned)s);
    } else if (with_tenths) {
        snprintf(out, out_len, "%02u:%02u.%u", (unsigned)m, (unsigned)s, (unsigned)((ms / 100u) % 10u));
    } else {
        snprintf(out, out_len, "%02u:%02u", (unsigned)m, (unsigned)s);
    }
}
