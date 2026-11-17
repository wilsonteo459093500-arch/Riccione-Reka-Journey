// SPACE 名片 app 纯逻辑的 host 测试（不需要 ESP-IDF）：
//   cc -std=c11 -Wall -Wextra -Werror -Imain main/space_card_model.c tests/test_space_card_model.c -o /tmp/t && /tmp/t
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "space_card_model.h"

static void test_tag_url(void) {
    char out[SPACE_CARD_URL_MAX + 1];
    assert(space_card_tag_url("https://space.example/c", out, sizeof out));
    assert(strcmp(out, "https://space.example/c?s=folotoy") == 0);
    assert(space_card_tag_url("https://space.example/c?e=abc", out, sizeof out));
    assert(strcmp(out, "https://space.example/c?e=abc&s=folotoy") == 0);
    assert(space_card_tag_url("https://space.example/c?s=nfc", out, sizeof out));   // 已经有 s= 就不加
    assert(strcmp(out, "https://space.example/c?s=nfc") == 0);
    assert(space_card_tag_url("https://space.example/c?src=x", out, sizeof out));   // src= 不是 s=
    assert(strcmp(out, "https://space.example/c?src=x&s=folotoy") == 0);
    assert(space_card_tag_url("https://space.example/c\n", out, sizeof out));       // 尾巴的换行去掉
    assert(strcmp(out, "https://space.example/c?s=folotoy") == 0);
    assert(!space_card_tag_url("http://space.example/c", out, sizeof out));         // 只收 https
    assert(out[0] == '\0');
    assert(!space_card_tag_url("https://a b/c", out, sizeof out));
    assert(!space_card_tag_url("https://x/c#top", out, sizeof out));
    assert(!space_card_tag_url("", out, sizeof out));
    char tiny[10];
    assert(!space_card_tag_url("https://space.example/c", tiny, sizeof tiny));     // 放不下
    char longurl[260];
    memset(longurl, 'a', sizeof longurl);
    memcpy(longurl, "https://", 8);
    longurl[sizeof longurl - 1] = '\0';
    assert(!space_card_tag_url(longurl, out, sizeof out));
}

static void test_init_and_keys(void) {
    space_card_state_t s;
    space_card_init(&s, "https://space.example/c", "Wilson Teo", "", "");
    assert(s.count == 1);
    assert(strcmp(s.links[0].label, "Wilson Teo") == 0);
    // 只有一个网址：上下键不用重画
    assert(space_card_on_key(&s, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK) == SPACE_CARD_REDRAW_NONE);

    space_card_init(&s, "https://space.example/c", "", "https://space.example/c?e=11111111-2222-4333-8444-555555555555", "BNI 早餐会");
    assert(s.count == 2);
    assert(strcmp(s.links[0].label, "Scan to connect") == 0);
    assert(strncmp(s.links[1].label, "BNI ", 4) == 0 && strchr(s.links[1].label, '?'));   // 中文换成 ?
    assert(space_card_on_key(&s, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK) == SPACE_CARD_REDRAW_QR);
    assert(s.current == 1);
    assert(space_card_on_key(&s, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK) == SPACE_CARD_REDRAW_QR);
    assert(s.current == 0);
    assert(space_card_on_key(&s, SPACE_CARD_BTN_UP, SPACE_CARD_EV_CLICK) == SPACE_CARD_REDRAW_QR);
    assert(s.current == 1);

    // 亮度循环
    assert(space_card_backlight(&s) == 100);
    assert(space_card_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK) == SPACE_CARD_REDRAW_BACKLIGHT);
    assert(space_card_backlight(&s) == 60);
    space_card_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK);
    assert(space_card_backlight(&s) == 30);
    space_card_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK);
    assert(space_card_backlight(&s) == 100);

    // 长按：大二维码
    assert(space_card_qr_px(&s) == 176);
    assert(space_card_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_LONG) == (SPACE_CARD_REDRAW_LAYOUT | SPACE_CARD_REDRAW_QR));
    assert(s.big && space_card_qr_px(&s) == 224);
    assert(space_card_on_key(&s, SPACE_CARD_BTN_UP, SPACE_CARD_EV_OTHER) == SPACE_CARD_REDRAW_NONE);

    // 第一个网址不对 → 没有可显示的
    space_card_init(&s, "http://bad", "x", "https://ok/c", "y");
    assert(s.count == 0);
}

static void test_idle(void) {
    space_card_state_t s;
    space_card_init(&s, "https://space.example/c", "W", NULL, NULL);
    assert(!space_card_on_idle(&s, 1000));
    assert(space_card_on_idle(&s, 60000));        // 一分钟没按 → 调暗
    assert(s.dimmed && space_card_backlight(&s) == 15);
    assert(!space_card_on_idle(&s, 90000));       // 已经暗了，不重复
    // 调暗时按键：只叫醒，不切换
    assert(space_card_on_key(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK) == SPACE_CARD_REDRAW_BACKLIGHT);
    assert(!s.dimmed && space_card_backlight(&s) == 100);
}

static void test_qr_size(void) {
    assert(space_card_qr_version(14) == 1);
    assert(space_card_qr_version(15) == 2);
    assert(space_card_qr_version(84) == 5);
    assert(space_card_qr_version(214) == 0);
    // 一般名片网址（~40 字）：版本 3 → 29+8 = 37 格；176px → 每格 4px
    assert(space_card_module_px(strlen("https://space-wilson.vercel.app/c?s=folotoy"), 176) == 4);
    // 活动网址（~90 字）：版本 6 → 41+8 = 49 格；176px → 3px、大模式 224px → 4px
    const char *ev = "https://space-wilson.vercel.app/c?e=11111111-2222-4333-8444-555555555555&s=folotoy";
    assert(space_card_module_px(strlen(ev), 176) == 3);
    assert(space_card_module_px(strlen(ev), 224) == 4);
    assert(space_card_module_px(300, 176) == 0);
}

static void test_battery(void) {
    char b[8];
    space_card_battery_text(87, b, sizeof b);
    assert(strcmp(b, "87%") == 0);
    space_card_battery_text(140, b, sizeof b);
    assert(strcmp(b, "100%") == 0);
    space_card_battery_text(-1, b, sizeof b);
    assert(b[0] == '\0');
}

int main(void) {
    test_tag_url();
    test_init_and_keys();
    test_idle();
    test_qr_size();
    test_battery();
    printf("test_space_card_model: OK\n");
    return 0;
}
