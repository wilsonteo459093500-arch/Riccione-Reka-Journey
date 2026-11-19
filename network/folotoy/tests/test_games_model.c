// 口袋机小游戏（叠叠乐 / 记忆三色 / 求签 / 抽奖 / 落落方块 / 泡泡纸 / 狂按挑战 / 捏捏乐）的 host 测试：
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

static int fall_cells(const fall_t *f) {
    int n = 0;
    for (int r = 0; r < FALL_ROWS; r++)
        for (int c = 0; c < FALL_COLS; c++) n += f->grid[r][c] != 0;
    return n;
}

static void test_fall(void) {
    // 每种方块每个方向都是 4 格
    for (int k = 0; k < FALL_KINDS; k++)
        for (int rot = 0; rot < 4; rot++) {
            int n = 0;
            for (int r = 0; r < 4; r++)
                for (int c = 0; c < 4; c++) n += fall_shape_cell(k, rot, r, c);
            assert(n == 4);
        }
    fall_t f;
    fall_init(&f, 42);
    assert(f.phase == FALL_PLAYING && f.score == 0 && fall_level(&f) == 1 && fall_interval_ms(&f) == 800);
    // 袋子：七种各一块（洗过牌）
    int seen = 0;
    for (int i = 0; i < FALL_KINDS; i++) seen |= 1 << f.bag[i];
    assert(seen == (1 << FALL_KINDS) - 1 && f.kind == f.bag[0] && f.next == f.bag[1]);
    // 左右移：一直往左撞到墙就停，不会出界
    for (int i = 0; i < 20; i++) fall_move(&f, -1);
    assert(!fall_move(&f, -1));
    for (int r = 0; r < 4; r++)
        for (int c = 0; c < 4; c++)
            if (fall_shape_cell(f.kind, f.rot, r, c)) assert(f.x + c >= 0);
    // 没加速：799ms 不动、800ms 掉一格；加速：40ms 一格，每格 1 分
    const int y0 = f.y;
    fall_tick(&f, 799, false);
    assert(f.y == y0);
    fall_tick(&f, 1, false);
    assert(f.y == y0 + 1);
    fall_tick(&f, 120, true);
    assert(f.y == y0 + 4 && f.score == 3);
    // 一直掉：落到底固定 → 出下一块，格子里多 4 格
    for (int i = 0; i < 100 && fall_cells(&f) == 0; i++) fall_tick(&f, 100, true);
    assert(fall_cells(&f) == 4 && f.phase == FALL_PLAYING && f.y <= 1);

    // 消行：底下两行只缺最右一格，放一根直的长条进去 → 消两行、加分、闪的是第 18、19 行
    fall_init(&f, 7);
    for (int r = FALL_ROWS - 2; r < FALL_ROWS; r++)
        for (int c = 0; c < FALL_COLS - 1; c++) f.grid[r][c] = 1;
    f.grid[FALL_ROWS - 3][0] = 2;   // 上面多一格：消掉后要往下掉两行
    f.kind = 0;                     // 长条，转成直的（第 2 栏）
    f.rot = 1;
    f.x = FALL_COLS - 3;            // 2 + 7 = 第 9 栏（最右）
    f.y = 0;
    assert(fall_ghost_y(&f) == FALL_ROWS - 4);       // 虚影：直直落到底
    int lines = 0;
    for (int i = 0; i < 100 && lines == 0; i++) lines = fall_tick(&f, 100, true);
    assert(lines == 2 && f.lines == 2);
    assert(f.cleared == ((1u << (FALL_ROWS - 1)) | (1u << (FALL_ROWS - 2))));
    assert(f.grid[FALL_ROWS - 1][0] == 2);   // 上面那格掉到底
    assert(f.grid[FALL_ROWS - 1][FALL_COLS - 1] == 1 && f.grid[FALL_ROWS - 2][FALL_COLS - 1] == 1);   // 长条剩下的两格
    assert(f.score >= 300);

    // 靠右墙转：会挪进来，不会出界
    fall_init(&f, 9);
    f.kind = 0;
    f.rot = 1;
    f.x = FALL_COLS - 3;
    f.y = 5;
    assert(fall_rotate(&f) && f.rot == 2);
    for (int r = 0; r < 4; r++)
        for (int c = 0; c < 4; c++)
            if (fall_shape_cell(f.kind, f.rot, r, c)) assert(f.x + c < FALL_COLS);

    // 堆到顶：结束，结束后不能再动
    fall_init(&f, 3);
    for (int r = 0; r < FALL_ROWS; r++)
        for (int c = 0; c < FALL_COLS; c++) f.grid[r][c] = (r * 7 + c) % 3 ? 1 : 0;   // 乱堆但不会满行
    for (int i = 0; i < 100 && f.phase == FALL_PLAYING; i++) fall_tick(&f, 100, true);
    assert(f.phase == FALL_OVER && !fall_move(&f, 1) && !fall_rotate(&f) && fall_tick(&f, 1000, true) == 0);

    // 升级：10 行升一级、掉更快，最快 80ms
    f.lines = 10;
    assert(fall_level(&f) == 2 && fall_interval_ms(&f) == 730);
    f.lines = 500;
    assert(fall_interval_ms(&f) == 80);
}

static void test_bubble(void) {
    bubble_t b;
    bubble_init(&b);
    assert(b.left == BUBBLE_COUNT && b.cursor == 0);
    assert(bubble_pop(&b) && b.left == BUBBLE_COUNT - 1 && b.cursor == 1 && b.total == 1);
    bubble_step(&b, -1);                         // 往回：第 0 个捏过了 → 绕到最后一个
    assert(b.cursor == BUBBLE_COUNT - 1);
    bubble_step(&b, 1);
    assert(b.cursor == 1);
    for (int i = 0; i < BUBBLE_COUNT - 1; i++) assert(bubble_pop(&b));
    assert(b.left == 0 && !bubble_pop(&b) && b.total == BUBBLE_COUNT);
    bubble_new_sheet(&b);
    assert(b.left == BUBBLE_COUNT && b.total == BUBBLE_COUNT && bubble_pop(&b) && b.total == BUBBLE_COUNT + 1);
}

static void test_mash(void) {
    mash_t m;
    mash_init(&m);
    assert(mash_left_ms(&m, 5000) == MASH_MS);
    assert(mash_press(&m, 1000) && m.phase == MASH_RUNNING && m.count == 1);   // 第一下就开始
    for (int i = 0; i < 69; i++) assert(mash_press(&m, 1000 + (uint32_t)i * 100));
    assert(!mash_tick(&m, 10999) && mash_left_ms(&m, 6000) == 5000);
    assert(!mash_press(&m, 11000));                       // 时间到的那一下不算
    assert(mash_tick(&m, 11000) && m.phase == MASH_OVER && m.count == 70 && m.best == 70);
    assert(mash_rate_x10(&m) == 70);                      // 每秒 7.0 下
    assert(!mash_press(&m, 11100) && !mash_restart(&m, 12400));   // 冷却中
    assert(mash_restart(&m, 12500) && m.phase == MASH_READY && m.count == 0 && m.best == 70);
    mash_press(&m, 20000);
    mash_tick(&m, 30000);
    assert(m.count == 1 && m.best == 70);                 // 最高纪录留着
}

static void test_squish(void) {
    squish_t s;
    squish_init(&s);
    squish_press(&s);
    squish_tick(&s, 1500);
    assert(s.pos > 0.9f && s.pos <= 1.0f && s.count == 1);      // 按住：压扁
    squish_press(&s);                                           // 还按着：不重复算
    assert(s.count == 1);
    squish_release(&s);
    float lowest = 1.0f;
    for (int i = 0; i < 60; i++) { squish_tick(&s, 20); if (s.pos < lowest) lowest = s.pos; }
    assert(lowest < -0.05f);                                    // 放开：冲过头（弹起来）
    squish_tick(&s, 3000);
    assert(s.pos > -0.02f && s.pos < 0.02f);                    // 最后回到圆圆的
    assert(squish_name(0)[0] && squish_name(SQUISH_TOYS) == squish_name(0));
}

int main(void) {
    test_stack();
    test_simon();
    test_fortune();
    test_lottery();
    test_fall();
    test_bubble();
    test_mash();
    test_squish();
    printf("test_games_model: OK\n");
    return 0;
}
