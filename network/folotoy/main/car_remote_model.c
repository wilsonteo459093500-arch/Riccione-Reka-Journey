// car_remote_model.c —— 见 car_remote_model.h（纯 C，host 测试：tests/test_car_remote_model.c）
#include "car_remote_model.h"

#include <string.h>

#define CAR_BRIGHT_PERCENT 80
#define CAR_DIM_PERCENT 10
#define CAR_DIM_AFTER_MS 60000u

bool app_mode_switch(app_mode_t cur, space_card_btn_t btn, space_card_ev_t ev, app_mode_t *next) {
    if (ev != SPACE_CARD_EV_LONG) return false;
    if (cur == APP_MODE_CARD && btn == SPACE_CARD_BTN_DOWN) {
        if (next) *next = APP_MODE_CAR;
        return true;
    }
    if (cur == APP_MODE_CAR && btn == SPACE_CARD_BTN_UP) {
        if (next) *next = APP_MODE_CARD;
        return true;
    }
    return false;
}

app_mode_t app_mode_from_stored(int32_t stored, bool found) {
    return (found && stored == APP_MODE_CAR) ? APP_MODE_CAR : APP_MODE_CARD;
}

void car_remote_init(car_remote_state_t *s) {
    memset(s, 0, sizeof(*s));
}

car_action_t car_remote_on_key(car_remote_state_t *s, space_card_btn_t btn, space_card_ev_t ev) {
    s->dimmed = false;   // 叫醒，但这一下照样算（开车时不用先按一下）
    car_action_t a = CAR_ACT_NONE;
    if (ev == SPACE_CARD_EV_CLICK) {
        a = btn == SPACE_CARD_BTN_OK ? CAR_ACT_PLAY_PAUSE : btn == SPACE_CARD_BTN_DOWN ? CAR_ACT_NEXT : CAR_ACT_PREV;
    } else if (ev == SPACE_CARD_EV_LONG) {
        if (btn == SPACE_CARD_BTN_OK) a = CAR_ACT_VOICE;
        else if (btn == SPACE_CARD_BTN_UP) a = CAR_ACT_EXIT;
    }
    if (a != CAR_ACT_NONE) s->last = a;
    return a;
}

bool car_remote_on_idle(car_remote_state_t *s, uint32_t idle_ms) {
    bool want = idle_ms >= CAR_DIM_AFTER_MS;
    if (want == s->dimmed) return false;
    s->dimmed = want;
    return true;
}

uint8_t car_remote_backlight(const car_remote_state_t *s) {
    return s->dimmed ? CAR_DIM_PERCENT : CAR_BRIGHT_PERCENT;
}

uint16_t car_remote_usage(car_action_t a) {
    switch (a) {
    case CAR_ACT_PLAY_PAUSE: return CAR_USAGE_PLAY_PAUSE;
    case CAR_ACT_NEXT: return CAR_USAGE_NEXT;
    case CAR_ACT_PREV: return CAR_USAGE_PREV;
    case CAR_ACT_VOICE: return CAR_USAGE_VOICE;
    default: return 0;
    }
}

void car_remote_report(uint16_t usage, uint8_t out[2]) {
    out[0] = (uint8_t)(usage & 0xFF);
    out[1] = (uint8_t)(usage >> 8);
}

const char *car_remote_action_text(car_action_t a) {
    switch (a) {
    case CAR_ACT_PLAY_PAUSE: return "Play / Pause";
    case CAR_ACT_NEXT: return "Next";
    case CAR_ACT_PREV: return "Previous";
    case CAR_ACT_VOICE: return "Voice assistant";
    case CAR_ACT_EXIT: return "Back to card";
    default: return "";
    }
}

const char *car_remote_link_text(car_link_t link) {
    switch (link) {
    case CAR_LINK_STARTING: return "Starting Bluetooth...";
    case CAR_LINK_ADVERTISING: return "Waiting for phone";
    case CAR_LINK_CONNECTED: return "Connecting...";
    case CAR_LINK_READY: return "Connected";
    case CAR_LINK_ERROR: return "Bluetooth error";
    default: return "";
    }
}
