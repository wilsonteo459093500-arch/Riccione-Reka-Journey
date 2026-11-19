// news_model.h —— 每日晨报的纯逻辑（不碰 ESP-IDF / LVGL / 蓝牙，有 host 测试）
//
// 2026-11-19 用户选定：
//   - 显示「今日三件事」+ 全部九栏 90 多条（+ 信里的「对你的生意意味着什么」）
//   - 列表只放标题，按「确定」看摘要；按住「确定」→ 手机念这条（标题 + 摘要）
//   - 手机「SPACE 车控」app 用 Gmail 应用程序密码读晨报 → 蓝牙传过来；FoloToy 记住最后一份（离开手机也能看）
//
// 按键：
//   目录（今日三件事、一 今日必读 8 …）  上 / 下 选、确定 打开、上 长按 回菜单
//   标题列表                            上 / 下 选、确定 看摘要、按住确定 念、上 长按 回目录
//   一条（标题 + 摘要）                  下 往下翻（翻完到下一条）、上 往上翻（到顶回上一条）、
//                                      确定 回列表、按住确定 念、上 长按 回列表
//
// 晨报的格式（app 产生，UTF-8，一行一笔，栏位用 TAB 隔开；字只用 FoloToy 字型有的字）：
//   BRIEF1
//   D<TAB>2026-11-18 星期三
//   S<TAB>今日三件事
//   I<TAB>标题<TAB>摘要（可以空）
//   S<TAB>一 今日必读
//   I<TAB>…
//
// 蓝牙封包（SPACE 车控通道）：
//   app → FoloToy：[0x06, 0x01, 长度 u32, crc32 u32] 开始传；[0x06, 0x02, 位置 u32, 资料…] 一段；[0x06, 0x03] 传完
//                  [0x07] 问：你有哪一份？（数字都是 little-endian）
//   FoloToy → app：[0x83, 状态, crc32 u32] 现在有的那份（状态见 news_status_t）
//                  [0x84, 第几条 u16, crc32 u32] 请念这条（第几条 = 整份晨报里的 I 行顺序，从 0 起）
//
// 书摘（2026-11-19 用户选定：微信读书导出的笔记贴进 app → 开机封面下面轮播）同一套传法，封包换成：
//   app → FoloToy：0x08（同 0x06 的开始 / 一段 / 传完）、0x09（问有哪一份）；FoloToy → app：[0x85, 状态, crc32]
//   格式：QUOTES1 / B<TAB>书名<TAB>作者 / Q<TAB>一段书摘（属于上面最近的那本书）
//
// 存法：flash 上一个 512KB 的分区（partitions_space.csv 的 brief）：前 256KB 晨报、后 256KB 书摘，
//   各分 A / B 两格轮流写：新的一份写进另一格，整份 crc 对了才写格头（magic、序号、长度、crc），所以传到一半断线，旧的还在。
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "space_card_model.h"

#define NEWS_CMD_DATA 0x06
#define NEWS_DATA_BEGIN 0x01
#define NEWS_DATA_CHUNK 0x02
#define NEWS_DATA_END 0x03
#define NEWS_CMD_ASK 0x07
#define NEWS_EVT_STATUS 0x83
#define NEWS_EVT_SAY 0x84
#define QUOTES_CMD_DATA 0x08
#define QUOTES_CMD_ASK 0x09
#define QUOTES_EVT_STATUS 0x85

#define NEWS_PART_SIZE (512u * 1024u)
#define NEWS_KIND_SIZE (256u * 1024u)   // 一种（晨报 / 书摘）占多少
#define NEWS_SLOT_SIZE (NEWS_KIND_SIZE / 2)
#define NEWS_HDR_SIZE 16u
#define NEWS_MAX_LEN (NEWS_SLOT_SIZE - NEWS_HDR_SIZE)
#define NEWS_SECTOR 4096u
#define NEWS_MAGIC 0x31465242u   // "BRF1"

#define NEWS_MAX_SECTIONS 16
#define NEWS_MAX_ITEMS 200
#define NEWS_DIR_VISIBLE 6       // 目录一次显示几行
#define NEWS_LIST_VISIBLE 4      // 标题列表一次显示几条（一条最多两行）

typedef enum {
    NEWS_ST_OK = 0,          // 有这份（crc 就是它）
    NEWS_ST_NONE = 1,        // 还没有晨报
    NEWS_ST_BAD = 2,         // 收坏了（漏了一段 / crc 不对）：app 整份重传
    NEWS_ST_TOO_BIG = 3,     // 太大放不下
    NEWS_ST_FLASH = 4,       // 写 flash 失败
} news_status_t;

uint32_t news_crc32(uint32_t crc, const void *data, size_t len);   // 一般 CRC-32（zlib 同一种），第一次传 0

// ---------------- 解析晨报 ----------------
typedef struct {
    uint32_t title, title_len;   // 在 text 里的位置（不是 0 结尾）
    uint32_t sum, sum_len;
} news_item_t;

typedef struct {
    uint32_t name, name_len;
    uint16_t first, count;       // 这一栏的条目：item[first .. first+count)
} news_sec_t;

typedef struct {
    const char *text;            // 整份晨报（flash 上映射的位址）
    size_t len;
    uint32_t crc;
    uint32_t date, date_len;
    news_sec_t sec[NEWS_MAX_SECTIONS];
    uint16_t nsec;
    news_item_t item[NEWS_MAX_ITEMS];
    uint16_t nitem;
} news_doc_t;

// 解析；格式不对（第一行不是 BRIEF1、没有任何一栏）回 false，doc 变成空的
bool news_parse(const char *text, size_t len, uint32_t crc, news_doc_t *doc);

// ---------------- 翻页 ----------------
typedef enum { NEWS_DIR = 0, NEWS_LIST, NEWS_DETAIL } news_level_t;

typedef struct {
    news_level_t level;
    uint16_t sec, sec_top;       // 目录的游标、最上面那一行
    uint16_t item, item_top;     // 这一栏里第几条（从 0 起）、列表最上面那一条
    uint16_t page, pages;        // 一条翻到第几页、共几页（pages 由画面排好版后设）
} news_nav_t;

typedef enum {
    NEWS_DO_NONE = 0,
    NEWS_DO_REDRAW,
    NEWS_DO_EXIT,                // 回菜单
} news_do_t;

typedef struct {
    news_do_t action;
    uint8_t evt[7];              // 要通知 app 的封包（念这条）；evt_len = 0 就不用
    size_t evt_len;
} news_out_t;

void news_nav_reset(news_nav_t *n);
news_out_t news_on_key(news_nav_t *n, const news_doc_t *doc, space_card_btn_t btn, space_card_ev_t ev);
int news_current_item(const news_nav_t *n, const news_doc_t *doc);   // 游标那一条在整份里的序号；没有回 -1

// ---------------- 书摘（开机封面轮播）----------------
// 有几段；第 k 段（从 0 起）的字和书名（都在 text 里，不是 0 结尾）。找不到回 false
size_t quotes_count(const char *text, size_t len);
bool quotes_get(const char *text, size_t len, size_t k, const char **q, size_t *qlen, const char **book, size_t *blen);
// 轮播顺序：一轮里每段刚好一次（用跟 n 互质的步长跳），换一轮换起点；回下一段的序号
typedef struct { uint32_t n, step, start, i, rng; } quotes_order_t;
void quotes_order_init(quotes_order_t *o, size_t n, uint32_t seed);
size_t quotes_order_next(quotes_order_t *o);

// ---------------- 收晨报 / 书摘（蓝牙 → flash）----------------
typedef enum { NEWS_KIND_BRIEF = 0, NEWS_KIND_QUOTES = 1 } news_kind_t;
// flash 操作由外面给（真机：esp_partition；测试：一块记忆体）。位置都是分区里的位置。
typedef struct {
    bool (*erase)(void *ctx, uint32_t off, uint32_t len);   // off、len 都是 NEWS_SECTOR 的倍数
    bool (*write)(void *ctx, uint32_t off, const void *data, uint32_t len);
    bool (*read)(void *ctx, uint32_t off, void *data, uint32_t len);
    void *ctx;
} news_flash_t;

typedef struct {
    uint32_t base;               // 这一种在分区里从哪里开始
    uint8_t cmd_data, cmd_ask, evt_status;
    // 现在的那一份
    int cur;                     // 哪一格（0 / 1）；-1 = 没有
    uint32_t cur_seq, cur_len, cur_crc;
    // 正在收的
    bool active;
    uint32_t len, crc, got, erased;   // erased：这一格已经擦到哪里（从格子开头算）
} news_rx_t;

// 开机：看两格的格头 + 整份 crc，挑序号大的那格
void news_rx_init(news_rx_t *rx, const news_flash_t *fl, news_kind_t kind);

// 一个 app 送来的封包（晨报 0x06 / 0x07、书摘 0x08 / 0x09；不是这一种的回 -1）。回 -1 = 不用回 app；否则回状态（news_status_t），
// 外面要送 [0x83, 状态, rx->cur_crc]（*committed = true：新的一份刚存好，画面要重读）
int news_rx_on_cmd(news_rx_t *rx, const news_flash_t *fl, const uint8_t *data, size_t len, bool *committed);

// 现在那份在分区里从哪里开始、多长（没有回 false）
bool news_rx_current(const news_rx_t *rx, uint32_t *off, uint32_t *len);

// 收到一半（给画面显示「正在接收 45%」）：0–99；没有在收回 -1
int news_rx_progress(const news_rx_t *rx);

// 封包：[0x83（书摘 0x85）, 状态, crc]
void news_status_packet(const news_rx_t *rx, int status, uint8_t out[6]);
