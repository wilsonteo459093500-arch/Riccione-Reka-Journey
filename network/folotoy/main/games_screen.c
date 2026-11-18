// games_screen.c —— 叠叠乐、记忆三色、求签、抽奖（LVGL 9）
//
// 叠叠乐：彩色方块一层层往上叠，最上面那块左右滑，确定放下；叠高了画面往下卷。
// 记忆三色：三个大圆（上 蓝 / 下 黄 / 确定 红），机器亮一串，照着按回去。
// 求签：签筒，确定（或按住）摇一摇，掉出一支签：等级 + 两句吉祥话。
// 抽奖：像拉霸一样跳奖项，越跳越慢停在抽中的那个。
// 叠叠乐、记忆三色结束时：分数 + 名片二维码「想挑战我？扫码加我」。
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
    }
    build_over();
    if (kind == GAME_STACK) stack_start();
    if (kind == GAME_SIMON) simon_start();
    s_shaking = false;
    s_last_ms = now_ms();
    lv_screen_load(s_scr);
    bsp_display_backlight(100);
    sound_start();
    s_timer = lv_timer_create(tick_cb, TICK_MS, NULL);
}

bool games_screen_on_key(space_card_btn_t btn, space_card_ev_t ev) {
    if (ev == SPACE_CARD_EV_LONG && btn == SPACE_CARD_BTN_UP) return true;
    switch (s_kind) {
    case GAME_STACK: stack_key(btn, ev); break;
    case GAME_SIMON: simon_key(btn, ev); break;
    case GAME_FORTUNE: fortune_key(btn, ev); break;
    case GAME_LOTTERY: lottery_key(btn, ev); break;
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
    return false;
}
