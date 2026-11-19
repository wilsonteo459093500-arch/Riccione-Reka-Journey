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
    // 按下 / 放开：只有 app 用得到（按住录语音讯息）；不改画面上的「最后动作」
    if (ev == SPACE_CARD_EV_PRESS || ev == SPACE_CARD_EV_RELEASE) return s->app_present ? CAR_ACT_APP : CAR_ACT_NONE;
    if (ev != SPACE_CARD_EV_CLICK && ev != SPACE_CARD_EV_LONG) return CAR_ACT_NONE;
    // 选择模式：全部交给 app（包括 上 长按 = 取消）
    if (s->app_present && s->app_select) {
        s->last = CAR_ACT_APP;
        return CAR_ACT_APP;
    }
    car_action_t a = CAR_ACT_NONE;
    if (ev == SPACE_CARD_EV_CLICK) {
        a = btn == SPACE_CARD_BTN_OK ? CAR_ACT_PLAY_PAUSE : btn == SPACE_CARD_BTN_DOWN ? CAR_ACT_NEXT : CAR_ACT_PREV;
    } else {
        if (btn == SPACE_CARD_BTN_OK) a = s->app_present ? CAR_ACT_APP : CAR_ACT_VOICE;
        else if (btn == SPACE_CARD_BTN_DOWN) a = s->app_present ? CAR_ACT_APP : CAR_ACT_NONE;
        else a = CAR_ACT_EXIT;
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
    case CAR_ACT_APP: return "Sent to app";
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

bool car_evt_encode(space_card_btn_t btn, space_card_ev_t ev, uint8_t out[2]) {
    uint8_t e;
    switch (ev) {
    case SPACE_CARD_EV_CLICK: e = CAR_EVT_CLICK; break;
    case SPACE_CARD_EV_LONG: e = CAR_EVT_LONG; break;
    case SPACE_CARD_EV_PRESS: e = CAR_EVT_PRESS; break;
    case SPACE_CARD_EV_RELEASE: e = CAR_EVT_RELEASE; break;
    default: return false;
    }
    out[0] = (uint8_t)btn;
    out[1] = e;
    return true;
}

static void copy_ascii(char *dst, const uint8_t *src, size_t len) {
    size_t j = 0;
    for (size_t i = 0; i < len && j < CAR_TEXT_MAX; i++) {
        const uint8_t c = src[i];
        dst[j++] = (c >= 0x20 && c < 0x7f) ? (char)c : '?';   // 画面字型只有英文
    }
    dst[j] = '\0';
}

bool car_cmd_apply(car_remote_state_t *s, const uint8_t *data, size_t len) {
    if (!s || !data || len < 2) return false;
    if (data[0] == CAR_CMD_MODE && len == 2 && data[1] <= 1) {
        const bool sel = data[1] == 1;
        if (!sel) s->title[0] = s->item[0] = '\0';
        if (sel == s->app_select && sel) return false;
        s->app_select = sel;
        return true;
    }
    if (data[0] == CAR_CMD_TEXT && data[1] <= 1) {
        copy_ascii(data[1] == 0 ? s->title : s->item, data + 2, len - 2);
        return true;
    }
    return false;
}

void car_remote_app_gone(car_remote_state_t *s) {
    s->app_present = false;
    s->app_select = false;
    s->title[0] = s->item[0] = '\0';
}
