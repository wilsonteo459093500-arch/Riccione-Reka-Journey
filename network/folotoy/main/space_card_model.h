// space_card_model.h —— SPACE 名片 app 的纯逻辑（不碰 ESP-IDF / LVGL，有 host 测试）
//
// 屏幕上显示一个二维码：别人用手机扫 → 打开 SPACE 的公开名片页 → 留资料 → 自动进 SPACE。
//   上 / 下 短按：切换「名片」/「活动」两个二维码（活动网址有设才有）
//   确定 短按：亮度 100% → 60% → 30%
//   确定 长按：大二维码模式（只剩二维码，远一点也扫得到）
//   闲置 60 秒自动调暗，按任何键恢复
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define SPACE_CARD_MAX_LINKS 2
#define SPACE_CARD_URL_MAX 200
#define SPACE_CARD_LABEL_MAX 32

typedef struct {
    char url[SPACE_CARD_URL_MAX + 1];      // 已经加上 s=folotoy
    char label[SPACE_CARD_LABEL_MAX + 1];  // 屏幕上显示的小字：Card / 活动名（ASCII）
} space_card_link_t;

typedef enum {
    SPACE_CARD_BTN_UP = 0,
    SPACE_CARD_BTN_DOWN,
    SPACE_CARD_BTN_OK,
} space_card_btn_t;

typedef enum {
    SPACE_CARD_EV_CLICK = 0,
    SPACE_CARD_EV_LONG,
    SPACE_CARD_EV_OTHER,
    SPACE_CARD_EV_PRESS,      // 按下瞬间 / 放开瞬间：只有车用模式转给手机 app 用（按住录语音讯息）
    SPACE_CARD_EV_RELEASE,
} space_card_ev_t;

typedef enum {
    SPACE_CARD_REDRAW_NONE = 0,
    SPACE_CARD_REDRAW_QR = 1 << 0,         // 换了网址 / 换了大小 → 重画二维码
    SPACE_CARD_REDRAW_LAYOUT = 1 << 1,     // 大二维码模式切换 → 重新排版
    SPACE_CARD_REDRAW_BACKLIGHT = 1 << 2,  // 只改亮度
} space_card_redraw_t;

typedef struct {
    space_card_link_t links[SPACE_CARD_MAX_LINKS];
    size_t count;
    size_t current;
    uint8_t brightness_idx;   // 0..2 → 100 / 60 / 30
    bool big;                 // 大二维码模式
    bool dimmed;              // 闲置调暗中
} space_card_state_t;

// 网址加上 s=folotoy（已经有 s= 就不加）。只收 https://。成功回 true。
bool space_card_tag_url(const char *in, char *out, size_t out_len);

// 用 Kconfig 的两组设定建状态；第一个网址不合格 → count = 0（屏幕会显示设定说明）
void space_card_init(space_card_state_t *s,
                     const char *card_url, const char *card_label,
                     const char *event_url, const char *event_label);

// 按键 → 状态变化，回要重画什么（space_card_redraw_t 的位元组合）
int space_card_on_key(space_card_state_t *s, space_card_btn_t btn, space_card_ev_t ev);

// 闲置多久（毫秒）→ 要不要调暗；回 true 代表状态变了（要改背光）
bool space_card_on_idle(space_card_state_t *s, uint32_t idle_ms);

// 现在的背光百分比（调暗时固定 15%）
uint8_t space_card_backlight(const space_card_state_t *s);

// 二维码边长 px（一般模式 / 大二维码模式），配 240×320 屏幕
int32_t space_card_qr_px(const space_card_state_t *s);

// QR 版本（ECC M、byte 模式，跟 LVGL 的 qrcodegen 一样）放得下 len 个字元的最小版本；放不下回 0
int space_card_qr_version(size_t len);

// 这个网址画在 px 大小里，每个模块几 px（含 4 格白边）；< 3 扫起来会吃力
int space_card_module_px(size_t url_len, int32_t px);

// 电量文字："87%"；读不到（< 0）回空字串
void space_card_battery_text(int soc, char *out, size_t out_len);
