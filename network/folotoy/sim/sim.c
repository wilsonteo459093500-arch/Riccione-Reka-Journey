// sim.c —— 在电脑上模拟 FoloToy 240×320 屏幕，把名片画面画成图档（不用机器）
//
// 用真的 LVGL 9.5 + 真的 main/ 画面程序；只有电量、背光、时间、蓝牙是假的（stub/）。
// 用法：./sim <名片输出资料夹> <车用输出资料夹> <口袋机输出资料夹> [活动网址]
//   名片：1-card.ppm（名片）、2-event.ppm（活动，有给活动网址才有）、3-big.ppm（确定长按的大二维码）
//   车用：1-pairing.ppm（等手机配对）、2-connected.ppm、3-play.ppm（刚按播放）、4-not-connected.ppm（没连上就按）
//   口袋机：菜单、蜡烛（点着 / 有人吹 / 唱华语 / 唱英语 / 吹熄冒烟 / 一位数）、计时器、倒数（设定 / 进行中 / 时间到）
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ble_remote.h"
#include "candle_screen.h"
#include "car_screen.h"
#include "menu_screen.h"
#include "timer_screen.h"
#include "lvgl.h"
#include "space_card.h"

int g_soc = 87;       // 假电量
int g_bl = 0;         // 最后设的背光 %
int64_t g_now_us = 0; // 假时间
extern car_link_t g_link;   // stub/ble_remote_stub.c
extern bool g_app_present;
void sim_push_cmd(const uint8_t *d, size_t n);
extern int g_song_line;     // stub/sound_stub.c
extern bool g_blow;
extern uint8_t g_mic_level;

static uint16_t s_fb[240 * 320];
static const char *s_out;   // 现在写到哪个资料夹

static uint32_t tick(void) { return (uint32_t)(g_now_us / 1000); }

static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *px) {
    const uint16_t *p = (const uint16_t *)px;
    for (int y = a->y1; y <= a->y2; y++)
        for (int x = a->x1; x <= a->x2; x++) s_fb[y * 240 + x] = *p++;
    lv_display_flush_ready(d);
}

static void dump(const char *name) {
    lv_obj_invalidate(lv_screen_active());
    lv_refr_now(NULL);
    char path[512];
    snprintf(path, sizeof path, "%s/%s", s_out, name);
    FILE *f = fopen(path, "wb");
    if (!f) { perror(path); exit(1); }
    fprintf(f, "P6\n240 320\n255\n");
    for (int i = 0; i < 240 * 320; i++) {
        const uint16_t c = s_fb[i];  // RGB565 → RGB888
        const unsigned char rgb[3] = {(unsigned char)((c >> 11) << 3), (unsigned char)(((c >> 5) & 63) << 2),
                                      (unsigned char)((c & 31) << 3)};
        fwrite(rgb, 1, 3, f);
    }
    fclose(f);
    printf("%s（背光 %d%%）\n", path, g_bl);
}

static void press(space_card_state_t *s, space_card_btn_t b, space_card_ev_t e) {
    space_card_on_input(space_card_on_key(s, b, e));
}

// 跑 LVGL 的计时器（车用画面每 250ms 看一次连线状态）
static void advance_ms(int ms) {
    for (int t = 0; t < ms; t += 50) {
        g_now_us += 50 * 1000;
        lv_timer_handler();
    }
}

static void car_press(car_remote_state_t *s, space_card_btn_t b, space_card_ev_t e) {
    const car_action_t a = car_remote_on_key(s, b, e);
    const uint16_t usage = car_remote_usage(a);
    car_screen_on_action(a, usage != 0 && ble_remote_send(usage));
}

int main(int argc, char **argv) {
    if (argc < 4) { fprintf(stderr, "用法：%s <名片输出资料夹> <车用输出资料夹> <口袋机输出资料夹> [活动网址]\n", argv[0]); return 2; }
    s_out = argv[1];
    const char *car_out = argv[2];
    const char *pocket_out = argv[3];
    const char *event_url = argc > 4 ? argv[4] : "";

    lv_init();
    lv_tick_set_cb(tick);
    lv_display_t *d = lv_display_create(240, 320);
    static uint16_t buf[240 * 320];
    lv_display_set_buffers(d, buf, NULL, sizeof buf, LV_DISPLAY_RENDER_MODE_FULL);
    lv_display_set_flush_cb(d, flush);

    static space_card_state_t s;
    space_card_init(&s, CONFIG_SPACE_CARD_URL, CONFIG_SPACE_CARD_LABEL, event_url, CONFIG_SPACE_CARD_EVENT_LABEL);
    space_card_show(&s);
    g_bl = space_card_backlight(&s);
    // 开机封面（没有二维码：放到口袋机资料夹，名片资料夹只放要扫码的画面）
    s_out = pocket_out;
    advance_ms(900);   // 光扫到中间
    dump("00-cover.ppm");
    s_out = argv[1];
    press(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK);   // 确定 → 二维码
    dump("1-card.ppm");

    if (s.count > 1) {
        press(&s, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK);
        dump("2-event.ppm");
        press(&s, SPACE_CARD_BTN_UP, SPACE_CARD_EV_CLICK);
    }
    press(&s, SPACE_CARD_BTN_OK, SPACE_CARD_EV_LONG);
    dump("3-big.ppm");

    // ---- 车用遥控器 ----
    s_out = car_out;
    space_card_hide();
    static car_remote_state_t car;
    car_remote_init(&car);
    g_link = CAR_LINK_ADVERTISING;
    car_screen_show(&car, CONFIG_SPACE_REMOTE_NAME);
    g_bl = car_remote_backlight(&car);
    advance_ms(300);
    dump("1-pairing.ppm");
    g_link = CAR_LINK_READY;
    advance_ms(300);
    dump("2-connected.ppm");
    car_press(&car, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK);
    advance_ms(300);
    dump("3-play.ppm");
    advance_ms(1500);   // 动作 1.2 秒后消失
    g_link = CAR_LINK_ADVERTISING;
    advance_ms(300);
    car_press(&car, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK);
    advance_ms(300);
    dump("4-not-connected.ppm");
    // 手机装了 SPACE 车控 app
    g_link = CAR_LINK_READY;
    g_app_present = true;
    advance_ms(300);
    dump("5-app.ppm");
    // app 叫 FoloToy 进选择模式（选朋友）
    static const uint8_t m1[] = { 0x01, 0x01 };
    static const uint8_t ct0[] = { 0x02, 0x00, 'W', 'h', 'a', 't', 's', 'A', 'p', 'p' };
    static const uint8_t ct1[] = { 0x02, 0x01, '2', ' ', '/', ' ', '5', ' ', ' ', 'A', 'h', ' ', 'M', 'e', 'n', 'g' };
    sim_push_cmd(m1, sizeof m1);
    sim_push_cmd(ct0, sizeof ct0);
    sim_push_cmd(ct1, sizeof ct1);
    advance_ms(300);
    dump("6-app-select.ppm");

    // ---- 口袋机 ----
    s_out = pocket_out;
    car_screen_hide();
    lv_obj_t *old = lv_screen_active();
    static menu_state_t menu;
    menu_init(&menu);
    menu_screen_show(&menu);
    lv_obj_delete(old);
    dump("01-menu.ppm");
    menu_on_key(&menu, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK);
    menu_on_key(&menu, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_CLICK);
    menu_screen_update();
    dump("02-menu-countdown.ppm");
    menu_screen_hide();

    old = lv_screen_active();
    static candle_state_t candle;
    candle_init(&candle);
    candle_screen_show(&candle);
    lv_obj_delete(old);
    advance_ms(200);
    dump("03-candle.ppm");
    g_mic_level = 220;   // 有人在吹：火苗往旁边倒
    advance_ms(100);
    dump("04-candle-blowing.ppm");
    g_mic_level = 0;
    candle_screen_on_do(candle_on_key(&candle, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK));   // 唱华语
    advance_ms(100);
    dump("05-candle-sing-zh.ppm");
    candle_screen_on_do(candle_on_key(&candle, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK));   // 停
    candle_screen_on_do(candle_on_key(&candle, SPACE_CARD_BTN_DOWN, SPACE_CARD_EV_LONG));  // 唱英语
    g_song_line = 2;
    advance_ms(100);
    dump("06-candle-sing-en.ppm");
    candle_screen_on_do(candle_on_key(&candle, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK));   // 停
    g_blow = true;       // 听到吹气
    advance_ms(500);
    dump("07-candle-out.ppm");
    candle_screen_on_do(candle_on_key(&candle, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK));   // 重新点燃
    candle.age = 6;
    candle_screen_on_do(CANDLE_DO_REDRAW);
    advance_ms(100);
    dump("08-candle-age6.ppm");
    candle_screen_hide();

    old = lv_screen_active();
    static stopwatch_t sw;
    static countdown_t cd;
    stopwatch_init(&sw);
    countdown_init(&cd);
    const uint32_t t0 = (uint32_t)(g_now_us / 1000);
    stopwatch_on_key(&sw, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK, t0);
    timer_screen_show(&sw, &cd, false);
    lv_obj_delete(old);
    advance_ms(83400);
    dump("09-stopwatch.ppm");
    timer_screen_hide();

    old = lv_screen_active();
    timer_screen_show(&sw, &cd, true);
    lv_obj_delete(old);
    dump("10-countdown-set.ppm");
    countdown_on_key(&cd, SPACE_CARD_BTN_OK, SPACE_CARD_EV_CLICK, (uint32_t)(g_now_us / 1000));
    timer_screen_update();
    advance_ms(110000);
    dump("11-countdown-running.ppm");
    advance_ms(190000 + 400);
    dump("12-countdown-done.ppm");
    timer_screen_hide();
    return 0;
}
