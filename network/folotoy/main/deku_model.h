// deku_model.h —— DEKU 小助理的纯逻辑（不碰 ESP-IDF / LVGL / 蓝牙，有 host 测试）
//
// 口袋机菜单「DEKU 讲笑话」（2026-11-18 用户选定）：
//   确定 按住     对 DEKU 说话（手机「SPACE 车控」app 用手机麦克风听，关键词：笑话 / 稻盛 / 郭鹤年 / 马斯克 / 再来一个）
//                 放开 → DEKU 想一下 → app 挑一句、手机念出来，FoloToy 显示同一句
//   上 短按       直接来一个笑话（没装 app 也可以，只是没有声音）
//   下 短按       直接来一句名人的话（稻盛和夫 → 郭鹤年 → Musk 轮流，没审过的人跳过）
//   上 长按       回菜单
//
// 句库：deku/lines.json → tools/make_deku.py → main/deku_lines.c（只有用户审过打勾的句子）。
// 句子用 id（"J01"）在 FoloToy 和 app 之间对，不用序号：两边版本不同也不会念错句。
//
// 封包（SPACE 车控通道）：
//   通知（FoloToy → app）：[0x81, 1] 开始听、[0x81, 0] 放开了（说完）、[0x82, id…] 请念这句（按键挑的）
//   指令（app → FoloToy）：[0x04, id…] 显示这句（app 听懂挑的）、[0x05] 没听懂
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "space_card_model.h"

typedef enum { DEKU_JOKE = 0, DEKU_INAMORI, DEKU_KUOK, DEKU_MUSK, DEKU_KINDS } deku_kind_t;

typedef struct {
    const char *id;       // "J01"
    deku_kind_t kind;
    const char *text;     // 屏幕上显示的中文
    const char *source;   // 「——稻盛和夫《活法》」；笑话是 ""
} deku_line_t;

// main/deku_lines.c（tools/make_deku.py 产生）
extern const deku_line_t DEKU_LINES[];
extern const size_t DEKU_LINE_COUNT;

#define DEKU_EVT_LISTEN 0x81
#define DEKU_EVT_SAY 0x82
#define DEKU_CMD_SHOW 0x04
#define DEKU_CMD_UNKNOWN 0x05
#define DEKU_ID_MAX 8
#define DEKU_THINK_TIMEOUT_MS 8000u   // 放开后 8 秒 app 没回 → 「没听清楚」
#define DEKU_LISTEN_MAX_MS 15000u     // 按住最多听 15 秒

typedef enum {
    DEKU_FACE_IDLE = 0,   // 等你
    DEKU_FACE_LISTEN,     // 在听（按住确定）
    DEKU_FACE_THINK,      // 想一下（等 app）
    DEKU_FACE_SAY,        // 说（显示一句）
    DEKU_FACE_CONFUSED,   // 没听懂 / 没听清楚
} deku_face_t;

typedef struct {
    deku_face_t face;
    int line;                    // 现在显示的句子（DEKU_LINES 的索引）；-1 = 没有
    uint32_t since_ms;           // 进入这个表情的时间
    uint8_t next_person;         // 下 短按轮到谁（DEKU_INAMORI..DEKU_MUSK）
    uint32_t used[DEKU_KINDS][8];   // 每类抽过的（bitset，最多 256 句）；一轮抽完才重来
    uint32_t rng;
} deku_state_t;

// 按键的结果：画面要做什么、要不要通知 app
typedef enum {
    DEKU_DO_NONE = 0,
    DEKU_DO_REDRAW,     // 表情 / 句子变了
    DEKU_DO_EXIT,       // 回菜单
} deku_do_t;

typedef struct {
    deku_do_t action;
    uint8_t evt[2 + DEKU_ID_MAX];   // 要通知 app 的封包；evt_len = 0 就不用
    size_t evt_len;
} deku_out_t;

void deku_init(deku_state_t *s, uint32_t seed);

// 这一类审过的有几句
size_t deku_count(deku_kind_t k);

// 从某一类挑一句（一轮里不重复）；没有回 -1
int deku_pick(deku_state_t *s, deku_kind_t k);

// 用 id 找句子；找不到回 -1
int deku_find(const char *id, size_t len);

// 按键（app_present：手机 app 连着）
deku_out_t deku_on_key(deku_state_t *s, space_card_btn_t btn, space_card_ev_t ev, bool app_present, uint32_t now_ms);

// app 的指令；回 true = 要重画
bool deku_on_cmd(deku_state_t *s, const uint8_t *data, size_t len, uint32_t now_ms);

// 定时呼叫：等太久 → 没听清楚 / 按太久 → 自动当放开；回 true = 要重画（*out 可能有要送的通知）
bool deku_on_tick(deku_state_t *s, uint32_t now_ms, deku_out_t *out);

// 类别的中文名（「稻盛和夫」）
const char *deku_kind_name(deku_kind_t k);

// 中文断行：照字宽把 in 切成几行（用 '\n' 接起来写进 out），遵守中文排版的规矩：
//   「，。、！？；：」』）》…」不放在行首（连前一个字一起移到下一行）；「「『（《」不放在行尾；
//   英文、数字一个词不切开，行首的空白去掉。
// width(cp) 回一个字的宽度（像素）。回写进 out 的行数；out 不够大就截掉（一定以 0 结尾）。
typedef int (*deku_width_fn)(uint32_t cp, void *ctx);
int deku_wrap(const char *in, char *out, size_t cap, int max_w, deku_width_fn width, void *ctx);
