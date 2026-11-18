// 「手机找 FoloToy」纯逻辑的 host 测试（不需要 ESP-IDF）：
//   cc -std=c11 -Wall -Wextra -Werror -Imain main/find_model.c tests/test_find_model.c -o /tmp/t && /tmp/t
#include <assert.h>
#include <stdio.h>

#include "find_model.h"

static void test_cmd(void) {
    const uint8_t on[] = { 0x03, 1 }, off[] = { 0x03, 0 }, other[] = { 0x01, 1 }, longer[] = { 0x03, 1, 0 };
    assert(find_cmd_parse(on, 2) == 1);
    assert(find_cmd_parse(off, 2) == 0);
    assert(find_cmd_parse(other, 2) == -1);    // 车用的「模式」指令，不是找
    assert(find_cmd_parse(longer, 3) == -1);
    assert(find_cmd_parse(on, 1) == -1);
    assert(find_cmd_parse(NULL, 2) == -1);

    uint8_t evt[2];
    find_evt_encode(true, FIND_STOP_NONE, evt);
    assert(evt[0] == 0x80 && evt[1] == 1);
    find_evt_encode(false, FIND_STOP_APP, evt);
    assert(evt[0] == 0x80 && evt[1] == 0);
    find_evt_encode(false, FIND_STOP_KEY, evt);
    assert(evt[1] == 2);   // 找到了
    find_evt_encode(false, FIND_STOP_TIMEOUT, evt);
    assert(evt[1] == 3);   // 30 秒没人按
}

static void test_timeout_and_flash(void) {
    find_state_t s;
    find_init(&s);
    assert(!s.active);
    assert(find_start(&s, 1000));
    assert(s.active);
    assert(find_flash_red(&s, 1000));
    assert(!find_flash_red(&s, 1000 + FIND_FLASH_MS));
    assert(find_flash_red(&s, 1000 + 2 * FIND_FLASH_MS));
    assert(find_on_tick(&s, 1000 + FIND_TIMEOUT_MS - 1) == FIND_STOP_NONE);
    // 再按一次「找」：重新算 30 秒，不算新开始
    assert(!find_start(&s, 20000));
    assert(find_on_tick(&s, 1000 + FIND_TIMEOUT_MS) == FIND_STOP_NONE);
    assert(find_on_tick(&s, 20000 + FIND_TIMEOUT_MS) == FIND_STOP_TIMEOUT);
    assert(!s.active);
    assert(find_on_tick(&s, 99999) == FIND_STOP_NONE);   // 停了就不再报

    // app 叫停
    assert(find_start(&s, 0));
    assert(find_stop(&s));
    assert(!find_stop(&s));
}

static void test_key_stops_and_is_swallowed(void) {
    find_state_t s;
    find_stop_t why;
    find_init(&s);

    // 没在响：按键照常
    assert(!find_on_key(&s, SPACE_CARD_EV_PRESS, 0, &why) && why == FIND_STOP_NONE);
    assert(!find_on_key(&s, SPACE_CARD_EV_CLICK, 0, &why));

    // 短按停：按下停、放开吃掉、接着的单击也吃掉；下一次按照常
    find_start(&s, 1000);
    assert(find_on_key(&s, SPACE_CARD_EV_PRESS, 2000, &why) && why == FIND_STOP_KEY);
    assert(!s.active);
    assert(find_on_key(&s, SPACE_CARD_EV_RELEASE, 2100, &why) && why == FIND_STOP_NONE);
    assert(find_on_key(&s, SPACE_CARD_EV_CLICK, 2400, &why));
    assert(!find_on_key(&s, SPACE_CARD_EV_PRESS, 3000, &why));
    assert(!find_on_key(&s, SPACE_CARD_EV_RELEASE, 3100, &why));
    assert(!find_on_key(&s, SPACE_CARD_EV_CLICK, 3300, &why));

    // 按住停：长按（例如「上」长按 = 回菜单）也吃掉，不会误跳画面
    find_start(&s, 5000);
    assert(find_on_key(&s, SPACE_CARD_EV_PRESS, 6000, &why) && why == FIND_STOP_KEY);
    assert(find_on_key(&s, SPACE_CARD_EV_LONG, 7000, &why));
    assert(find_on_key(&s, SPACE_CARD_EV_RELEASE, 8000, &why));
    // 长按放开后没有单击；1 秒后新的单击照常
    assert(!find_on_key(&s, SPACE_CARD_EV_CLICK, 9100, &why));

    // 放开后 1 秒内没等到单击：时间过了就不再吃
    find_start(&s, 10000);
    assert(find_on_key(&s, SPACE_CARD_EV_PRESS, 10500, &why));
    assert(find_on_key(&s, SPACE_CARD_EV_RELEASE, 10600, &why));
    assert(find_on_tick(&s, 11700) == FIND_STOP_NONE);
    assert(!find_on_key(&s, SPACE_CARD_EV_CLICK, 11800, &why));

    // 只收到单击（名片画面没传按下）：单击停，下一个单击照常
    find_start(&s, 20000);
    assert(find_on_key(&s, SPACE_CARD_EV_CLICK, 20500, &why) && why == FIND_STOP_KEY);
    assert(!find_on_key(&s, SPACE_CARD_EV_CLICK, 21000, &why));

    // 收到放开时才停（按下是在开始响之前）：后面的单击吃掉
    find_start(&s, 30000);
    assert(find_on_key(&s, SPACE_CARD_EV_RELEASE, 30100, &why) && why == FIND_STOP_KEY);
    assert(find_on_key(&s, SPACE_CARD_EV_CLICK, 30300, &why));

    // 开始响时清掉上一次没吃完的
    find_start(&s, 40000);
    assert(find_on_key(&s, SPACE_CARD_EV_PRESS, 40100, &why));
    find_start(&s, 40200);   // 还按着的时候手机又按了「找」
    assert(find_on_key(&s, SPACE_CARD_EV_RELEASE, 40300, &why) && why == FIND_STOP_KEY);
}

int main(void) {
    test_cmd();
    test_timeout_and_flash();
    test_key_stops_and_is_swallowed();
    printf("find_model: all tests passed\n");
    return 0;
}
