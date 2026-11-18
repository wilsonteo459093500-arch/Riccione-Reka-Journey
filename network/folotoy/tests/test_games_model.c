// 口袋机小游戏（叠叠乐 / 记忆三色 / 求签 / 抽奖）的 host 测试：
//   cc -std=c11 -Wall -Wextra -Werror -Imain main/games_model.c tests/test_games_model.c -o /tmp/t && /tmp/t
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "games_model.h"

static void test_stack(void) {
    stack_t_ s;
    stack_init(&s);
    assert(stack_score(&s) == 0 && stack_moving_w(&s) == STACK_BASE_W && stack_moving_x(&s) == 0);
    // 来回滑：不会跑出场地
    for (int i = 0; i < 500; i++) {
        stack_tick(&s, 37);
        assert(stack_moving_x(&s) >= 0 && stack_moving_x(&s) + stack_moving_w(&s) <= STACK_W);
    }
    // 完全对齐（差 1px 也算）：不切
    stack_init(&s);
    s.x_q8 = (s.left[0] + 1) << 8;
    assert(stack_drop(&s) && s.perfect && s.cut_width == 0 && s.width[1] == STACK_BASE_W && s.left[1] == s.left[0]);
    // 偏右 30px：右边切掉 30
    s.x_q8 = (s.left[1] + 30) << 8;
    assert(stack_drop(&s) && !s.perfect && s.width[2] == STACK_BASE_W - 30 && s.left[2] == s.left[1] + 30);
    assert(s.cut_width == 30 && s.cut_left == s.left[1] + STACK_BASE_W);
    // 偏左 10px：左边切掉 10
    s.x_q8 = (s.left[2] - 10) << 8;
    assert(stack_drop(&s) && s.width[3] == STACK_BASE_W - 40 && s.cut_left == s.left[2] - 10 && s.cut_width == 10);
    assert(stack_score(&s) == 3 && s.speed > 90);                    // 越叠越快
    // 完全没叠到：结束
    s.x_q8 = 0;
    s.left[3] = 200;
    s.width[3] = 20;
    assert(!stack_drop(&s) && s.phase == STACK_OVER && stack_score(&s) == 3);
    assert(!stack_drop(&s));                                         // 结束后不能再放
}

static void test_simon(void) {
    simon_t s;
    simon_init(&s, 1234, 0);
    assert(s.len == 1 && s.phase == SIMON_SHOWING);
    assert(simon_tick(&s, 100) == -1);                               // 开局先停一下
    assert(simon_tick(&s, 700) == s.seq[0]);                         // 亮第一个
    assert(simon_press(&s, (space_card_btn_t)s.seq[0], 700) == 0);   // 播的时候按不算
    assert(simon_tick(&s, 600 + SIMON_ON_MS + 10) == -1);            // 暗
    simon_tick(&s, 600 + SIMON_ON_MS + SIMON_GAP_MS + 1);            // 播完 → 换玩家
    assert(s.phase == SIMON_INPUT);
    assert(simon_press(&s, (space_card_btn_t)s.seq[0], 2000) == 1);  // 对 → 下一题两个
    assert(s.len == 2 && s.phase == SIMON_SHOWING && simon_score(&s) == 1);
    // 再播一次（两个），然后按错
    uint32_t t = 2000 + SIMON_NEXT_MS;
    assert(simon_tick(&s, t) == s.seq[0]);
    assert(simon_tick(&s, t + SIMON_ON_MS + SIMON_GAP_MS) == s.seq[1]);
    simon_tick(&s, t + 2 * (SIMON_ON_MS + SIMON_GAP_MS));
    assert(s.phase == SIMON_INPUT);
    assert(simon_press(&s, (space_card_btn_t)s.seq[0], t + 5000) == 1);
    assert(simon_press(&s, (space_card_btn_t)((s.seq[1] + 1) % 3), t + 5100) == -1);
    assert(s.phase == SIMON_OVER && simon_score(&s) == 1);
    // 出题：三种都会出现
    simon_init(&s, 99, 0);
    int seen[3] = { 0 };
    for (int i = 0; i < 40; i++) {
        s.phase = SIMON_INPUT;
        s.pos = s.len - 1;
        simon_press(&s, (space_card_btn_t)s.seq[s.len - 1], 0);
    }
    for (int i = 0; i < s.len; i++) seen[s.seq[i]]++;
    assert(seen[0] && seen[1] && seen[2]);
}

static void test_fortune(void) {
    fortune_t f;
    fortune_init(&f, 7);
    int count[FORTUNE_COUNT] = { 0 };
    for (int i = 0; i < FORTUNE_COUNT; i++) count[fortune_draw(&f)]++;
    for (int i = 0; i < FORTUNE_COUNT; i++) assert(count[i] == 1);   // 一轮里每支都抽到、不重复
    for (int i = 0; i < FORTUNE_COUNT; i++) {
        assert(fortune_level(i)[0] && fortune_text(i)[0]);
    }
    assert(fortune_draw(&f) >= 0);                                   // 抽完一轮再洗
}

static void test_lottery(void) {
    uint32_t seed = 42;
    int hits[LOTTERY_PRIZES] = { 0 };
    for (int i = 0; i < 20000; i++) hits[lottery_draw(&seed)]++;
    // 比例 1 : 3 : 6 : 10（误差 15% 以内）
    uint32_t total = 0;
    for (int i = 0; i < LOTTERY_PRIZES; i++) total += lottery_weight(i);
    for (int i = 0; i < LOTTERY_PRIZES; i++) {
        const double want = 20000.0 * lottery_weight(i) / total;
        assert(hits[i] > want * 0.85 && hits[i] < want * 1.15);
    }
    assert(strcmp(lottery_prize(3), "谢谢参与") == 0);
}

int main(void) {
    test_stack();
    test_simon();
    test_fortune();
    test_lottery();
    printf("test_games_model: OK\n");
    return 0;
}
