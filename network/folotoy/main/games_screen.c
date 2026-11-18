// games_screen.c —— 叠叠乐、记忆三色、求签、抽奖（LVGL 9）
//
// 叠叠乐：彩色方块一层层往上叠，最上面那块左右滑，确定放下；叠高了画面往下卷。
// 记忆三色：三个大圆（上 蓝 / 下 黄 / 确定 红），机器亮一串，照着按回去。
// 求签：签筒，确定（或按住）摇一摇，掉出一支签：等级 + 两句吉祥话。
// 抽奖：像拉霸一样跳奖项，越跳越慢停在抽中的那个。
// 落落方块：10×20 格，上下左右移、确定转、按住确定加速；上 长按暂停。
// 泡泡纸：5×6 个泡泡，确定一下捏破一个（啵）。狂按挑战：10 秒按越多越好。捏捏乐：按住确定捏扁团子，放开弹回来。
// 叠叠乐、记忆三色、落落方块、狂按挑战结束时：分数 + 名片二维码「想挑战我？扫码加我」。
// 落落方块 / 泡泡纸 / 狂按挑战 / 捏捏乐 用「按下 / 放开」（main.c 在游戏画面才转过来），反应快、连按不会被并掉。
//
// 所有函数都要在持有 bsp_lvgl_lock() 时呼叫（main.c 负责）。
#include "games_screen.h"

#include <stdio.h>
#include <string.h>

#include "bsp_display.h"
#include "esp_timer.h"
#include "games_model.h"
#include "pocket_ui.h"
#include "sound.h"

#define C_GOLD 0xF2C46B
#define TICK_MS 20

static game_kind_t s_kind;
static const char *s_url;
static uint32_t s_seed;
static lv_obj_t *s_scr;
static lv_timer_t *s_timer;
static uint32_t s_last_ms;
static lv_obj_t *s_title;
static lv_obj_t *s_hint;
static lv_obj_t *s_over;        // 结束画面（分数 + 二维码）
static lv_obj_t *s_over_score;

static uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

static lv_obj_t *rect(lv_obj_t *parent, uint32_t color, int32_t radius) {
    lv_obj_t *o = lv_obj_create(parent);
    lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_border_width(o, 0, 0);
    lv_obj_set_style_pad_all(o, 0, 0);
    lv_obj_set_style_radius(o, radius, 0);
    lv_obj_set_style_bg_color(o, lv_color_hex(color), 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
    return o;
}

// 结束画面：深色面板 + 分数 + 名片二维码 + 「确定 再来」
static void build_over(void) {
    s_over = rect(s_scr, 0x0E0B09, 0);
    lv_obj_set_size(s_over, 240, 320);
    lv_obj_set_style_bg_opa(s_over, LV_OPA_COVER, 0);
    s_over_score = ui_label(s_over, &space_font_cjk_32, C_GOLD, "");
    lv_obj_align(s_over_score, LV_ALIGN_TOP_MID, 0, 22);
    lv_obj_t *panel = rect(s_over, 0xFFFFFF, 10);
    lv_obj_set_size(panel, 132, 132);
    lv_obj_align(panel, LV_ALIGN_TOP_MID, 0, 76);
    lv_obj_t *qr = lv_qrcode_create(panel);
    lv_qrcode_set_size(qr, 120);
    lv_qrcode_set_dark_color(qr, lv_color_black());
    lv_qrcode_set_light_color(qr, lv_color_white());
    lv_qrcode_update(qr, s_url, (uint32_t)strlen(s_url));
    lv_obj_center(qr);
    lv_obj_t *t = ui_label(s_over, &space_font_cjk_20, UI_TEXT, "想挑战我？扫码加我");
    lv_obj_align(t, LV_ALIGN_TOP_MID, 0, 220);
    lv_obj_t *h = ui_label(s_over, &space_font_cjk_20, UI_MUTED, "确定 再来一局");
    lv_obj_align(h, LV_ALIGN_TOP_MID, 0, 262);
    lv_obj_add_flag(s_over, LV_OBJ_FLAG_HIDDEN);
}

static void show_over(const char *score_text) {
    lv_label_set_text(s_over_score, score_text);
    lv_obj_move_foreground(s_over);
    lv_obj_remove_flag(s_over, LV_OBJ_FLAG_HIDDEN);
}

// =====================================================================
// 叠叠乐
// =====================================================================
#define STACK_ROW_H 18
#define STACK_BOTTOM 288        // 底座的下缘（下面留给「确定 放下」）
#define STACK_VIEW_ROWS 12      // 画面上最多看到几层（再高就往下卷）
static stack_t_ s_stack;
static lv_obj_t *s_rows[STACK_VIEW_ROWS + 1];
static lv_obj_t *s_moving;
static lv_obj_t *s_cut;
static int32_t s_cut_y;
static lv_obj_t *s_score;

static uint32_t stack_color(int level) {   // 一层一个颜色，彩虹慢慢变
    static const uint32_t C[] = { 0xF6A5C0, 0xF5B98A, 0xF2D47B, 0xA9DB8A, 0x8FD3C7, 0x9FC3F2, 0xB9A6F0, 0xE6A2E0 };
    return C[level % (int)(sizeof C / sizeof C[0])];
}

// 第 level 层（0 = 底座）在画面上的 y；叠高了整个往下卷，让最上面那层停在差不多同一个高度
static int32_t stack_y(int level) {
    const int top = s_stack.n;   // 正在滑的那块是第 n 层
    const int shift = top > STACK_VIEW_ROWS - 2 ? top - (STACK_VIEW_ROWS - 2) : 0;
    return STACK_BOTTOM - (level - shift + 1) * STACK_ROW_H;
}

static void stack_draw(void) {
    // 已经叠好的：画最上面 STACK_VIEW_ROWS 层
    const int first = s_stack.n > STACK_VIEW_ROWS ? s_stack.n - STACK_VIEW_ROWS : 0;
    for (int i = 0; i <= STACK_VIEW_ROWS; i++) {
        const int lv = first + i;
        if (lv >= s_stack.n) { lv_obj_add_flag(s_rows[i], LV_OBJ_FLAG_HIDDEN); continue; }
        lv_obj_remove_flag(s_rows[i], LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_pos(s_rows[i], s_stack.left[lv], stack_y(lv));
        lv_obj_set_size(s_rows[i], s_stack.width[lv], STACK_ROW_H - 2);
        lv_obj_set_style_bg_color(s_rows[i], lv_color_hex(stack_color(lv)), 0);
    }
    // 正在滑的那块
    if (s_stack.phase == STACK_PLAYING) {
        lv_obj_remove_flag(s_moving, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_pos(s_moving, stack_moving_x(&s_stack), stack_y(s_stack.n));
        lv_obj_set_size(s_moving, stack_moving_w(&s_stack), STACK_ROW_H - 2);
        lv_obj_set_style_bg_color(s_moving, lv_color_hex(stack_color(s_stack.n)), 0);
    } else {
        lv_obj_add_flag(s_moving, LV_OBJ_FLAG_HIDDEN);
    }
    char t[12];
    snprintf(t, sizeof t, "%d", stack_score(&s_stack));
    lv_label_set_text(s_score, t);
}

static void stack_start(void) {
    stack_init(&s_stack);
    lv_obj_add_flag(s_over, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s_cut, LV_OBJ_FLAG_HIDDEN);
    stack_draw();
}

static void stack_build(void) {
    s_score = ui_label(s_scr, &space_font_digits_64, UI_TEXT, "0");
    lv_obj_align(s_score, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_opa(s_score, 120, 0);
    for (int i = 0; i <= STACK_VIEW_ROWS; i++) s_rows[i] = rect(s_scr, 0xFFFFFF, 3);
    s_moving = rect(s_scr, 0xFFFFFF, 3);
    s_cut = rect(s_scr, 0xFFFFFF, 3);
    lv_obj_set_style_bg_opa(s_cut, 160, 0);
    s_hint = ui_label(s_scr, &space_font_cjk_20, UI_MUTED, "确定 放下");
    lv_obj_align(s_hint, LV_ALIGN_BOTTOM_MID, 0, -2);
}

static void stack_tick_screen(uint32_t dt) {
    if (s_stack.phase == STACK_PLAYING) stack_tick(&s_stack, dt);
    // 切掉的那块往下掉
    if (!lv_obj_has_flag(s_cut, LV_OBJ_FLAG_HIDDEN)) {
        s_cut_y += (int32_t)dt / 3;
        lv_obj_set_y(s_cut, s_cut_y);
        if (s_cut_y > 330) lv_obj_add_flag(s_cut, LV_OBJ_FLAG_HIDDEN);
    }
    stack_draw();
}

static void stack_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (btn != SPACE_CARD_BTN_OK || ev != SPACE_CARD_EV_CLICK) return;
    if (s_stack.phase == STACK_OVER) { stack_start(); return; }
    const int level = s_stack.n;
    const bool ok = stack_drop(&s_stack);
    if (s_stack.cut_width > 0) {   // 切掉的那块：从原本的位置往下掉
        lv_obj_remove_flag(s_cut, LV_OBJ_FLAG_HIDDEN);
        s_cut_y = stack_y(level);
        lv_obj_set_pos(s_cut, s_stack.cut_left, s_cut_y);
        lv_obj_set_size(s_cut, s_stack.cut_width, STACK_ROW_H - 2);
        lv_obj_set_style_bg_color(s_cut, lv_color_hex(stack_color(level)), 0);
    }
    if (!ok) {
        sound_lose();
        char t[24];
        snprintf(t, sizeof t, "叠了 %d 层", stack_score(&s_stack));
        show_over(t);
    } else if (s_stack.perfect) {
        sound_note(84);   // 完全对齐：高一点的「叮」
    } else {
        sound_tick();
    }
    stack_draw();
}

// =====================================================================
// 记忆三色
// =====================================================================
static simon_t s_simon;
static lv_obj_t *s_pads[3];
static uint32_t s_pad_off_ms[3];   // 玩家按的：亮到几时
static const uint32_t PAD_ON[3] = { 0x5AA9F2, 0xF2D447, 0xF26B5A };
static const uint32_t PAD_OFF[3] = { 0x1D3346, 0x3D3714, 0x40201B };
static const uint8_t PAD_NOTE[3] = { 72, 76, 79 };   // C5 / E5 / G5
static int s_shown_pad = -1;

static void simon_light(int pad, bool on) {
    lv_obj_set_style_bg_color(s_pads[pad], lv_color_hex(on ? PAD_ON[pad] : PAD_OFF[pad]), 0);
}

static void simon_start(void) {
    simon_init(&s_simon, game_rand(&s_seed), now_ms());
    lv_obj_add_flag(s_over, LV_OBJ_FLAG_HIDDEN);
    for (int i = 0; i < 3; i++) { simon_light(i, false); s_pad_off_ms[i] = 0; }
    s_shown_pad = -1;
}

static void simon_build(void) {
    static const char *const NAME[3] = { "上", "下", "确定" };
    for (int i = 0; i < 3; i++) {
        s_pads[i] = rect(s_scr, PAD_OFF[i], LV_RADIUS_CIRCLE);
        lv_obj_set_size(s_pads[i], 78, 78);
        lv_obj_align(s_pads[i], LV_ALIGN_TOP_MID, 0, 46 + i * 84);
        lv_obj_t *l = ui_label(s_pads[i], &space_font_cjk_20, UI_TEXT, NAME[i]);
        lv_obj_center(l);
    }
    s_title = ui_label(s_scr, &space_font_cjk_20, UI_BRASS, "");
    lv_obj_align(s_title, LV_ALIGN_TOP_MID, 0, 12);
}

static void simon_tick_screen(void) {
    const uint32_t now = now_ms();
    const int show = simon_tick(&s_simon, now);
    if (show != s_shown_pad) {   // 机器在亮：换颜色、出声
        if (s_shown_pad >= 0) simon_light(s_shown_pad, false);
        if (show >= 0) { simon_light(show, true); sound_note(PAD_NOTE[show]); }
        s_shown_pad = show;
    }
    for (int i = 0; i < 3; i++)   // 玩家按的：亮一下就暗
        if (s_pad_off_ms[i] && (int32_t)(now - s_pad_off_ms[i]) >= 0) { simon_light(i, false); s_pad_off_ms[i] = 0; }
    char t[32];
    if (s_simon.phase == SIMON_SHOWING) snprintf(t, sizeof t, "看好 · 第 %d 题", s_simon.len);
    else if (s_simon.phase == SIMON_INPUT) snprintf(t, sizeof t, "轮到你 · %d / %d", s_simon.pos, s_simon.len);
    else snprintf(t, sizeof t, "答对 %d 题", simon_score(&s_simon));
    lv_label_set_text(s_title, t);
}

static void simon_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (ev != SPACE_CARD_EV_CLICK) return;
    if (s_simon.phase == SIMON_OVER) {
        if (btn == SPACE_CARD_BTN_OK) simon_start();
        return;
    }
    const uint32_t now = now_ms();
    const int r = simon_press(&s_simon, btn, now);
    if (r == 0) return;
    simon_light(btn, true);
    s_pad_off_ms[btn] = now + 250;
    if (r > 0) {
        sound_note(PAD_NOTE[btn]);
        if (s_simon.phase == SIMON_SHOWING) sound_win();   // 一整串都对
    } else {
        sound_lose();
        char t[24];
        snprintf(t, sizeof t, "答对 %d 题", simon_score(&s_simon));
        show_over(t);
    }
}

// =====================================================================
// 求签
// =====================================================================
static fortune_t s_fortune;
static lv_obj_t *s_tube;
static lv_obj_t *s_card;
static lv_obj_t *s_level;
static lv_obj_t *s_text;
static bool s_shaking;
static uint32_t s_shake_end;   // 摇到几时（照时间，不照格数：画面忙的时候也是 1.2 秒）

static void fortune_build(void) {
    s_title = ui_label(s_scr, &space_font_cjk_32, C_GOLD, "求签");
    lv_obj_align(s_title, LV_ALIGN_TOP_MID, 0, 16);
    // 签筒：木色圆柱 + 几支签露出来
    s_tube = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_tube, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(s_tube, 110, 190);
    lv_obj_set_style_bg_opa(s_tube, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_tube, 0, 0);
    lv_obj_set_style_pad_all(s_tube, 0, 0);
    lv_obj_align(s_tube, LV_ALIGN_TOP_MID, 0, 70);
    for (int i = 0; i < 7; i++) {
        lv_obj_t *stick = rect(s_tube, 0xE8C27A, 2);
        lv_obj_set_size(stick, 8, 80);
        lv_obj_set_pos(stick, 18 + i * 11, (i * 37) % 23);
    }
    lv_obj_t *body = rect(s_tube, 0x8A4B22, 12);
    lv_obj_set_size(body, 110, 130);
    lv_obj_set_pos(body, 0, 60);
    lv_obj_set_style_bg_grad_color(body, lv_color_hex(0x4A2410), 0);
    lv_obj_set_style_bg_grad_dir(body, LV_GRAD_DIR_HOR, 0);
    lv_obj_t *band = rect(body, C_GOLD, 0);
    lv_obj_set_size(band, 110, 6);
    lv_obj_align(band, LV_ALIGN_TOP_MID, 0, 18);
    lv_obj_t *word = ui_label(body, &space_font_cjk_32, C_GOLD, "签");
    lv_obj_align(word, LV_ALIGN_CENTER, 0, 12);
    lv_obj_set_style_transform_pivot_x(s_tube, 55, 0);
    lv_obj_set_style_transform_pivot_y(s_tube, 190, 0);

    // 抽到的签：一张直的签纸
    s_card = rect(s_scr, 0xF6EBD3, 8);
    lv_obj_set_size(s_card, 200, 200);
    lv_obj_align(s_card, LV_ALIGN_TOP_MID, 0, 62);
    s_level = ui_label(s_card, &space_font_cjk_32, 0xB0302A, "");
    lv_obj_align(s_level, LV_ALIGN_TOP_MID, 0, 18);
    s_text = ui_label(s_card, &space_font_cjk_20, 0x3A2A1C, "");
    lv_obj_set_width(s_text, 180);
    lv_label_set_long_mode(s_text, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(s_text, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_line_space(s_text, 8, 0);
    lv_obj_align(s_text, LV_ALIGN_TOP_MID, 0, 82);
    lv_obj_add_flag(s_card, LV_OBJ_FLAG_HIDDEN);

    s_hint = ui_hint(s_scr, 274, "确定 摇签");
    fortune_init(&s_fortune, game_rand(&s_seed));
}

static void fortune_tick_screen(void) {
    if (!s_shaking) return;
    const uint32_t now = now_ms();
    static uint32_t last_tick_sound;
    lv_obj_set_style_transform_rotation(s_tube, ((now / 60) % 2) ? 90 : -90, 0);   // ±9°，每 60ms 换边
    if (now - last_tick_sound >= 120) { sound_tick(); last_tick_sound = now; }
    if ((int32_t)(now - s_shake_end) >= 0) {   // 摇完：掉出一支签
        s_shaking = false;
        lv_obj_set_style_transform_rotation(s_tube, 0, 0);
        const int i = fortune_draw(&s_fortune);
        lv_label_set_text(s_level, fortune_level(i));
        lv_label_set_text(s_text, fortune_text(i));
        lv_obj_add_flag(s_tube, LV_OBJ_FLAG_HIDDEN);
        lv_obj_remove_flag(s_card, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_hint, "确定 再抽一支");
        if (strcmp(fortune_level(i), "上上签") == 0) sound_win();
    }
}

static void fortune_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (btn != SPACE_CARD_BTN_OK || (ev != SPACE_CARD_EV_CLICK && ev != SPACE_CARD_EV_LONG) || s_shaking) return;
    lv_obj_add_flag(s_card, LV_OBJ_FLAG_HIDDEN);
    lv_obj_remove_flag(s_tube, LV_OBJ_FLAG_HIDDEN);
    lv_label_set_text(s_hint, "摇呀摇…");
    s_shaking = true;
    s_shake_end = now_ms() + 1200;
}

// =====================================================================
// 抽奖
// =====================================================================
static lv_obj_t *s_slot;
static lv_obj_t *s_slot_text;
static int s_slot_idx;
static int s_slot_steps;      // 还要跳几下；0 = 停了
static uint32_t s_slot_next;  // 下一下几时跳
static uint32_t s_slot_gap;   // 现在每下间隔（越来越长）
static int s_slot_target;

static void lottery_show_idx(int i, bool final) {
    lv_label_set_text(s_slot_text, lottery_prize(i));
    lv_obj_set_style_bg_color(s_slot, lv_color_hex(final ? (i == LOTTERY_PRIZES - 1 ? 0x4A423A : 0xC8A46B) : 0x2A2420), 0);
    lv_obj_set_style_text_color(s_slot_text, lv_color_hex(final && i != LOTTERY_PRIZES - 1 ? 0x14110F : 0xF4EFE6), 0);
}

static void lottery_build(void) {
    s_title = ui_label(s_scr, &space_font_cjk_32, C_GOLD, "抽奖");
    lv_obj_align(s_title, LV_ALIGN_TOP_MID, 0, 16);
    s_slot = rect(s_scr, 0x2A2420, 16);
    lv_obj_set_size(s_slot, 200, 110);
    lv_obj_align(s_slot, LV_ALIGN_TOP_MID, 0, 90);
    lv_obj_set_style_border_width(s_slot, 3, 0);
    lv_obj_set_style_border_color(s_slot, lv_color_hex(C_GOLD), 0);
    s_slot_text = ui_label(s_slot, &space_font_cjk_32, UI_TEXT, "");
    lv_obj_center(s_slot_text);
    // 奖项一览（小字）
    char list[96] = "";
    for (int i = 0; i < LOTTERY_PRIZES; i++) {   // 两个一行，不会在字中间折行
        strncat(list, lottery_prize(i), sizeof list - strlen(list) - 1);
        if (i + 1 < LOTTERY_PRIZES) strncat(list, i % 2 ? "\n" : " · ", sizeof list - strlen(list) - 1);
    }
    lv_obj_t *l = ui_hint(s_scr, 214, list);
    lv_obj_set_style_text_color(l, lv_color_hex(0x8A8178), 0);
    s_hint = ui_hint(s_scr, 274, "确定 抽奖");
    s_slot_idx = 0;
    s_slot_steps = 0;
    lottery_show_idx(0, false);
}

static void lottery_tick_screen(void) {
    if (s_slot_steps <= 0) return;
    const uint32_t now = now_ms();
    if ((int32_t)(now - s_slot_next) < 0) return;
    s_slot_idx = (s_slot_idx + 1) % LOTTERY_PRIZES;
    s_slot_steps--;
    const bool final = s_slot_steps == 0;
    lottery_show_idx(s_slot_idx, final);
    if (final) {
        if (s_slot_idx == LOTTERY_PRIZES - 1) sound_lose();
        else sound_win();
        lv_label_set_text(s_hint, "确定 再抽一次");
        return;
    }
    sound_tick();
    s_slot_gap = s_slot_gap + s_slot_gap / 9 + 4;   // 越跳越慢
    s_slot_next = now + s_slot_gap;
}

static void lottery_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (btn != SPACE_CARD_BTN_OK || ev != SPACE_CARD_EV_CLICK || s_slot_steps > 0) return;
    s_slot_target = lottery_draw(&s_seed);
    // 先跳几圈，最后刚好停在抽中的那个
    const int to_target = (s_slot_target - s_slot_idx + LOTTERY_PRIZES) % LOTTERY_PRIZES;
    s_slot_steps = 5 * LOTTERY_PRIZES + to_target;
    if (s_slot_steps == 5 * LOTTERY_PRIZES) s_slot_steps += LOTTERY_PRIZES;   // 至少多跳一圈
    s_slot_gap = 50;
    s_slot_next = now_ms();
    lv_label_set_text(s_hint, "转呀转…");
}

// =====================================================================
// 落落方块
// =====================================================================
// 左边 10×20 格的场地（一格 13px），右边：下一块、分数、行数、等级。
// 上 / 下：左右移（按住连续移）｜确定 短按：转｜确定 按住：加速往下掉｜上 长按：暂停（暂停时再长按回菜单）
#define FC 13                    // 一格几 px
#define FBX 14                   // 场地左上角
#define FBY 26
#define FALL_HOLD_MS 220         // 按住多久算「按住」（不是点一下）
#define FALL_REPEAT_MS 80        // 按住左右：每几毫秒移一格
static const uint32_t FALL_COLOR[FALL_KINDS] = { 0x8FD3C7, 0x9FC3F2, 0xF5B98A, 0xF2D47B, 0xA9DB8A, 0xB9A6F0, 0xF6A5C0 };
static fall_t s_fall;
static bool s_fall_started;
static lv_obj_t *s_board;
static lv_obj_t *s_next;
static lv_obj_t *s_fall_msg;
static lv_obj_t *s_fall_val[3];   // 分数 / 行数 / 等级
static int8_t s_hold_dir;         // 按住上 / 下：-1 / 1
static uint32_t s_hold_next;
static uint32_t s_ok_down;        // 确定按下的时间（0 = 没按）
static uint32_t s_flash_until;
static uint32_t s_flash_rows;
static uint32_t s_over_at;        // 结束的时间（刚结束的按键不算「再来」）
static int32_t s_drawn_key = -1;  // 上次画的位置（没变就不重画）

static void cell(lv_layer_t *layer, int32_t x, int32_t y, int32_t size, uint32_t color, bool ghost) {
    lv_draw_rect_dsc_t d;
    lv_draw_rect_dsc_init(&d);
    d.radius = 2;
    d.bg_color = lv_color_hex(color);
    d.bg_opa = ghost ? LV_OPA_TRANSP : LV_OPA_COVER;
    if (ghost) { d.border_color = lv_color_hex(color); d.border_width = 1; d.border_opa = 140; }
    const lv_area_t a = { x, y, x + size - 1, y + size - 1 };
    lv_draw_rect(layer, &d, &a);
}

static void board_draw_cb(lv_event_t *e) {
    lv_layer_t *layer = lv_event_get_layer(e);
    for (int r = 0; r < FALL_ROWS; r++)
        for (int c = 0; c < FALL_COLS; c++)
            if (s_fall.grid[r][c]) cell(layer, FBX + c * FC, FBY + r * FC, FC - 1, FALL_COLOR[s_fall.grid[r][c] - 1], false);
    if (s_fall.phase != FALL_OVER && s_fall_started) {
        const int gy = fall_ghost_y(&s_fall);
        for (int pass = 0; pass < 2; pass++)   // 先画虚影（落下会停在哪），再画方块本身
            for (int r = 0; r < 4; r++)
                for (int c = 0; c < 4; c++) {
                    if (!fall_shape_cell(s_fall.kind, s_fall.rot, r, c)) continue;
                    const int y = (pass ? s_fall.y : gy) + r;
                    if (y >= 0) cell(layer, FBX + (s_fall.x + c) * FC, FBY + y * FC, FC - 1, FALL_COLOR[s_fall.kind], !pass);
                }
    }
    if (s_flash_rows && (int32_t)(now_ms() - s_flash_until) < 0) {   // 刚消掉的行：白光闪一下
        lv_draw_rect_dsc_t d;
        lv_draw_rect_dsc_init(&d);
        d.bg_color = lv_color_white();
        d.bg_opa = 170;
        for (int r = 0; r < FALL_ROWS; r++)
            if (s_flash_rows & (1u << r)) {
                const lv_area_t a = { FBX, FBY + r * FC, FBX + FALL_COLS * FC - 2, FBY + r * FC + FC - 2 };
                lv_draw_rect(layer, &d, &a);
            }
    }
}

static void next_draw_cb(lv_event_t *e) {
    lv_layer_t *layer = lv_event_get_layer(e);
    lv_area_t box;
    lv_obj_get_coords(lv_event_get_target_obj(e), &box);
    int r0 = 4, r1 = -1, c0 = 4, c1 = -1;   // 这块实际占的范围（放在框中间）
    for (int r = 0; r < 4; r++)
        for (int c = 0; c < 4; c++)
            if (fall_shape_cell(s_fall.next, 0, r, c)) {
                if (r < r0) r0 = r;
                if (r > r1) r1 = r;
                if (c < c0) c0 = c;
                if (c > c1) c1 = c;
            }
    const int32_t sz = 12;
    const int32_t ox = box.x1 + (lv_area_get_width(&box) - (c1 - c0 + 1) * sz) / 2;
    const int32_t oy = box.y1 + (lv_area_get_height(&box) - (r1 - r0 + 1) * sz) / 2;
    for (int r = r0; r <= r1; r++)
        for (int c = c0; c <= c1; c++)
            if (fall_shape_cell(s_fall.next, 0, r, c)) cell(layer, ox + (c - c0) * sz, oy + (r - r0) * sz, sz - 1, FALL_COLOR[s_fall.next], false);
}

static void fall_update_text(void) {
    char t[16];
    snprintf(t, sizeof t, "%lu", (unsigned long)s_fall.score);
    lv_label_set_text(s_fall_val[0], t);
    snprintf(t, sizeof t, "%u", (unsigned)s_fall.lines);
    lv_label_set_text(s_fall_val[1], t);
    snprintf(t, sizeof t, "%d", fall_level(&s_fall));
    lv_label_set_text(s_fall_val[2], t);
}

static void fall_message(const char *text) {   // 场地中间的说明（开始 / 暂停）；NULL = 收起来
    if (!text) { lv_obj_add_flag(s_fall_msg, LV_OBJ_FLAG_HIDDEN); return; }
    lv_label_set_text(s_fall_msg, text);
    lv_obj_remove_flag(s_fall_msg, LV_OBJ_FLAG_HIDDEN);
}

static void fall_start(void) {
    fall_init(&s_fall, game_rand(&s_seed));
    s_fall_started = false;
    s_hold_dir = 0;
    s_ok_down = 0;
    s_flash_rows = 0;
    s_drawn_key = -1;
    lv_obj_add_flag(s_over, LV_OBJ_FLAG_HIDDEN);
    fall_message("上 左移\n下 右移\n确定 转\n按住确定 加速\n\n确定 开始");
    fall_update_text();
    lv_obj_invalidate(s_board);
    lv_obj_invalidate(s_next);
}

static void fall_build(void) {
    lv_obj_t *bg = rect(s_scr, 0x1E1A17, 4);   // 场地底色
    lv_obj_set_pos(bg, FBX - 3, FBY - 3);
    lv_obj_set_size(bg, FALL_COLS * FC + 5, FALL_ROWS * FC + 5);
    lv_obj_set_style_border_width(bg, 1, 0);
    lv_obj_set_style_border_color(bg, lv_color_hex(UI_LINE), 0);
    s_board = lv_obj_create(s_scr);   // 透明的一层：格子在它的 draw 事件里画（200 格不用开 200 个物件）
    lv_obj_remove_style_all(s_board);
    lv_obj_remove_flag(s_board, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_pos(s_board, FBX - 1, FBY - 1);
    lv_obj_set_size(s_board, FALL_COLS * FC + 1, FALL_ROWS * FC + 1);
    lv_obj_add_event_cb(s_board, board_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    const int32_t px = 69;   // 右栏中线（相对屏幕中线）
    lv_obj_t *l = ui_label(s_scr, &space_font_cjk_20, UI_MUTED, "下一个");
    lv_obj_align(l, LV_ALIGN_TOP_MID, px, 22);
    s_next = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_next);
    lv_obj_remove_flag(s_next, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(s_next, 60, 40);
    lv_obj_align(s_next, LV_ALIGN_TOP_MID, px, 52);
    lv_obj_add_event_cb(s_next, next_draw_cb, LV_EVENT_DRAW_MAIN, NULL);
    static const char *const NAME[3] = { "分数", "行数", "等级" };
    for (int i = 0; i < 3; i++) {
        l = ui_label(s_scr, &space_font_cjk_20, UI_MUTED, NAME[i]);
        lv_obj_align(l, LV_ALIGN_TOP_MID, px, 104 + i * 62);
        s_fall_val[i] = ui_label(s_scr, &space_font_cjk_20, i == 0 ? C_GOLD : UI_TEXT, "0");
        lv_obj_align(s_fall_val[i], LV_ALIGN_TOP_MID, px, 128 + i * 62);
    }
    s_fall_msg = ui_label(s_scr, &space_font_cjk_20, UI_TEXT, "");
    lv_obj_set_width(s_fall_msg, FALL_COLS * FC);
    lv_obj_set_style_text_align(s_fall_msg, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_line_space(s_fall_msg, 4, 0);
    lv_obj_set_style_bg_color(s_fall_msg, lv_color_hex(0x1E1A17), 0);
    lv_obj_set_style_bg_opa(s_fall_msg, 225, 0);
    lv_obj_set_style_pad_ver(s_fall_msg, 10, 0);
    lv_obj_align(s_fall_msg, LV_ALIGN_TOP_LEFT, FBX - 1, FBY + 50);
}

static void fall_game_over(void) {
    sound_lose();
    s_over_at = now_ms();
    s_hold_dir = 0;
    s_ok_down = 0;
    char t[24];
    snprintf(t, sizeof t, "消了 %u 行", (unsigned)s_fall.lines);
    show_over(t);
}

static void fall_tick_screen(uint32_t dt) {
    if (!s_fall_started || s_fall.phase != FALL_PLAYING) return;
    const uint32_t now = now_ms();
    if (s_hold_dir && (int32_t)(now - s_hold_next) >= 0) {   // 按住左右：连续移
        fall_move(&s_fall, s_hold_dir);
        s_hold_next = now + FALL_REPEAT_MS;
    }
    const int8_t kind = s_fall.next;
    const bool fast = s_ok_down && now - s_ok_down >= FALL_HOLD_MS;
    const int lines = fall_tick(&s_fall, dt, fast);
    if (lines > 0) {
        s_flash_rows = s_fall.cleared;
        s_flash_until = now + 180;
        if (lines >= 4) sound_win();
        else sound_note((uint8_t)(76 + lines * 3));
    }
    if (kind != s_fall.next) {   // 刚落地、换下一块了：加速停掉（要再按住才加速，不会连下一块一起冲下去）
        s_ok_down = 0;
        lv_obj_invalidate(s_next);
        fall_update_text();
    }
    else if (fast) fall_update_text();
    const int32_t key = s_fall.x | s_fall.y << 8 | s_fall.rot << 16 | s_fall.kind << 20;
    if (key != s_drawn_key || s_flash_rows) {
        lv_obj_invalidate(s_board);
        s_drawn_key = key;
        if (s_flash_rows && (int32_t)(now - s_flash_until) >= 0) s_flash_rows = 0;   // 闪完这一下再收
    }
    if (s_fall.phase == FALL_OVER) { lv_obj_invalidate(s_board); fall_game_over(); }
}

// 上 长按：玩的时候 = 暂停（回 true，不离开）；暂停 / 还没开始 / 结束时 = 回菜单（回 false）
static bool fall_long_up(void) {
    if (s_fall.phase != FALL_PLAYING || !s_fall_started) return false;
    s_fall.phase = FALL_PAUSED;
    s_hold_dir = 0;
    s_ok_down = 0;
    fall_message("暂停\n\n确定 继续\n上 长按 回菜单");
    return true;
}

static void fall_key(space_card_btn_t btn, space_card_ev_t ev) {
    const uint32_t now = now_ms();
    if (s_fall.phase == FALL_OVER) {
        if (btn == SPACE_CARD_BTN_OK && ev == SPACE_CARD_EV_CLICK && now - s_over_at > 800) fall_start();
        return;
    }
    if (!s_fall_started || s_fall.phase == FALL_PAUSED) {   // 开始 / 继续：确定按下去那一下
        if (btn == SPACE_CARD_BTN_OK && ev == SPACE_CARD_EV_PRESS) {
            s_fall_started = true;
            s_fall.phase = FALL_PLAYING;
            fall_message(NULL);
            lv_obj_invalidate(s_board);
        }
        return;
    }
    if (btn == SPACE_CARD_BTN_OK) {
        if (ev == SPACE_CARD_EV_PRESS) s_ok_down = now ? now : 1;
        else if (ev == SPACE_CARD_EV_RELEASE && s_ok_down) {
            if (now - s_ok_down < FALL_HOLD_MS) fall_rotate(&s_fall);   // 点一下：转
            s_ok_down = 0;
        }
        return;
    }
    const int8_t dir = btn == SPACE_CARD_BTN_UP ? -1 : 1;
    if (ev == SPACE_CARD_EV_PRESS) {
        fall_move(&s_fall, dir);
        s_hold_dir = dir;
        s_hold_next = now + FALL_HOLD_MS;
    } else if (ev == SPACE_CARD_EV_RELEASE && s_hold_dir == dir) {
        s_hold_dir = 0;
    }
}

// =====================================================================
// 泡泡纸
// =====================================================================
// 5×6 个泡泡（直径 34），选到的那个黄铜色框；确定 捏破（啵），自动跳到下一个。
#define BUB_D 34
#define BUB_PITCH 40
#define BUB_X 20
#define BUB_Y 40
static bubble_t s_bub;
static lv_obj_t *s_sheet;
static lv_obj_t *s_bub_count;
static int s_pop_idx = -1;        // 刚捏破的那个（画一圈爆开的光）
static uint32_t s_pop_until;
static uint32_t s_bub_done_at;    // 整张捏完的时间

static void sheet_draw_cb(lv_event_t *e) {
    lv_layer_t *layer = lv_event_get_layer(e);
    lv_draw_rect_dsc_t d;
    for (int i = 0; i < BUBBLE_COUNT; i++) {
        const int32_t x = BUB_X + (i % BUBBLE_COLS) * BUB_PITCH + (BUB_PITCH - BUB_D) / 2;
        const int32_t y = BUB_Y + (i / BUBBLE_COLS) * BUB_PITCH + (BUB_PITCH - BUB_D) / 2;
        lv_area_t a = { x, y, x + BUB_D - 1, y + BUB_D - 1 };
        lv_draw_rect_dsc_init(&d);
        d.radius = LV_RADIUS_CIRCLE;
        if (s_bub.popped[i]) {   // 破掉的：扁扁的、皱皱的一圈
            d.bg_color = lv_color_hex(0x221D1A);
            d.border_color = lv_color_hex(0x4A443E);
            d.border_width = 2;
            lv_area_t f = { x + 3, y + 7, x + BUB_D - 4, y + BUB_D - 8 };
            lv_draw_rect(layer, &d, &f);
        } else {                 // 鼓鼓的：半透明 + 左上一点反光
            d.bg_color = lv_color_hex(0xC4DCE8);
            d.bg_grad.dir = LV_GRAD_DIR_VER;
            d.bg_grad.stops[0].color = lv_color_hex(0xE6F3F9);
            d.bg_grad.stops[0].opa = LV_OPA_COVER;
            d.bg_grad.stops[1].color = lv_color_hex(0x86A7B8);
            d.bg_grad.stops[1].opa = LV_OPA_COVER;
            d.bg_grad.stops[1].frac = 255;
            d.bg_grad.stops_count = 2;
            lv_draw_rect(layer, &d, &a);
            lv_draw_rect_dsc_init(&d);
            d.radius = LV_RADIUS_CIRCLE;
            d.bg_color = lv_color_white();
            d.bg_opa = 210;
            lv_area_t s = { x + 8, y + 6, x + 15, y + 12 };
            lv_draw_rect(layer, &d, &s);
        }
        if (i == s_pop_idx && (int32_t)(now_ms() - s_pop_until) < 0) {   // 刚捏破：一圈金光
            lv_draw_rect_dsc_init(&d);
            d.radius = LV_RADIUS_CIRCLE;
            d.bg_opa = LV_OPA_TRANSP;
            d.border_color = lv_color_hex(C_GOLD);
            d.border_width = 2;
            lv_area_t g = { a.x1 - 3, a.y1 - 3, a.x2 + 3, a.y2 + 3 };
            lv_draw_rect(layer, &d, &g);
        }
        if (i == s_bub.cursor && s_bub.left > 0) {   // 选到的：黄铜色框
            lv_draw_rect_dsc_init(&d);
            d.radius = LV_RADIUS_CIRCLE;
            d.bg_opa = LV_OPA_TRANSP;
            d.border_color = lv_color_hex(UI_BRASS);
            d.border_width = 3;
            lv_area_t c = { a.x1 - 2, a.y1 - 2, a.x2 + 2, a.y2 + 2 };
            lv_draw_rect(layer, &d, &c);
        }
    }
}

static void bubble_update(void) {
    char t[64];
    if (s_bub.left > 0) snprintf(t, sizeof t, "还剩 %d 个 · 共捏 %lu", s_bub.left, (unsigned long)s_bub.total);
    else snprintf(t, sizeof t, "全部捏完！共捏 %lu", (unsigned long)s_bub.total);
    lv_label_set_text(s_bub_count, t);
    lv_label_set_text(s_hint, s_bub.left > 0 ? "确定 捏 · 上下 换一个" : "确定 换一张新的");
    lv_obj_invalidate(s_sheet);
}

static void bubble_build(void) {
    bubble_init(&s_bub);
    s_bub_count = ui_label(s_scr, &space_font_cjk_20, UI_BRASS, "");
    lv_obj_align(s_bub_count, LV_ALIGN_TOP_MID, 0, 10);
    s_sheet = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_sheet);
    lv_obj_remove_flag(s_sheet, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_pos(s_sheet, BUB_X - 4, BUB_Y - 4);
    lv_obj_set_size(s_sheet, BUBBLE_COLS * BUB_PITCH + 8, BUBBLE_ROWS * BUB_PITCH + 8);
    lv_obj_add_event_cb(s_sheet, sheet_draw_cb, LV_EVENT_DRAW_MAIN, NULL);
    s_hint = ui_hint(s_scr, BUB_Y + BUBBLE_ROWS * BUB_PITCH + 8, "");
    bubble_update();
}

static void bubble_tick_screen(void) {
    if (s_pop_idx >= 0 && (int32_t)(now_ms() - s_pop_until) >= 0) {   // 金光收起来
        s_pop_idx = -1;
        lv_obj_invalidate(s_sheet);
    }
}

static void bubble_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (ev != SPACE_CARD_EV_PRESS) return;   // 按下去那一下就动（不等放开）
    const uint32_t now = now_ms();
    if (btn == SPACE_CARD_BTN_OK) {
        if (s_bub.left == 0) {
            if (now - s_bub_done_at < 600) return;   // 刚捏完最后一个：先看一下「全部捏完」
            bubble_new_sheet(&s_bub);
        } else {
            const int i = s_bub.cursor;
            if (!bubble_pop(&s_bub)) return;
            s_pop_idx = i;
            s_pop_until = now + 160;
            sound_tick();
            if (s_bub.left == 0) { s_bub_done_at = now; sound_win(); }
        }
    } else {
        bubble_step(&s_bub, btn == SPACE_CARD_BTN_UP ? -1 : 1);
    }
    bubble_update();
}

// =====================================================================
// 狂按挑战
// =====================================================================
// 大数字 = 按了几下；下面一条时间条。三个键都算，第一下就开始计时。
static mash_t s_mash;
static lv_obj_t *s_mash_num;
static lv_obj_t *s_mash_bar;
static lv_obj_t *s_mash_time;

static void mash_update(void) {
    const uint32_t now = now_ms();
    char t[64];
    snprintf(t, sizeof t, "%u", (unsigned)s_mash.count);
    lv_label_set_text(s_mash_num, t);
    lv_obj_set_style_text_font(s_mash_num, s_mash.count >= 100 ? &space_font_digits_64 : &space_font_digits_140, 0);
    const uint32_t left = mash_left_ms(&s_mash, now);
    lv_obj_set_width(s_mash_bar, (int32_t)(200 * left / MASH_MS));
    snprintf(t, sizeof t, "还有 %lu.%lu 秒", (unsigned long)(left / 1000), (unsigned long)(left % 1000 / 100));
    lv_label_set_text(s_mash_time, t);
    if (s_mash.phase == MASH_READY) {
        if (s_mash.best) snprintf(t, sizeof t, "按任何键开始\n最高纪录 %u 下", (unsigned)s_mash.best);
        else snprintf(t, sizeof t, "按任何键开始\n10 秒内按越多越好");
        lv_label_set_text(s_hint, t);
    } else if (s_mash.phase == MASH_RUNNING) {
        lv_label_set_text(s_hint, "快按！快按！");
    }
}

static void mash_build(void) {
    mash_init(&s_mash);
    s_title = ui_label(s_scr, &space_font_cjk_32, C_GOLD, "狂按挑战");
    lv_obj_align(s_title, LV_ALIGN_TOP_MID, 0, 14);
    s_mash_num = ui_label(s_scr, &space_font_digits_140, UI_TEXT, "0");
    lv_obj_align(s_mash_num, LV_ALIGN_TOP_MID, 0, 38);
    lv_obj_t *track = rect(s_scr, UI_LINE, 5);
    lv_obj_set_size(track, 200, 10);
    lv_obj_align(track, LV_ALIGN_TOP_MID, 0, 214);
    s_mash_bar = rect(track, C_GOLD, 5);
    lv_obj_set_size(s_mash_bar, 200, 10);
    s_mash_time = ui_label(s_scr, &space_font_cjk_20, UI_MUTED, "");
    lv_obj_align(s_mash_time, LV_ALIGN_TOP_MID, 0, 230);
    s_hint = ui_hint(s_scr, 262, "");
    mash_update();
}

static void mash_tick_screen(void) {
    if (s_mash.phase != MASH_RUNNING) return;
    if (mash_tick(&s_mash, now_ms())) {
        sound_win();
        mash_update();
        char t[24];
        snprintf(t, sizeof t, "10 秒 %u 下", (unsigned)s_mash.count);
        show_over(t);
        return;
    }
    mash_update();
}

static void mash_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (ev != SPACE_CARD_EV_PRESS) return;   // 按下去就算（单击要等放开、连按会被并成一次）
    const uint32_t now = now_ms();
    if (s_mash.phase == MASH_OVER) {
        if (btn == SPACE_CARD_BTN_OK && mash_restart(&s_mash, now)) {
            lv_obj_add_flag(s_over, LV_OBJ_FLAG_HIDDEN);
            mash_update();
        }
        return;
    }
    if (mash_press(&s_mash, now)) {
        sound_tick();
        mash_update();
    }
}

// =====================================================================
// 捏捏乐
// =====================================================================
// 一颗软软的团子站在地上：确定按住 → 压扁、眯眼、嘴巴变 O；放开 → 弹起来晃几下。
#define SQ_BASE 140
#define SQ_FLOOR 236
static squish_t s_sq;
static lv_obj_t *s_blob;
static lv_obj_t *s_eye[2];
static lv_obj_t *s_cheek[2];
static lv_obj_t *s_mouth;
static lv_obj_t *s_shine;
static lv_obj_t *s_sq_title;

static void squish_draw(void) {
    const float p = s_sq.pos;
    const int32_t w = (int32_t)(SQ_BASE * (1.0f + 0.45f * p));
    const int32_t h = (int32_t)(SQ_BASE * (1.0f - 0.45f * p));
    const int32_t lift = p < 0 ? (int32_t)(-p * 60.0f) : 0;   // 弹起来时离地
    lv_obj_set_size(s_blob, w, h);
    lv_obj_set_pos(s_blob, 120 - w / 2, SQ_FLOOR - h - lift);
    const bool squeezed = p > 0.55f;
    for (int i = 0; i < 2; i++) {
        const int32_t sx = i ? 1 : -1;
        lv_obj_set_size(s_eye[i], squeezed ? 16 : 11, squeezed ? 4 : 13);   // 捏扁时眯成一条线
        lv_obj_align(s_eye[i], LV_ALIGN_CENTER, sx * w * 18 / 100, -h * 8 / 100);
        lv_obj_align(s_cheek[i], LV_ALIGN_CENTER, sx * w * 31 / 100, h * 8 / 100);
    }
    if (squeezed) lv_obj_set_size(s_mouth, 14, 14);   // 「O」
    else lv_obj_set_size(s_mouth, 18, 7);
    lv_obj_align(s_mouth, LV_ALIGN_CENTER, 0, h * 14 / 100);
    lv_obj_align(s_shine, LV_ALIGN_TOP_LEFT, w * 20 / 100, h * 12 / 100);
}

static void squish_update_text(void) {
    char t[64];
    snprintf(t, sizeof t, "%s · 捏了 %lu 下", squish_name(s_sq.toy), (unsigned long)s_sq.count);
    lv_label_set_text(s_sq_title, t);
    lv_obj_set_style_bg_color(s_blob, lv_color_hex(squish_color(s_sq.toy)), 0);
}

static void squish_build(void) {
    squish_init(&s_sq);
    s_sq_title = ui_label(s_scr, &space_font_cjk_20, UI_BRASS, "");
    lv_obj_align(s_sq_title, LV_ALIGN_TOP_MID, 0, 12);
    lv_obj_t *floor = rect(s_scr, UI_LINE, 2);
    lv_obj_set_size(floor, 190, 4);
    lv_obj_align(floor, LV_ALIGN_TOP_MID, 0, SQ_FLOOR);
    s_blob = rect(s_scr, squish_color(0), LV_RADIUS_CIRCLE);
    s_shine = rect(s_blob, 0xFFFFFF, LV_RADIUS_CIRCLE);
    lv_obj_set_size(s_shine, 22, 12);
    lv_obj_set_style_bg_opa(s_shine, 120, 0);
    for (int i = 0; i < 2; i++) {
        s_cheek[i] = rect(s_blob, 0xE8708F, LV_RADIUS_CIRCLE);
        lv_obj_set_size(s_cheek[i], 20, 10);
        lv_obj_set_style_bg_opa(s_cheek[i], 110, 0);
        s_eye[i] = rect(s_blob, 0x3A2A1C, LV_RADIUS_CIRCLE);
    }
    s_mouth = rect(s_blob, 0x3A2A1C, LV_RADIUS_CIRCLE);
    s_hint = ui_hint(s_scr, 256, "按住确定 捏一捏\n上下 换颜色");
    squish_update_text();
    squish_draw();
}

static void squish_tick_screen(uint32_t dt) {
    if (!s_sq.held && s_sq.pos > -0.005f && s_sq.pos < 0.005f && s_sq.vel > -0.05f && s_sq.vel < 0.05f) return;   // 静止：不用重画
    squish_tick(&s_sq, dt);
    squish_draw();
}

static void squish_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (btn == SPACE_CARD_BTN_OK) {
        if (ev == SPACE_CARD_EV_PRESS) { squish_press(&s_sq); sound_note(55); squish_update_text(); }
        else if (ev == SPACE_CARD_EV_RELEASE && s_sq.held) { squish_release(&s_sq); sound_note(79); }
        return;
    }
    if (ev != SPACE_CARD_EV_PRESS) return;
    s_sq.toy = (uint8_t)((s_sq.toy + (btn == SPACE_CARD_BTN_UP ? SQUISH_TOYS - 1 : 1)) % SQUISH_TOYS);
    squish_update_text();
}

// =====================================================================
// 共用
// =====================================================================
static void tick_cb(lv_timer_t *t) {
    (void)t;
    const uint32_t now = now_ms();
    const uint32_t dt = now - s_last_ms;
    s_last_ms = now;
    switch (s_kind) {
    case GAME_STACK: stack_tick_screen(dt > 100 ? 100 : dt); break;
    case GAME_SIMON: simon_tick_screen(); break;
    case GAME_FORTUNE: fortune_tick_screen(); break;
    case GAME_LOTTERY: lottery_tick_screen(); break;
    case GAME_FALL: fall_tick_screen(dt > 100 ? 100 : dt); break;
    case GAME_BUBBLE: bubble_tick_screen(); break;
    case GAME_MASH: mash_tick_screen(); break;
    case GAME_SQUISH: squish_tick_screen(dt > 100 ? 100 : dt); break;
    }
}

void games_screen_show(game_kind_t kind, const char *card_url, uint32_t seed) {
    s_kind = kind;
    s_url = card_url ? card_url : "";
    s_seed = seed ? seed : 1;
    s_scr = ui_screen();
    switch (kind) {
    case GAME_STACK: stack_build(); break;
    case GAME_SIMON: simon_build(); break;
    case GAME_FORTUNE: fortune_build(); break;
    case GAME_LOTTERY: lottery_build(); break;
    case GAME_FALL: fall_build(); break;
    case GAME_BUBBLE: bubble_build(); break;
    case GAME_MASH: mash_build(); break;
    case GAME_SQUISH: squish_build(); break;
    }
    build_over();
    if (kind == GAME_STACK) stack_start();
    if (kind == GAME_SIMON) simon_start();
    if (kind == GAME_FALL) fall_start();
    s_shaking = false;
    s_last_ms = now_ms();
    lv_screen_load(s_scr);
    bsp_display_backlight(100);
    sound_start();
    s_timer = lv_timer_create(tick_cb, TICK_MS, NULL);
}

bool games_screen_on_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return !(s_kind == GAME_FALL && fall_long_up());
    switch (s_kind) {
    case GAME_STACK: stack_key(btn, ev); break;
    case GAME_SIMON: simon_key(btn, ev); break;
    case GAME_FORTUNE: fortune_key(btn, ev); break;
    case GAME_LOTTERY: lottery_key(btn, ev); break;
    case GAME_FALL: fall_key(btn, ev); break;
    case GAME_BUBBLE: bubble_key(btn, ev); break;
    case GAME_MASH: mash_key(btn, ev); break;
    case GAME_SQUISH: squish_key(btn, ev); break;
    }
    return false;
}

void games_screen_hide(void) {
    if (s_timer) lv_timer_delete(s_timer);
    s_timer = NULL;
}

bool games_screen_is_over(void) {
    if (s_kind == GAME_STACK) return s_stack.phase == STACK_OVER;
    if (s_kind == GAME_SIMON) return s_simon.phase == SIMON_OVER;
    if (s_kind == GAME_FALL) return s_fall.phase == FALL_OVER;
    if (s_kind == GAME_MASH) return s_mash.phase == MASH_OVER;
    return false;
}
