// DEKU 小助理纯逻辑的 host 测试（不需要 ESP-IDF；句库用测试自己的，不连 main/deku_lines.c）：
//   cc -std=c11 -Wall -Wextra -Werror -Imain main/deku_model.c tests/test_deku_model.c -o /tmp/t && /tmp/t
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "deku_model.h"

const deku_line_t DEKU_LINES[] = {
    { "J01", DEKU_JOKE, "笑话一", "" },
    { "J02", DEKU_JOKE, "笑话二", "" },
    { "J03", DEKU_JOKE, "笑话三", "" },
    { "I01", DEKU_INAMORI, "稻盛一", "——稻盛和夫 · 《活法》" },
    { "M01", DEKU_MUSK, "Musk 一", "——Elon Musk · TED 2017" },
};
const size_t DEKU_LINE_COUNT = sizeof DEKU_LINES / sizeof DEKU_LINES[0];

#define UP SPACE_CARD_BTN_UP
#define DN SPACE_CARD_BTN_DOWN
#define OK SPACE_CARD_BTN_OK

static void test_pick_no_repeat(void) {
    deku_state_t s;
    deku_init(&s, 42);
    assert(deku_count(DEKU_JOKE) == 3 && deku_count(DEKU_KUOK) == 0);
    int seen[3] = { 0 };
    for (int i = 0; i < 3; i++) {
        const int line = deku_pick(&s, DEKU_JOKE);
        assert(line >= 0 && line < 3);
        seen[line]++;
        s.line = line;
    }
    assert(seen[0] == 1 && seen[1] == 1 && seen[2] == 1);   // 一轮不重复
    const int last = s.line;
    for (int round = 0; round < 20; round++) {              // 新的一轮：第一句不会跟刚刚那句一样
        deku_state_t t = s;
        assert(deku_pick(&t, DEKU_JOKE) != last);
    }
    assert(deku_pick(&s, DEKU_KUOK) == -1);                 // 郭鹤年还没审过
    assert(deku_find("M01", 3) == 4);
    assert(deku_find("M0", 2) == -1);
    assert(deku_find("X99", 3) == -1);
}

static void test_buttons_without_app(void) {
    deku_state_t s;
    deku_init(&s, 7);
    // 没有 app：按住确定不会进「听」；单击 = 笑话；不送通知
    deku_out_t o = deku_on_key(&s, OK, SPACE_CARD_EV_PRESS, false, 0);
    assert(o.action == DEKU_DO_NONE && s.face == DEKU_FACE_IDLE);
    o = deku_on_key(&s, OK, SPACE_CARD_EV_CLICK, false, 100);
    assert(o.action == DEKU_DO_REDRAW && s.face == DEKU_FACE_SAY && DEKU_LINES[s.line].kind == DEKU_JOKE && o.evt_len == 0);
    // 下：名人轮流（没审过的郭鹤年跳过）
    o = deku_on_key(&s, DN, SPACE_CARD_EV_CLICK, false, 200);
    assert(DEKU_LINES[s.line].kind == DEKU_INAMORI);
    o = deku_on_key(&s, DN, SPACE_CARD_EV_CLICK, false, 300);
    assert(DEKU_LINES[s.line].kind == DEKU_MUSK);
    o = deku_on_key(&s, DN, SPACE_CARD_EV_CLICK, false, 400);
    assert(DEKU_LINES[s.line].kind == DEKU_INAMORI);
    // 上 长按回菜单
    assert(deku_on_key(&s, UP, SPACE_CARD_EV_LONG, false, 500).action == DEKU_DO_EXIT);
}

static void test_talk_with_app(void) {
    deku_state_t s;
    deku_init(&s, 3);
    deku_out_t o = deku_on_key(&s, OK, SPACE_CARD_EV_PRESS, true, 1000);
    assert(s.face == DEKU_FACE_LISTEN && o.evt_len == 2 && o.evt[0] == 0x81 && o.evt[1] == 1);
    o = deku_on_key(&s, OK, SPACE_CARD_EV_RELEASE, true, 2500);
    assert(s.face == DEKU_FACE_THINK && o.evt_len == 2 && o.evt[1] == 0);
    o = deku_on_key(&s, OK, SPACE_CARD_EV_CLICK, true, 2600);     // 有 app 时单击不另外抽
    assert(o.action == DEKU_DO_NONE && s.face == DEKU_FACE_THINK);
    // app 听懂了：显示 M01
    const uint8_t show[] = { 0x04, 'M', '0', '1' };
    assert(deku_on_cmd(&s, show, sizeof show, 3000));
    assert(s.face == DEKU_FACE_SAY && s.line == 4);
    // app 的句库比较新：FoloToy 没有这句 → 不动
    const uint8_t newer[] = { 0x04, 'J', '9', '9' };
    assert(!deku_on_cmd(&s, newer, sizeof newer, 3100) && s.line == 4);
    // 没听懂
    const uint8_t unk[] = { 0x05 };
    assert(deku_on_cmd(&s, unk, 1, 3200) && s.face == DEKU_FACE_CONFUSED && s.line == -1);
    // 按键挑的：通知 app 念这句
    o = deku_on_key(&s, UP, SPACE_CARD_EV_CLICK, true, 4000);
    assert(o.evt_len == 4 && o.evt[0] == 0x82 && memcmp(o.evt + 1, DEKU_LINES[s.line].id, 3) == 0);
    // 在听的时候按上 / 下不抽
    deku_on_key(&s, OK, SPACE_CARD_EV_PRESS, true, 5000);
    o = deku_on_key(&s, UP, SPACE_CARD_EV_CLICK, true, 5100);
    assert(o.action == DEKU_DO_NONE && s.face == DEKU_FACE_LISTEN);
    // 在听时长按上回菜单：也告诉 app 别听了
    o = deku_on_key(&s, UP, SPACE_CARD_EV_LONG, true, 5200);
    assert(o.action == DEKU_DO_EXIT && o.evt_len == 2 && o.evt[0] == 0x81 && o.evt[1] == 0);
}

static void test_timeouts(void) {
    deku_state_t s;
    deku_out_t o;
    deku_init(&s, 1);
    deku_on_key(&s, OK, SPACE_CARD_EV_PRESS, true, 0);
    assert(!deku_on_tick(&s, DEKU_LISTEN_MAX_MS - 1, &o));
    assert(deku_on_tick(&s, DEKU_LISTEN_MAX_MS, &o) && s.face == DEKU_FACE_THINK && o.evt_len == 2 && o.evt[1] == 0);
    assert(!deku_on_tick(&s, DEKU_LISTEN_MAX_MS + DEKU_THINK_TIMEOUT_MS - 1, &o));
    assert(deku_on_tick(&s, DEKU_LISTEN_MAX_MS + DEKU_THINK_TIMEOUT_MS, &o) && s.face == DEKU_FACE_CONFUSED && o.evt_len == 0);
    assert(strcmp(deku_kind_name(DEKU_KUOK), "郭鹤年") == 0);
}

// 测试用字宽：中文 / 全形标点 20、英文数字 10、空白 5
static int fake_width(uint32_t cp, void *ctx) {
    (void)ctx;
    return cp == ' ' ? 5 : cp < 0x80 ? 10 : 20;
}

static void test_wrap(void) {
    char out[256];
    // 一行 5 个中文字（100px）。一般情况：照宽度切
    int n = deku_wrap("一二三四五六七八九十", out, sizeof out, 100, fake_width, NULL);
    assert(n == 2 && strcmp(out, "一二三四五\n六七八九十") == 0);
    // 标点在第 6 个：把「五」一起带下去
    n = deku_wrap("一二三四五。六七", out, sizeof out, 100, fake_width, NULL);
    assert(n == 2 && strcmp(out, "一二三四\n五。六七") == 0);
    // 连着两个不能放行首的（。」）：再多带一个字下去
    n = deku_wrap("一二三四「五」。六", out, sizeof out, 100, fake_width, NULL);
    assert(n == 2 && strcmp(out, "一二三四\n「五」。六") == 0);
    // 「「」不能放行尾
    n = deku_wrap("他说一二「三四」", out, sizeof out, 100, fake_width, NULL);
    assert(n == 2 && strcmp(out, "他说一二\n「三四」") == 0);
    // 英文词不切开，行首空白去掉
    n = deku_wrap("I think reasoning", out, sizeof out, 100, fake_width, NULL);
    assert(n == 2 && strcmp(out, "I think\nreasoning") == 0);
    // 原本的换行照留
    n = deku_wrap("我是 DEKU。\n要听笑话", out, sizeof out, 200, fake_width, NULL);
    assert(n == 2 && strcmp(out, "我是 DEKU。\n要听笑话") == 0);
    // 放得下就一行
    n = deku_wrap("敬天爱人。", out, sizeof out, 200, fake_width, NULL);
    assert(n == 1 && strcmp(out, "敬天爱人。") == 0);
    // out 太小：截掉但一定以 0 结尾
    char small[8];
    deku_wrap("一二三四五六七八九十", small, sizeof small, 100, fake_width, NULL);
    assert(strlen(small) < sizeof small);
}

int main(void) {
    test_wrap();
    test_pick_no_repeat();
    test_buttons_without_app();
    test_talk_with_app();
    test_timeouts();
    printf("deku_model: all tests passed\n");
    return 0;
}
