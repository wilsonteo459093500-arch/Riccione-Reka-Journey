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
