// find_model.c —— 见 find_model.h
#include "find_model.h"

#include <string.h>

void find_init(find_state_t *s) {
    memset(s, 0, sizeof *s);
}

int find_cmd_parse(const uint8_t *data, size_t len) {
    if (!data || len != 2 || data[0] != FIND_CMD) return -1;
    return data[1] ? 1 : 0;
}

void find_evt_encode(bool ringing, find_stop_t why, uint8_t out[2]) {
    out[0] = FIND_EVT;
    out[1] = ringing ? FIND_EVT_RINGING
           : why == FIND_STOP_KEY ? FIND_EVT_FOUND
           : why == FIND_STOP_TIMEOUT ? FIND_EVT_TIMEOUT
           : FIND_EVT_STOPPED;
}

bool find_start(find_state_t *s, uint32_t now_ms) {
    const bool was = s->active;
    s->active = true;
    s->started_ms = now_ms;
    s->swallow = FIND_SWALLOW_NONE;   // 开始响之后的按键是「停」，不是上一次的尾巴
    return !was;
}

bool find_stop(find_state_t *s) {
    const bool was = s->active;
    s->active = false;
    return was;
}

find_stop_t find_on_tick(find_state_t *s, uint32_t now_ms) {
    if (s->swallow == FIND_SWALLOW_CLICK && (int32_t)(now_ms - s->swallow_until_ms) >= 0) s->swallow = FIND_SWALLOW_NONE;
    if (!s->active) return FIND_STOP_NONE;
    if (now_ms - s->started_ms >= FIND_TIMEOUT_MS) {
        s->active = false;
        return FIND_STOP_TIMEOUT;
    }
    return FIND_STOP_NONE;
}

bool find_flash_red(const find_state_t *s, uint32_t now_ms) {
    return ((now_ms - s->started_ms) / FIND_FLASH_MS) % 2 == 0;
}

bool find_on_key(find_state_t *s, space_card_ev_t ev, uint32_t now_ms, find_stop_t *stopped) {
    if (stopped) *stopped = FIND_STOP_NONE;
    if (s->active) {
        s->active = false;
        if (stopped) *stopped = FIND_STOP_KEY;
        // 按下去那一下停的：吃到放开为止；如果收到的已经是放开 / 单击 / 长按，照它往后接
        if (ev == SPACE_CARD_EV_RELEASE) {
            s->swallow = FIND_SWALLOW_CLICK;
            s->swallow_until_ms = now_ms + FIND_SWALLOW_MS;
        } else if (ev == SPACE_CARD_EV_CLICK) {
            s->swallow = FIND_SWALLOW_NONE;
        } else {
            s->swallow = FIND_SWALLOW_UNTIL_RELEASE;
        }
        return true;
    }
    switch (s->swallow) {
    case FIND_SWALLOW_UNTIL_RELEASE:
        if (ev == SPACE_CARD_EV_RELEASE) {
            s->swallow = FIND_SWALLOW_CLICK;
            s->swallow_until_ms = now_ms + FIND_SWALLOW_MS;
        }
        return true;   // 长按、放开都吃掉
    case FIND_SWALLOW_CLICK:
        if ((int32_t)(now_ms - s->swallow_until_ms) >= 0) {
            s->swallow = FIND_SWALLOW_NONE;
            return false;
        }
        if (ev == SPACE_CARD_EV_CLICK) {
            s->swallow = FIND_SWALLOW_NONE;
            return true;   // 停的那一下的单击判定
        }
        if (ev == SPACE_CARD_EV_PRESS) {
            s->swallow = FIND_SWALLOW_NONE;   // 新的一下：照常
            return false;
        }
        return true;
    default:
        return false;
    }
}
