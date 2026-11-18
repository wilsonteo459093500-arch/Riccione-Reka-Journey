// games_model.c —— 见 games_model.h（纯 C，host 测试：tests/test_games_model.c）
#include "games_model.h"

#include <string.h>

uint32_t game_rand(uint32_t *seed) {
    uint32_t x = *seed ? *seed : 0x9E3779B9u;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *seed = x;
    return x;
}

// ---------------- 叠叠乐 ----------------
void stack_init(stack_t_ *s) {
    memset(s, 0, sizeof(*s));
    s->left[0] = (STACK_W - STACK_BASE_W) / 2;
    s->width[0] = STACK_BASE_W;
    s->n = 1;
    s->x_q8 = 0;
    s->dir = 1;
    s->speed = 90;
}

int16_t stack_moving_w(const stack_t_ *s) {
    return s->width[s->n - 1];
}

int16_t stack_moving_x(const stack_t_ *s) {
    return (int16_t)(s->x_q8 >> 8);
}

void stack_tick(stack_t_ *s, uint32_t dt_ms) {
    if (s->phase != STACK_PLAYING) return;
    const int32_t max_x = (STACK_W - stack_moving_w(s)) << 8;
    s->x_q8 += (int32_t)s->dir * (int32_t)s->speed * (int32_t)dt_ms * 256 / 1000;
    // 碰到两边就反弹
    if (s->x_q8 >= max_x) { s->x_q8 = max_x - (s->x_q8 - max_x); s->dir = -1; }
    if (s->x_q8 <= 0) { s->x_q8 = -s->x_q8; s->dir = 1; }
    if (s->x_q8 > max_x) s->x_q8 = max_x;
}

bool stack_drop(stack_t_ *s) {
    if (s->phase != STACK_PLAYING) return false;
    const int16_t prev_l = s->left[s->n - 1], prev_w = s->width[s->n - 1];
    int16_t x = stack_moving_x(s);
    const int16_t w = stack_moving_w(s);
    s->cut_width = 0;
    s->perfect = false;
    if (x - prev_l >= -STACK_PERFECT_PX && x - prev_l <= STACK_PERFECT_PX) {   // 几乎对齐：算完全对齐
        x = prev_l;
        s->perfect = true;
    }
    const int16_t l = x > prev_l ? x : prev_l;
    const int16_t r = (x + w) < (prev_l + prev_w) ? (x + w) : (prev_l + prev_w);
    if (r <= l) {   // 完全没叠到
        s->phase = STACK_OVER;
        s->cut_left = x;
        s->cut_width = w;
        return false;
    }
    if (!s->perfect) {   // 切掉的那块（在左边或右边）
        s->cut_left = x < prev_l ? x : r;
        s->cut_width = (int16_t)(w - (r - l));
    }
    if (s->n < STACK_MAX) s->n++;
    else {   // 叠到上限：把最下面的丢掉（画面本来就只画上面）
        memmove(s->left, s->left + 1, (STACK_MAX - 1) * sizeof s->left[0]);
        memmove(s->width, s->width + 1, (STACK_MAX - 1) * sizeof s->width[0]);
    }
    s->left[s->n - 1] = l;
    s->width[s->n - 1] = (int16_t)(r - l);
    // 新的一块从另一边进来，速度慢慢变快（上限 260 px/s）
    s->dir = (s->n % 2) ? 1 : -1;
    s->x_q8 = s->dir > 0 ? 0 : (int32_t)(STACK_W - (r - l)) << 8;
    if (s->speed < 260) s->speed += 8;
    return true;
}

int stack_score(const stack_t_ *s) {
    return s->n - 1;
}

// ---------------- 记忆三色 ----------------
static void simon_add(simon_t *s) {
    if (s->len < SIMON_MAX) s->seq[s->len++] = (uint8_t)(game_rand(&s->seed) % 3);
}

void simon_init(simon_t *s, uint32_t seed, uint32_t now_ms) {
    memset(s, 0, sizeof(*s));
    s->seed = seed ? seed : 1;
    simon_add(s);
    s->phase = SIMON_SHOWING;
    s->t0 = now_ms + 600;   // 开局先停一下
}

int simon_tick(simon_t *s, uint32_t now_ms) {
    if (s->phase != SIMON_SHOWING) return -1;
    if ((int32_t)(now_ms - s->t0) < 0) return -1;
    const uint32_t t = now_ms - s->t0, step = SIMON_ON_MS + SIMON_GAP_MS;
    const int i = (int)(t / step);
    if (i >= s->len) {   // 播完：换玩家
        s->phase = SIMON_INPUT;
        s->pos = 0;
        return -1;
    }
    s->pos = i;
    return (t % step) < SIMON_ON_MS ? s->seq[i] : -1;
}

int simon_press(simon_t *s, space_card_btn_t btn, uint32_t now_ms) {
    if (s->phase != SIMON_INPUT) return 0;
    if ((uint8_t)btn != s->seq[s->pos]) {
        s->phase = SIMON_OVER;
        return -1;
    }
    if (++s->pos >= s->len) {   // 整串都对：加一个，等一下再播
        simon_add(s);
        s->phase = SIMON_SHOWING;
        s->t0 = now_ms + SIMON_NEXT_MS;
    }
    return 1;
}

int simon_score(const simon_t *s) {
    return s->len - 1;
}

// ---------------- 求签（草稿：用户审过才定稿）----------------
static const char *const FORTUNE_LEVEL[FORTUNE_COUNT] = {
    "上上签", "上上签", "上上签", "上上签", "上上签", "上上签",
    "上签", "上签", "上签", "上签", "上签", "上签", "上签", "上签", "上签", "上签",
    "中签", "中签", "中签", "中签", "中签", "中签", "中签", "中签",
};
static const char *const FORTUNE_TEXT[FORTUNE_COUNT] = {
    "贵人就在身边\n今天主动打个招呼",
    "好事已经在路上\n耐心等它到来",
    "一分耕耘一分收获\n这次收获会多一点",
    "生意兴隆\n客人自己找上门",
    "心想事成\n先把想的写下来",
    "福气满满\n记得分一点给家人",
    "多听少说\n答案会自己出现",
    "慢慢来比较快\n稳稳做就对了",
    "今天适合约老朋友\n喝杯茶",
    "做好一件小事\n比计划十件大事强",
    "笑一笑\n运气跟着来",
    "早点休息\n明天精神好",
    "新的机会\n藏在旧的关系里",
    "该说谢谢的人\n今天就说",
    "钱要花在刀口上\n也要花在家人身上",
    "把工具整理好\n效率自然高",
    "先照顾好身体\n其他都会跟上",
    "遇到难题\n换个角度看看",
    "别急着答应\n想一晚再说",
    "多喝水\n少生气",
    "小心细节\n魔鬼都在里面",
    "今天不宜冲动消费",
    "忙里偷闲\n也是一种本事",
    "该放下的就放下\n手才空得出来",
};

void fortune_init(fortune_t *f, uint32_t seed) {
    memset(f, 0, sizeof(*f));
    f->seed = seed ? seed : 1;
    f->next = FORTUNE_COUNT;   // 第一次抽时洗牌
}

int fortune_draw(fortune_t *f) {
    if (f->next >= FORTUNE_COUNT) {   // 洗牌（Fisher–Yates）
        for (int i = 0; i < FORTUNE_COUNT; i++) f->order[i] = (uint8_t)i;
        for (int i = FORTUNE_COUNT - 1; i > 0; i--) {
            const int j = (int)(game_rand(&f->seed) % (uint32_t)(i + 1));
            const uint8_t t = f->order[i];
            f->order[i] = f->order[j];
            f->order[j] = t;
        }
        f->next = 0;
    }
    return f->order[f->next++];
}

const char *fortune_level(int i) {
    return (i >= 0 && i < FORTUNE_COUNT) ? FORTUNE_LEVEL[i] : "";
}

const char *fortune_text(int i) {
    return (i >= 0 && i < FORTUNE_COUNT) ? FORTUNE_TEXT[i] : "";
}

// ---------------- 抽奖（占位：用户给真的奖项再改）----------------
static const char *const PRIZE[LOTTERY_PRIZES] = { "一等奖", "二等奖", "三等奖", "谢谢参与" };
static const uint16_t WEIGHT[LOTTERY_PRIZES] = { 1, 3, 6, 10 };

const char *lottery_prize(int i) {
    return (i >= 0 && i < LOTTERY_PRIZES) ? PRIZE[i] : "";
}

uint16_t lottery_weight(int i) {
    return (i >= 0 && i < LOTTERY_PRIZES) ? WEIGHT[i] : 0;
}

int lottery_draw(uint32_t *seed) {
    uint32_t total = 0;
    for (int i = 0; i < LOTTERY_PRIZES; i++) total += WEIGHT[i];
    uint32_t r = game_rand(seed) % total;
    for (int i = 0; i < LOTTERY_PRIZES; i++) {
        if (r < WEIGHT[i]) return i;
        r -= WEIGHT[i];
    }
    return LOTTERY_PRIZES - 1;
}

// ---------------- 落落方块 ----------------
// 4×4 框，每个方向一个 16 位元：最高位 = 第 0 行第 0 格，往右往下
static const uint16_t FALL_SHAPE[FALL_KINDS][4] = {
    { 0x0F00, 0x2222, 0x00F0, 0x4444 },   // 长条
    { 0x44C0, 0x8E00, 0x6440, 0x0E20 },   // J
    { 0x4460, 0x0E80, 0xC440, 0x2E00 },   // L
    { 0xCC00, 0xCC00, 0xCC00, 0xCC00 },   // 方块
    { 0x06C0, 0x8C40, 0x6C00, 0x4620 },   // S
    { 0x0E40, 0x4C40, 0x4E00, 0x4640 },   // T
    { 0x0C60, 0x4C80, 0xC600, 0x2640 },   // Z
};

bool fall_shape_cell(int kind, int rot, int r, int c) {
    if (kind < 0 || kind >= FALL_KINDS || r < 0 || r > 3 || c < 0 || c > 3) return false;
    return (FALL_SHAPE[kind][rot & 3] & (0x8000u >> (r * 4 + c))) != 0;
}

static bool fall_hit(const fall_t *f, int kind, int rot, int x, int y) {
    for (int r = 0; r < 4; r++)
        for (int c = 0; c < 4; c++) {
            if (!fall_shape_cell(kind, rot, r, c)) continue;
            const int gx = x + c, gy = y + r;
            if (gx < 0 || gx >= FALL_COLS || gy >= FALL_ROWS) return true;
            if (gy >= 0 && f->grid[gy][gx]) return true;
        }
    return false;
}

static int8_t fall_from_bag(fall_t *f) {
    if (f->bag_pos >= FALL_KINDS) {   // 七种各一块，洗牌
        for (int i = 0; i < FALL_KINDS; i++) f->bag[i] = (uint8_t)i;
        for (int i = FALL_KINDS - 1; i > 0; i--) {
            const int j = (int)(game_rand(&f->seed) % (uint32_t)(i + 1));
            const uint8_t t = f->bag[i];
            f->bag[i] = f->bag[j];
            f->bag[j] = t;
        }
        f->bag_pos = 0;
    }
    return (int8_t)f->bag[f->bag_pos++];
}

static void fall_spawn(fall_t *f) {
    f->kind = f->next;
    f->next = fall_from_bag(f);
    f->rot = 0;
    f->x = 3;
    f->y = 0;
    f->acc_ms = 0;
    if (fall_hit(f, f->kind, f->rot, f->x, f->y)) f->phase = FALL_OVER;   // 堆到顶了
}

void fall_init(fall_t *f, uint32_t seed) {
    memset(f, 0, sizeof(*f));
    f->seed = seed ? seed : 1;
    f->bag_pos = FALL_KINDS;
    f->next = fall_from_bag(f);
    fall_spawn(f);
}

bool fall_move(fall_t *f, int dx) {
    if (f->phase != FALL_PLAYING || fall_hit(f, f->kind, f->rot, f->x + dx, f->y)) return false;
    f->x = (int8_t)(f->x + dx);
    return true;
}

bool fall_rotate(fall_t *f) {
    if (f->phase != FALL_PLAYING) return false;
    static const int8_t KICK[] = { 0, -1, 1, -2, 2 };   // 靠墙 / 靠方块转不了：挪一两格再试
    const int8_t rot = (int8_t)((f->rot + 1) & 3);
    for (size_t i = 0; i < sizeof KICK; i++)
        if (!fall_hit(f, f->kind, rot, f->x + KICK[i], f->y)) {
            f->rot = rot;
            f->x = (int8_t)(f->x + KICK[i]);
            return true;
        }
    return false;
}

int fall_ghost_y(const fall_t *f) {
    int y = f->y;
    while (!fall_hit(f, f->kind, f->rot, f->x, y + 1)) y++;
    return y;
}

int fall_level(const fall_t *f) {
    return 1 + f->lines / 10;
}

uint32_t fall_interval_ms(const fall_t *f) {
    const int ms = 800 - (fall_level(f) - 1) * 70;
    return ms < 80 ? 80 : (uint32_t)ms;
}

// 固定在格子上 → 消行 → 出下一块；回消了几行
static int fall_lock(fall_t *f) {
    for (int r = 0; r < 4; r++)
        for (int c = 0; c < 4; c++) {
            if (!fall_shape_cell(f->kind, f->rot, r, c)) continue;
            const int gy = f->y + r;
            if (gy < 0) { f->phase = FALL_OVER; return 0; }   // 有一格还在框外：堆到顶了
            f->grid[gy][f->x + c] = (uint8_t)(f->kind + 1);
        }
    f->cleared = 0;
    int n = 0;
    for (int r = FALL_ROWS - 1; r >= 0; r--) {
        bool full = true;
        for (int c = 0; c < FALL_COLS && full; c++) full = f->grid[r][c] != 0;
        if (!full) continue;
        f->cleared |= 1u << (r - n);   // 原本的第几行（上面的行已经往下挪了 n 格）
        memmove(&f->grid[1], &f->grid[0], (size_t)r * sizeof f->grid[0]);
        memset(&f->grid[0], 0, sizeof f->grid[0]);
        n++;
        r++;   // 同一行再看一次（上面那行掉下来了）
    }
    static const uint16_t POINTS[5] = { 0, 100, 300, 500, 800 };
    f->score += POINTS[n] * (uint32_t)fall_level(f);
    f->lines = (uint16_t)(f->lines + n);
    fall_spawn(f);
    return n;
}

int fall_tick(fall_t *f, uint32_t dt_ms, bool fast) {
    if (f->phase != FALL_PLAYING) return 0;
    uint32_t step = fall_interval_ms(f);
    if (fast && step > 40) step = 40;
    f->acc_ms += dt_ms;
    while (f->acc_ms >= step) {
        f->acc_ms -= step;
        if (fall_hit(f, f->kind, f->rot, f->x, f->y + 1)) return fall_lock(f);
        f->y++;
        if (fast) f->score++;   // 自己加速：每格 1 分
    }
    return 0;
}

// ---------------- 泡泡纸 ----------------
void bubble_new_sheet(bubble_t *b) {
    memset(b->popped, 0, sizeof b->popped);
    b->cursor = 0;
    b->left = BUBBLE_COUNT;
}

void bubble_init(bubble_t *b) {
    b->total = 0;
    bubble_new_sheet(b);
}

void bubble_step(bubble_t *b, int dir) {
    if (b->left <= 0) return;
    int i = b->cursor;
    for (int n = 0; n < BUBBLE_COUNT; n++) {
        i = (i + dir + BUBBLE_COUNT) % BUBBLE_COUNT;
        if (!b->popped[i]) { b->cursor = i; return; }
    }
}

bool bubble_pop(bubble_t *b) {
    if (b->left <= 0 || b->popped[b->cursor]) return false;
    b->popped[b->cursor] = true;
    b->left--;
    b->total++;
    bubble_step(b, 1);
    return true;
}

// ---------------- 狂按挑战 ----------------
void mash_init(mash_t *m) {
    memset(m, 0, sizeof(*m));
}

bool mash_press(mash_t *m, uint32_t now_ms) {
    if (m->phase == MASH_READY) {
        m->phase = MASH_RUNNING;
        m->t0 = now_ms;
        m->count = 1;
        return true;
    }
    if (m->phase != MASH_RUNNING || now_ms - m->t0 >= MASH_MS) return false;
    if (m->count < UINT16_MAX) m->count++;
    return true;
}

bool mash_tick(mash_t *m, uint32_t now_ms) {
    if (m->phase != MASH_RUNNING || now_ms - m->t0 < MASH_MS) return false;
    m->phase = MASH_OVER;
    m->end_ms = m->t0 + MASH_MS;
    if (m->count > m->best) m->best = m->count;
    return true;
}

uint32_t mash_left_ms(const mash_t *m, uint32_t now_ms) {
    if (m->phase == MASH_READY) return MASH_MS;
    if (m->phase == MASH_OVER || now_ms - m->t0 >= MASH_MS) return 0;
    return MASH_MS - (now_ms - m->t0);
}

bool mash_restart(mash_t *m, uint32_t now_ms) {
    if (m->phase != MASH_OVER || now_ms - m->end_ms < MASH_COOLDOWN_MS) return false;
    m->phase = MASH_READY;
    m->count = 0;
    return true;
}

uint16_t mash_rate_x10(const mash_t *m) {
    return (uint16_t)((uint32_t)m->count * 10000u / MASH_MS);
}

// ---------------- 捏捏乐 ----------------
void squish_init(squish_t *s) {
    memset(s, 0, sizeof(*s));
}

void squish_press(squish_t *s) {
    if (!s->held) s->count++;
    s->held = true;
}

void squish_release(squish_t *s) {
    s->held = false;
}

void squish_tick(squish_t *s, uint32_t dt_ms) {
    // 弹簧：按住时慢慢压扁（阻尼大、不晃）；放开时弹回（阻尼小、会冲过头晃几下）
    const float k = s->held ? 40.0f : 220.0f;
    const float damp = s->held ? 12.0f : 7.0f;
    const float target = s->held ? 1.0f : 0.0f;
    for (uint32_t t = 0; t < dt_ms; t += 5) {
        const float dt = 0.005f;
        s->vel += (k * (target - s->pos) - damp * s->vel) * dt;
        s->pos += s->vel * dt;
        if (s->pos > 1.0f) { s->pos = 1.0f; s->vel = 0; }
        if (s->pos < -0.5f) { s->pos = -0.5f; s->vel = 0; }
    }
}

static const uint32_t SQUISH_COLOR[SQUISH_TOYS] = { 0xF6A5C0, 0xF2D47B, 0x9FDDB8 };
static const char *const SQUISH_NAME[SQUISH_TOYS] = { "桃桃", "布丁", "抹茶" };

uint32_t squish_color(uint8_t toy) {
    return SQUISH_COLOR[toy % SQUISH_TOYS];
}

const char *squish_name(uint8_t toy) {
    return SQUISH_NAME[toy % SQUISH_TOYS];
}
