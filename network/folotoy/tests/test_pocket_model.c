// 口袋机（菜单 / 蜡烛 / 计时器 / 倒数）纯逻辑的 host 测试：
//   cc -std=c11 -Wall -Wextra -Werror -Imain main/pocket_model.c tests/test_pocket_model.c -o /tmp/t && /tmp/t
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "pocket_model.h"

#define UP SPACE_CARD_BTN_UP
#define DN SPACE_CARD_BTN_DOWN
#define OK SPACE_CARD_BTN_OK
#define CLICK SPACE_CARD_EV_CLICK
#define LONG SPACE_CARD_EV_LONG

static void test_menu(void) {
    menu_state_t m;
    menu_init(&m);
    assert(m.cursor == MENU_CANDLE);
    assert(menu_on_key(&m, UP, CLICK) == NAV_NONE);          // 到顶就停
    assert(menu_on_key(&m, DN, CLICK) == NAV_REDRAW && m.cursor == MENU_MUYU);
    assert(menu_on_key(&m, OK, CLICK) == NAV_OPEN);
    for (int i = 0; i < MENU_COUNT; i++) menu_on_key(&m, DN, CLICK);
    assert(m.cursor == MENU_BACK);                            // 到底就停
    assert(menu_on_key(&m, DN, CLICK) == NAV_NONE);
    assert(menu_on_key(&m, OK, CLICK) == NAV_TO_CARD);        // 「返回名片」
    assert(menu_on_key(&m, UP, LONG) == NAV_TO_CARD);
    assert(menu_on_key(&m, OK, LONG) == NAV_NONE);
    for (int i = 0; i < MENU_COUNT; i++) assert(menu_item_text((menu_item_t)i)[0] != '\0');
    // 卷动：游标一直在画面里（top ≤ cursor < top + 5）
    menu_init(&m);
    for (int i = 0; i < MENU_COUNT - 1; i++) {
        menu_on_key(&m, DN, CLICK);
        assert(m.top <= (int)m.cursor && (int)m.cursor < m.top + MENU_VISIBLE);
    }
    assert(m.top == MENU_COUNT - MENU_VISIBLE);
    for (int i = 0; i < 3; i++) menu_on_key(&m, UP, CLICK);      // 往回走：还在画面里就不卷
    assert(m.top == MENU_COUNT - MENU_VISIBLE);
    for (int i = 0; i < MENU_COUNT; i++) {
        menu_on_key(&m, UP, CLICK);
        assert(m.top <= (int)m.cursor && (int)m.cursor < m.top + MENU_VISIBLE);
    }
    assert(m.top == 0 && m.cursor == 0);
    assert(strcmp(menu_section(MENU_POMODORO), "工具") == 0);
    assert(strcmp(menu_section(MENU_STACK), "游戏") == 0);
    assert(strcmp(menu_section(MENU_LOTTERY), "游戏") == 0);
    assert(strcmp(menu_section(MENU_BUBBLE), "解压") == 0 && strcmp(menu_section(MENU_SQUISH), "解压") == 0);
    assert(strcmp(menu_section(MENU_DEKU), "小助理") == 0);
    assert(menu_section(MENU_CAR)[0] == '\0');
}

static void test_candle(void) {
    candle_state_t c;
    candle_init(&c);
    assert(c.phase == CANDLE_LIT && c.age == CANDLE_AGE_DEFAULT);
    // 年龄
    assert(candle_on_key(&c, UP, CLICK) == CANDLE_DO_REDRAW && c.age == CANDLE_AGE_DEFAULT + 1);
    c.age = CANDLE_AGE_MAX;
    assert(candle_on_key(&c, UP, CLICK) == CANDLE_DO_NONE && c.age == CANDLE_AGE_MAX);
    c.age = 0;
    assert(candle_on_key(&c, DN, CLICK) == CANDLE_DO_NONE && c.age == 0);
    // 确定 = 唱华语、下长按 = 唱英语
    assert(candle_on_key(&c, OK, CLICK) == CANDLE_DO_SING && c.lang == SONG_ZH && c.phase == CANDLE_SINGING);
    // 唱的时候按键 → 停歌，不改年龄
    assert(candle_on_key(&c, UP, CLICK) == CANDLE_DO_STOP_SONG && c.phase == CANDLE_LIT && c.age == 0);
    assert(candle_on_key(&c, DN, LONG) == CANDLE_DO_SING && c.lang == SONG_EN);
    candle_blown(&c);                                    // 唱歌时不会被吹熄（麦克风听得到歌）
    assert(c.phase == CANDLE_SINGING);
    candle_song_done(&c);
    assert(c.phase == CANDLE_LIT);
    candle_blown(&c);
    assert(c.phase == CANDLE_OUT);
    // 熄了：上下照样调年龄，确定重新点燃
    assert(candle_on_key(&c, UP, CLICK) == CANDLE_DO_REDRAW && c.phase == CANDLE_OUT && c.age == 1);
    assert(candle_on_key(&c, OK, CLICK) == CANDLE_DO_REDRAW && c.phase == CANDLE_LIT);
    // 确定长按 = 用按键熄灭
    assert(candle_on_key(&c, OK, LONG) == CANDLE_DO_BLOW_OUT && c.phase == CANDLE_OUT);
    assert(candle_on_key(&c, OK, LONG) == CANDLE_DO_REDRAW && c.phase == CANDLE_LIT);
    // 上长按：任何时候都回菜单
    assert(candle_on_key(&c, UP, LONG) == CANDLE_DO_EXIT);
    c.phase = CANDLE_SINGING;
    assert(candle_on_key(&c, UP, LONG) == CANDLE_DO_EXIT);

    char t[4];
    candle_age_text(7, t, sizeof t);
    assert(strcmp(t, "7") == 0);
    candle_age_text(42, t, sizeof t);
    assert(strcmp(t, "42") == 0);
    candle_age_text(200, t, sizeof t);
    assert(strcmp(t, "99") == 0);
}

static void test_stopwatch(void) {
    stopwatch_t s;
    stopwatch_init(&s);
    assert(stopwatch_elapsed(&s, 5000) == 0);
    assert(stopwatch_on_key(&s, OK, CLICK, 1000) == NAV_REDRAW && s.running);
    assert(stopwatch_elapsed(&s, 3500) == 2500);
    assert(stopwatch_on_key(&s, DN, CLICK, 3500) == NAV_NONE);   // 跑的时候不能归零
    stopwatch_on_key(&s, OK, CLICK, 4000);                        // 暂停
    assert(!s.running && stopwatch_elapsed(&s, 99999) == 3000);
    stopwatch_on_key(&s, OK, CLICK, 10000);                       // 继续
    assert(stopwatch_elapsed(&s, 11000) == 4000);
    stopwatch_on_key(&s, OK, CLICK, 11000);
    assert(stopwatch_on_key(&s, DN, CLICK, 12000) == NAV_REDRAW && stopwatch_elapsed(&s, 12000) == 0);
    assert(stopwatch_on_key(&s, UP, LONG, 0) == NAV_TO_MENU);
    // 时间回绕（uint32 毫秒约 49 天回到 0）也算得对
    stopwatch_init(&s);
    stopwatch_on_key(&s, OK, CLICK, 0xFFFFFF00u);
    assert(stopwatch_elapsed(&s, 0x100u) == 0x200u);
}

static void test_countdown(void) {
    countdown_t c;
    countdown_init(&c);
    assert(c.phase == CD_SET && countdown_remaining(&c, 0) == 300000);
    assert(countdown_on_key(&c, UP, CLICK, 0) == NAV_REDRAW && c.set_s == 360);
    countdown_on_key(&c, DN, CLICK, 0);
    countdown_on_key(&c, DN, CLICK, 0);
    assert(c.set_s == 240 && countdown_remaining(&c, 0) == 240000);
    for (int i = 0; i < 10; i++) countdown_on_key(&c, DN, CLICK, 0);
    assert(c.set_s == CD_MIN_S);                                   // 最少 1 分钟
    for (int i = 0; i < 200; i++) countdown_on_key(&c, UP, CLICK, 0);
    assert(c.set_s == CD_MAX_S);                                   // 最多 99 分钟
    c.set_s = 60;
    c.remaining_ms = 60000;
    // 开始 → 跑 → 暂停 → 继续
    assert(countdown_on_key(&c, OK, CLICK, 1000) == NAV_REDRAW && c.phase == CD_RUNNING);
    assert(countdown_remaining(&c, 21000) == 40000);
    assert(countdown_on_key(&c, UP, CLICK, 21000) == NAV_NONE && c.set_s == 60);   // 跑的时候不能改
    countdown_on_key(&c, OK, CLICK, 21000);
    assert(c.phase == CD_PAUSED && countdown_remaining(&c, 99999) == 40000);
    countdown_on_key(&c, OK, CLICK, 50000);
    assert(!countdown_tick(&c, 89999));
    assert(countdown_tick(&c, 90000) && c.phase == CD_DONE && countdown_remaining(&c, 90000) == 0);
    assert(!countdown_tick(&c, 95000));                            // 只响一次开始
    // 时间到：任何键停铃，回到同样的设定
    assert(countdown_on_key(&c, DN, CLICK, 96000) == NAV_REDRAW && c.phase == CD_SET && countdown_remaining(&c, 0) == 60000);
    // 确定长按：跑到一半归零
    countdown_on_key(&c, OK, CLICK, 0);
    assert(countdown_on_key(&c, OK, LONG, 10000) == NAV_REDRAW && c.phase == CD_SET && c.remaining_ms == 60000);
    assert(countdown_on_key(&c, UP, LONG, 0) == NAV_TO_MENU);
}

static void test_format(void) {
    char b[16];
    format_duration(0, true, b, sizeof b);
    assert(strcmp(b, "00:00.0") == 0);
    format_duration(65432, true, b, sizeof b);
    assert(strcmp(b, "01:05.4") == 0);
    format_duration(3723000, true, b, sizeof b);
    assert(strcmp(b, "1:02:03") == 0);
    format_duration(300000, false, b, sizeof b);
    assert(strcmp(b, "05:00") == 0);
    format_duration(4200, false, b, sizeof b);                     // 倒数：剩 4.2 秒显示 00:05
    assert(strcmp(b, "00:05") == 0);
    format_duration(0, false, b, sizeof b);
    assert(strcmp(b, "00:00") == 0);
    // 画面只用大数字字型（0-9 : .）：确认不会出现别的字
    format_duration(5999999, true, b, sizeof b);
    for (const char *p = b; *p; p++) assert(strchr("0123456789:.", *p));
}

static void test_muyu(void) {
    muyu_t m;
    muyu_init(&m, 41);
    assert(muyu_on_key(&m, OK, CLICK, 0) == MUYU_HIT && m.count == 42);
    assert(!muyu_tick(&m, 99999));                                  // 没开自动：不会自己敲
    assert(muyu_on_key(&m, DN, CLICK, 1000) == MUYU_TOGGLE && m.auto_on);
    assert(!muyu_tick(&m, 1999));
    assert(muyu_tick(&m, 2000) && m.count == 43);
    assert(muyu_tick(&m, 3000) && m.count == 44);
    muyu_on_key(&m, OK, CLICK, 3500);                               // 手敲：节拍重算
    assert(!muyu_tick(&m, 4000) && muyu_tick(&m, 4500));
    assert(muyu_on_key(&m, UP, CLICK, 5000) == MUYU_TOGGLE && !m.auto_on);
    assert(muyu_on_key(&m, UP, LONG, 0) == MUYU_EXIT);
}

static void test_flashlight(void) {
    uint8_t c = 0;
    assert(flashlight_on_key(&c, DN, CLICK) == NAV_REDRAW && c == 1);
    flashlight_on_key(&c, DN, CLICK);
    flashlight_on_key(&c, DN, CLICK);
    assert(c == 0);                                                  // 绕一圈
    flashlight_on_key(&c, UP, CLICK);
    assert(c == FLASH_COLORS - 1);
    assert(flashlight_on_key(&c, OK, CLICK) == NAV_NONE);
    assert(flashlight_on_key(&c, UP, LONG) == NAV_TO_MENU);
    assert(flashlight_color(0) == 0xFFFFFF && strcmp(flashlight_name(2), "红光") == 0);
}

static void test_pomodoro(void) {
    pomodoro_t p;
    pomodoro_init(&p);
    assert(p.focus && countdown_remaining(&p.cd, 0) == POMO_FOCUS_S * 1000u);
    assert(pomodoro_on_key(&p, UP, CLICK, 0) == NAV_NONE);          // 不能调时间
    pomodoro_on_key(&p, OK, CLICK, 0);                               // 开始
    assert(!pomodoro_tick(&p, POMO_FOCUS_S * 1000u - 1));
    assert(pomodoro_tick(&p, POMO_FOCUS_S * 1000u) && p.ringing && p.done == 1);
    // 响铃：任何键 → 马上开始休息
    pomodoro_on_key(&p, DN, CLICK, 1500000);
    assert(!p.ringing && !p.focus && p.cd.phase == CD_RUNNING);
    assert(countdown_remaining(&p.cd, 1500000 + 60000) == (POMO_BREAK_S - 60) * 1000u);
    assert(pomodoro_tick(&p, 1500000 + POMO_BREAK_S * 1000u) && p.done == 1);   // 休息结束不算番茄
    pomodoro_on_key(&p, OK, CLICK, 1900000);
    assert(p.focus && p.cd.phase == CD_RUNNING);
    // 确定长按：这一段重来
    assert(pomodoro_on_key(&p, OK, LONG, 2000000) == NAV_REDRAW && p.cd.phase == CD_SET && p.focus);
    assert(pomodoro_on_key(&p, UP, LONG, 0) == NAV_TO_MENU);
}

int main(void) {
    test_menu();
    test_candle();
    test_stopwatch();
    test_countdown();
    test_format();
    test_muyu();
    test_flashlight();
    test_pomodoro();
    printf("test_pocket_model: OK\n");
    return 0;
}
