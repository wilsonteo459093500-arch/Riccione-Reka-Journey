// 「车用遥控器」纯逻辑的 host 测试（不需要 ESP-IDF）：
//   cc -std=c11 -Wall -Wextra -Werror -Imain main/space_card_model.c main/car_remote_model.c tests/test_car_remote_model.c -o /tmp/t && /tmp/t
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "car_remote_model.h"

static void test_mode_switch(void) {
    app_mode_t next = APP_MODE_CARD;
    // 名片：下 长按 → 车用；其他键不换
    assert(app_mode_switch(APP_MODE_CARD, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_LONG, &next) && next == APP_MODE_CAR);
    assert(!app_mode_switch(APP_MODE_CARD, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK, &next));
    assert(!app_mode_switch(APP_MODE_CARD, SPACE_CARD_BTN_OK, SPACE_CARD_EV_LONG, &next));   // 留给大二维码
    assert(!app_mode_switch(APP_MODE_CARD, SPACE_CARD_BTN_UP, SPACE_CARD_EV_LONG, &next));
    // 车用：上 长按 → 名片
    assert(app_mode_switch(APP_MODE_CAR, SPACE_CARD_BTN_UP, SPACE_CARD_EV_LONG, &next) && next == APP_MODE_CARD);
    assert(!app_mode_switch(APP_MODE_CAR, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_LONG, &next));
    assert(!app_mode_switch(APP_MODE_CAR, SPACE_CARD_BTN_OK, SPACE_CARD_EV_LONG, &next));    // 留给语音助理
    assert(app_mode_switch(APP_MODE_CARD, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_LONG, NULL));

    // 存在机器里的值
    assert(app_mode_from_stored(1, true) == APP_MODE_CAR);
    assert(app_mode_from_stored(0, true) == APP_MODE_CARD);
    assert(app_mode_from_stored(1, false) == APP_MODE_CARD);   // 没存过 → 名片
    assert(app_mode_from_stored(7, true) == APP_MODE_CARD);    // 乱值 → 名片
}

static void test_keys(void) {
    car_remote_state_t s;
    car_remote_init(&s);
    assert(car_remote_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK) == CAR_ACT_PLAY_PAUSE);
    assert(s.last == CAR_ACT_PLAY_PAUSE);
    assert(car_remote_on_key(&s, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK) == CAR_ACT_NEXT);
    assert(car_remote_on_key(&s, SPACE_CARD_BTN_UP, SPACE_CARD_EV_CLICK) == CAR_ACT_PREV);
    assert(car_remote_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_LONG) == CAR_ACT_VOICE);
    assert(car_remote_on_key(&s, SPACE_CARD_BTN_UP, SPACE_CARD_EV_LONG) == CAR_ACT_EXIT);
    // 下 长按、其他事件：没动作，也不改「最后动作」
    assert(car_remote_on_key(&s, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_LONG) == CAR_ACT_NONE);
    assert(car_remote_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_OTHER) == CAR_ACT_NONE);
    assert(s.last == CAR_ACT_EXIT);
}

static void test_dim_does_not_eat_key(void) {
    car_remote_state_t s;
    car_remote_init(&s);
    assert(car_remote_backlight(&s) == 80);
    assert(!car_remote_on_idle(&s, 59999));
    assert(car_remote_on_idle(&s, 60000));
    assert(s.dimmed && car_remote_backlight(&s) == 10);
    assert(!car_remote_on_idle(&s, 70000));   // 已经调暗，不用再改
    // 调暗时按键：叫醒，而且这一下照样送出（跟名片模式不同）
    assert(car_remote_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK) == CAR_ACT_PLAY_PAUSE);
    assert(!s.dimmed && car_remote_backlight(&s) == 80);
}

static void test_usage_and_report(void) {
    assert(car_remote_usage(CAR_ACT_PLAY_PAUSE) == 0x00CD);
    assert(car_remote_usage(CAR_ACT_NEXT) == 0x00B5);
    assert(car_remote_usage(CAR_ACT_PREV) == 0x00B6);
    assert(car_remote_usage(CAR_ACT_VOICE) == 0x00CF);
    assert(car_remote_usage(CAR_ACT_EXIT) == 0);   // 回名片不送给手机
    assert(car_remote_usage(CAR_ACT_NONE) == 0);
    uint8_t r[2];
    car_remote_report(0x00CD, r);
    assert(r[0] == 0xCD && r[1] == 0x00);
    car_remote_report(0x0221, r);
    assert(r[0] == 0x21 && r[1] == 0x02);
    car_remote_report(0, r);                       // 放开
    assert(r[0] == 0 && r[1] == 0);
}

static void test_text(void) {
    assert(strcmp(car_remote_action_text(CAR_ACT_VOICE), "Voice assistant") == 0);
    assert(car_remote_action_text(CAR_ACT_NONE)[0] == '\0');
    assert(strcmp(car_remote_link_text(CAR_LINK_READY), "Connected") == 0);
    assert(strcmp(car_remote_link_text(CAR_LINK_ADVERTISING), "Waiting for phone") == 0);
    // 画面只有英文字型：所有字都要是 ASCII
    for (int a = CAR_ACT_NONE; a <= CAR_ACT_EXIT; a++)
        for (const char *p = car_remote_action_text((car_action_t)a); *p; p++) assert((unsigned char)*p < 0x80);
    for (int l = CAR_LINK_STARTING; l <= CAR_LINK_ERROR; l++)
        for (const char *p = car_remote_link_text((car_link_t)l); *p; p++) assert((unsigned char)*p < 0x80);
}

int main(void) {
    test_mode_switch();
    test_keys();
    test_dim_does_not_eat_key();
    test_usage_and_report();
    test_text();
    printf("test_car_remote_model: OK\n");
    return 0;
}
