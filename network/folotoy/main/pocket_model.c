// pocket_model.c —— 见 pocket_model.h（纯 C，host 测试：tests/test_pocket_model.c）
#include "pocket_model.h"

#include <stdio.h>
#include <string.h>

// ---------------- 菜单 ----------------
void menu_init(menu_state_t *m) {
    m->cursor = MENU_CANDLE;
    m->top = 0;
}

static void menu_scroll(menu_state_t *m) {
    if ((int)m->cursor < m->top) m->top = (uint8_t)m->cursor;
    if ((int)m->cursor >= m->top + MENU_VISIBLE) m->top = (uint8_t)(m->cursor - MENU_VISIBLE + 1);
}

nav_t menu_on_key(menu_state_t *m, space_card_btn_t btn, space_card_ev_t ev) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return NAV_TO_CARD;
    if (ev != SPACE_CARD_EV_CLICK) return NAV_NONE;
    if (btn == SPACE_CARD_BTN_UP) {
        if (m->cursor == 0) return NAV_NONE;   // 到顶就停（三个键的清单，绕圈容易迷路）
        m->cursor = (menu_item_t)(m->cursor - 1);
        menu_scroll(m);
        return NAV_REDRAW;
    }
    if (btn == SPACE_CARD_BTN_DOWN) {
        if (m->cursor + 1 >= MENU_COUNT) return NAV_NONE;
        m->cursor = (menu_item_t)(m->cursor + 1);
        menu_scroll(m);
        return NAV_REDRAW;
    }
    return m->cursor == MENU_BACK ? NAV_TO_CARD : NAV_OPEN;
}

const char *menu_item_text(menu_item_t item) {
    switch (item) {
    case MENU_CANDLE: return "蜡烛与生日歌";
    case MENU_MUYU: return "木鱼";
    case MENU_FLASHLIGHT: return "手电筒";
    case MENU_STOPWATCH: return "计时器";
    case MENU_COUNTDOWN: return "倒数计时";
    case MENU_POMODORO: return "番茄钟";
    case MENU_STACK: return "叠叠乐";
    case MENU_FALL: return "落落方块";
    case MENU_SIMON: return "记忆三色";
    case MENU_FORTUNE: return "求签";
    case MENU_LOTTERY: return "抽奖";
    case MENU_BUBBLE: return "泡泡纸";
    case MENU_MASH: return "狂按挑战";
    case MENU_SQUISH: return "捏捏乐";
    case MENU_DEKU: return "S.T.A.R 讲笑话";
    case MENU_NEWS: return "每日晨报";
    case MENU_CAR: return "车用遥控器";
    case MENU_BACK: return "返回名片";
    default: return "";
    }
}

const char *menu_section(menu_item_t item) {
    if (item <= MENU_POMODORO) return "工具";
    if (item <= MENU_LOTTERY) return "游戏";
    if (item <= MENU_SQUISH) return "解压";
    if (item == MENU_DEKU) return "小助理";
    if (item == MENU_NEWS) return "资讯";
    return "";
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

// ---------------- 木鱼 ----------------
void muyu_init(muyu_t *m, uint32_t stored_count) {
    memset(m, 0, sizeof(*m));
    m->count = stored_count;
}

int muyu_on_key(muyu_t *m, space_card_btn_t btn, space_card_ev_t ev, uint32_t now_ms) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return MUYU_EXIT;
    if (ev != SPACE_CARD_EV_CLICK) return 0;
    if (btn == SPACE_CARD_BTN_OK) {
        m->count++;
        if (m->auto_on) m->next_ms = now_ms + MUYU_AUTO_MS;   // 手敲一下，自动的节拍从这里重算
        return MUYU_HIT;
    }
    m->auto_on = !m->auto_on;
    m->next_ms = now_ms + MUYU_AUTO_MS;
    return MUYU_TOGGLE;
}

bool muyu_tick(muyu_t *m, uint32_t now_ms) {
    if (!m->auto_on || (int32_t)(now_ms - m->next_ms) < 0) return false;
    m->count++;
    m->next_ms = now_ms + MUYU_AUTO_MS;
    return true;
}

// ---------------- 手电筒 ----------------
uint32_t flashlight_color(uint8_t idx) {
    static const uint32_t C[FLASH_COLORS] = { 0xFFFFFF, 0xFFD9A0, 0xFF2A1A };
    return C[idx % FLASH_COLORS];
}

const char *flashlight_name(uint8_t idx) {
    static const char *const N[FLASH_COLORS] = { "白光", "暖光", "红光" };
    return N[idx % FLASH_COLORS];
}

nav_t flashlight_on_key(uint8_t *idx, space_card_btn_t btn, space_card_ev_t ev) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return NAV_TO_MENU;
    if (ev != SPACE_CARD_EV_CLICK || btn == SPACE_CARD_BTN_OK) return NAV_NONE;
    *idx = (uint8_t)((*idx + (btn == SPACE_CARD_BTN_DOWN ? 1 : FLASH_COLORS - 1)) % FLASH_COLORS);
    return NAV_REDRAW;
}

// ---------------- 番茄钟 ----------------
static void pomo_set(pomodoro_t *p, bool focus) {
    p->focus = focus;
    countdown_init(&p->cd);
    p->cd.set_s = focus ? POMO_FOCUS_S : POMO_BREAK_S;
    p->cd.remaining_ms = p->cd.set_s * 1000u;
}

void pomodoro_init(pomodoro_t *p) {
    memset(p, 0, sizeof(*p));
    pomo_set(p, true);
}

bool pomodoro_tick(pomodoro_t *p, uint32_t now_ms) {
    if (!countdown_tick(&p->cd, now_ms)) return false;
    if (p->focus) p->done++;
    p->ringing = true;
    return true;
}

nav_t pomodoro_on_key(pomodoro_t *p, space_card_btn_t btn, space_card_ev_t ev, uint32_t now_ms) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return NAV_TO_MENU;
    if (ev != SPACE_CARD_EV_CLICK && ev != SPACE_CARD_EV_LONG) return NAV_NONE;
    if (p->ringing) {   // 停铃，马上开始下一段（专注 ↔ 休息）
        p->ringing = false;
        pomo_set(p, !p->focus);
        countdown_on_key(&p->cd, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK, now_ms);
        return NAV_REDRAW;
    }
    if (btn != SPACE_CARD_BTN_OK) return NAV_NONE;   // 番茄钟不调时间（固定 25 / 5）
    if (ev == SPACE_CARD_EV_LONG) {
        pomo_set(p, p->focus);
        return NAV_REDRAW;
    }
    return countdown_on_key(&p->cd, btn, ev, now_ms);
}
