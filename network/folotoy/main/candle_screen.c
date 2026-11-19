// candle_screen.c —— 数字蜡烛 + 生日歌（LVGL 9）
//
//   ┌──────────────────────┐
//   │   祝你生日快乐        │  ← 唱歌时：现在这一句（华语 32px / 英语 20px）
//   │     🔥    🔥          │  ← 每个数字上面一支火苗（会晃；有人吹气时往旁边倒）
//   │     ██    ██          │
//   │     █ 1   █ 8         │  ← 数字蜡烛（年龄，上下键调）
//   │                       │
//   │  确定 唱歌 · 吹气熄灭  │  ← 说明（熄了就换成「生日快乐！」）
//   └──────────────────────┘
// 吹熄：火苗不见、冒几缕烟、出现「生日快乐！」；确定 重新点燃。
//
// 所有函数都要在持有 bsp_lvgl_lock() 时呼叫（main.c 负责）。
#include "candle_screen.h"

#include <string.h>

#include "audio_dsp.h"
#include "bsp_display.h"
#include "pocket_ui.h"
#include "sound.h"

#define C_WAX_A   0xF6A5C0   // 粉红
#define C_WAX_B   0x9FD3F2   // 浅蓝
#define C_FLAME   0xFF9A2E
#define C_FLAME2  0xFFD45C
#define C_CORE    0xFFF6D8
#define C_WICK    0x3A2E25
#define C_SMOKE   0x8A8580
#define C_GOLD    0xF2C46B

#define MAX_DIGITS 2
#define DIGIT_Y 89           // 数字标签的 y（140px 字型的行高 204、字形上缘在标签往下 59px）
#define GLYPH_TOP (DIGIT_Y + 59)   // 数字蜡烛真正的上缘（≈148），底在 ≈254
#define SMOKE_PUFFS 3
#define FRAME_MS 50

typedef struct {
    lv_obj_t *wax;           // 数字
    lv_obj_t *wick;
    lv_obj_t *glow, *outer, *inner, *core;
    lv_obj_t *smoke[SMOKE_PUFFS];
    int32_t cx;              // 火苗中心 x（相对画面）
} candle_t;

static candle_state_t *s_c;
static lv_obj_t *s_scr;
static lv_obj_t *s_lyric;
static lv_obj_t *s_hint;
static lv_obj_t *s_wish;
static candle_t s_candles[MAX_DIGITS];
static int s_ndigits;
static lv_timer_t *s_timer;
static uint32_t s_rng = 0x2545F491;
static int s_smoke_t = -1;   // 冒烟动画进行到第几格（-1 = 没在冒）
static int s_shown_line = -2;

static int rnd(int span) {   // 0..span-1
    s_rng ^= s_rng << 13;
    s_rng ^= s_rng >> 17;
    s_rng ^= s_rng << 5;
    return (int)(s_rng % (uint32_t)span);
}

static lv_obj_t *blob(lv_obj_t *parent, uint32_t color, lv_opa_t opa) {
    lv_obj_t *o = lv_obj_create(parent);
    lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_border_width(o, 0, 0);
    lv_obj_set_style_pad_all(o, 0, 0);
    lv_obj_set_style_radius(o, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(o, lv_color_hex(color), 0);
    lv_obj_set_style_bg_opa(o, opa, 0);
    return o;
}

// 把物件放在 (cx, bottom)：水平置中、底部对齐（火苗从烛芯往上长）
static void place(lv_obj_t *o, int32_t cx, int32_t bottom, int32_t w, int32_t h) {
    lv_obj_set_size(o, w, h);
    lv_obj_set_pos(o, cx - w / 2, bottom - h);
}

static void set_flames_visible(bool on) {
    for (int i = 0; i < s_ndigits; i++) {
        lv_obj_t *parts[] = { s_candles[i].glow, s_candles[i].outer, s_candles[i].inner, s_candles[i].core };
        for (size_t k = 0; k < 4; k++) {
            if (on) lv_obj_remove_flag(parts[k], LV_OBJ_FLAG_HIDDEN);
            else lv_obj_add_flag(parts[k], LV_OBJ_FLAG_HIDDEN);
        }
    }
}

static void update_texts(void) {
    if (s_c->phase == CANDLE_OUT) {
        lv_obj_remove_flag(s_wish, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_hint, "确定 重新点燃");
    } else {
        lv_obj_add_flag(s_wish, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_hint, s_c->phase == CANDLE_SINGING ? "按任意键 停止" : "确定 唱歌 · 吹气熄灭");
    }
}

// 年龄变了：重排数字蜡烛（1 位数置中、2 位数左右各一）
static void layout_digits(void) {
    char text[4];
    candle_age_text(s_c->age, text, sizeof text);
    s_ndigits = (int)strlen(text);
    for (int i = 0; i < MAX_DIGITS; i++) {
        candle_t *k = &s_candles[i];
        lv_obj_t *all[] = { k->wax, k->wick, k->glow, k->outer, k->inner, k->core };
        for (size_t j = 0; j < 6; j++) {
            if (i < s_ndigits) lv_obj_remove_flag(all[j], LV_OBJ_FLAG_HIDDEN);
            else lv_obj_add_flag(all[j], LV_OBJ_FLAG_HIDDEN);
        }
        for (int j = 0; j < SMOKE_PUFFS; j++) lv_obj_add_flag(k->smoke[j], LV_OBJ_FLAG_HIDDEN);
        if (i >= s_ndigits) continue;
        char one[2] = { text[i], 0 };
        lv_label_set_text(k->wax, one);
        lv_obj_set_style_text_color(k->wax, lv_color_hex(i % 2 ? C_WAX_B : C_WAX_A), 0);
        lv_obj_update_layout(k->wax);
        const int32_t w = lv_obj_get_width(k->wax);
        k->cx = s_ndigits == 1 ? 120 : (i == 0 ? 120 - 46 : 120 + 46);
        lv_obj_set_pos(k->wax, k->cx - w / 2, DIGIT_Y);
        place(k->wick, k->cx, GLYPH_TOP + 4, 3, 16);   // 烛芯插进数字顶端一点
    }
    set_flames_visible(s_c->phase != CANDLE_OUT);
}

static void animate_flames(void) {
    // 有人吹（还没熄）：火苗往右倒、变矮；平常：轻轻晃
    const int lean = s_c->phase == CANDLE_LIT ? sound_mic_level() / 18 : 0;   // 0..14 px
    for (int i = 0; i < s_ndigits; i++) {
        candle_t *k = &s_candles[i];
        const int32_t base = GLYPH_TOP - 8;   // 火苗底部盖住烛芯上端
        const int32_t dx = rnd(3) - 1 + lean;
        const int32_t h = 38 + rnd(7) - lean;
        place(k->glow, k->cx + dx / 2, base + 26, 76, 76);
        lv_obj_set_style_bg_opa(k->glow, (lv_opa_t)(38 + rnd(14)), 0);
        place(k->outer, k->cx + dx, base, 20 + rnd(3), h);
        place(k->inner, k->cx + dx, base, 12, h * 62 / 100);
        place(k->core, k->cx + dx / 2, base, 6, h * 28 / 100);
    }
}

static void animate_smoke(void) {
    if (s_smoke_t < 0) return;
    const int t = s_smoke_t++;
    for (int i = 0; i < s_ndigits; i++) {
        candle_t *k = &s_candles[i];
        for (int j = 0; j < SMOKE_PUFFS; j++) {
            const int tt = t - j * 6;   // 一缕一缕错开冒
            if (tt < 0 || tt > 30) {
                lv_obj_add_flag(k->smoke[j], LV_OBJ_FLAG_HIDDEN);
                continue;
            }
            lv_obj_remove_flag(k->smoke[j], LV_OBJ_FLAG_HIDDEN);
            const int32_t size = 6 + tt / 2;
            place(k->smoke[j], k->cx + (tt * (j - 1)) / 6, GLYPH_TOP - 10 - tt * 3, size, size);
            lv_obj_set_style_bg_opa(k->smoke[j], (lv_opa_t)(150 - tt * 5), 0);
        }
    }
    if (t > 30 + SMOKE_PUFFS * 6) s_smoke_t = -1;
}

static void tick_cb(lv_timer_t *t) {
    (void)t;
    if (!s_c) return;
    // 歌唱完 → 回到点着、开始听吹气
    if (sound_take_song_done()) {
        candle_song_done(s_c);
        update_texts();
    }
    // 听到吹气 → 熄
    if (sound_take_blow() && s_c->phase == CANDLE_LIT) {
        candle_blown(s_c);
        candle_screen_on_do(CANDLE_DO_BLOW_OUT);
        return;
    }
    // 歌词：换句才改字
    const int line = s_c->phase == CANDLE_SINGING ? sound_song_line() : -1;
    if (line != s_shown_line) {
        s_shown_line = line;
        if (line < 0) {
            lv_label_set_text(s_lyric, "");
        } else {
            lv_obj_set_style_text_font(s_lyric, s_c->lang == SONG_ZH ? &space_font_cjk_32 : &space_font_cjk_20, 0);
            lv_label_set_text(s_lyric, melody_lyric(line, s_c->lang == SONG_ZH));
        }
    }
    if (s_c->phase != CANDLE_OUT) animate_flames();
    animate_smoke();
}

void candle_screen_show(candle_state_t *c) {
    s_c = c;
    s_scr = ui_screen();
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x0B0807), 0);   // 比别的画面更暗：火光比较显眼

    s_lyric = ui_label(s_scr, &space_font_cjk_32, C_GOLD, "");
    lv_obj_set_width(s_lyric, 210);
    lv_label_set_long_mode(s_lyric, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(s_lyric, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(s_lyric, LV_ALIGN_TOP_MID, 0, 22);

    memset(s_candles, 0, sizeof s_candles);
    for (int i = 0; i < MAX_DIGITS; i++) {
        candle_t *k = &s_candles[i];
        // 先画光晕和烟（在后面），再画数字、烛芯、火苗
        k->glow = blob(s_scr, C_FLAME, 40);
        for (int j = 0; j < SMOKE_PUFFS; j++) k->smoke[j] = blob(s_scr, C_SMOKE, 120);
        k->wax = ui_label(s_scr, &space_font_digits_140, C_WAX_A, "");
        k->wick = blob(s_scr, C_WICK, LV_OPA_COVER);
        lv_obj_set_style_radius(k->wick, 1, 0);
        k->outer = blob(s_scr, C_FLAME, 230);
        k->inner = blob(s_scr, C_FLAME2, LV_OPA_COVER);
        k->core = blob(s_scr, C_CORE, LV_OPA_COVER);
    }

    s_wish = ui_label(s_scr, &space_font_cjk_32, C_GOLD, "生日快乐！");
    lv_obj_align(s_wish, LV_ALIGN_TOP_MID, 0, 40);
    s_hint = ui_hint(s_scr, 274, "");

    s_shown_line = -2;
    s_smoke_t = -1;
    layout_digits();
    update_texts();
    animate_flames();
    lv_screen_load(s_scr);
    bsp_display_backlight(100);   // 蜡烛就是灯：一直全亮、不自动调暗

    sound_start();
    sound_listen(true);
    s_timer = lv_timer_create(tick_cb, FRAME_MS, NULL);
}

void candle_screen_on_do(candle_do_t d) {
    if (!s_c) return;
    switch (d) {
    case CANDLE_DO_REDRAW:
        if (s_c->phase == CANDLE_LIT) s_smoke_t = -1;
        layout_digits();
        break;
    case CANDLE_DO_SING:
        sound_play_song(s_c->lang == SONG_ZH);
        break;
    case CANDLE_DO_STOP_SONG:
        sound_stop();
        break;
    case CANDLE_DO_BLOW_OUT:
        set_flames_visible(false);
        s_smoke_t = 0;
        break;
    default:
        break;
    }
    update_texts();
}

void candle_screen_hide(void) {
    sound_stop();
    sound_listen(false);
    if (s_timer) lv_timer_delete(s_timer);
    s_timer = NULL;
    s_c = NULL;
}
