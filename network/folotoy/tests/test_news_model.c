// 每日晨报纯逻辑的 host 测试（不需要 ESP-IDF）：
//   cc -std=c11 -Wall -Wextra -Werror -Imain main/news_model.c tests/test_news_model.c -o /tmp/t && /tmp/t
// 有给参数（app 产生的晨报档 android/app/src/test/resources/brief-sample.txt）就顺便解析它、看栏目和条数。
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "news_model.h"

#define UP SPACE_CARD_BTN_UP
#define DN SPACE_CARD_BTN_DOWN
#define OK SPACE_CARD_BTN_OK
#define CL SPACE_CARD_EV_CLICK
#define LG SPACE_CARD_EV_LONG

static const char SAMPLE[] =
    "BRIEF1\n"
    "D\t2026-11-18 星期三\n"
    "S\t今日三件事\n"
    "I\t英伟达董事会\t董事长表示\n"
    "I\t美国收紧出口\t\n"
    "S\t空的栏\n"
    "S\t一 今日必读\n"
    "I\t第一条\t摘要一\n"
    "I\t第二条\t摘要二\n"
    "I\t第三条\n"
    "I\t第四条\t摘要四\n"
    "I\t第五条\t摘要五\n"
    "X\t不认识的行照样跳过\n"
    "S\t二 大马热议\r\n"
    "I\t热议一\t摘要\r\n";

static int eq(const news_doc_t *d, uint32_t at, uint32_t n, const char *want) {
    return strlen(want) == n && memcmp(d->text + at, want, n) == 0;
}

static void test_crc(void) {
    assert(news_crc32(0, "123456789", 9) == 0xCBF43926u);   // CRC-32 标准检查值
    const uint32_t a = news_crc32(0, "12345", 5);
    assert(news_crc32(a, "6789", 4) == 0xCBF43926u);         // 可以分段算
}

static void test_parse(void) {
    static news_doc_t d;
    assert(news_parse(SAMPLE, strlen(SAMPLE), 7, &d));
    assert(d.crc == 7);
    assert(eq(&d, d.date, d.date_len, "2026-11-18 星期三"));
    assert(d.nsec == 3);                                     // 空的栏拿掉了
    assert(eq(&d, d.sec[0].name, d.sec[0].name_len, "今日三件事") && d.sec[0].count == 2);
    assert(eq(&d, d.sec[1].name, d.sec[1].name_len, "一 今日必读") && d.sec[1].first == 2 && d.sec[1].count == 5);
    assert(eq(&d, d.sec[2].name, d.sec[2].name_len, "二 大马热议") && d.sec[2].count == 1);   // \r 去掉
    assert(d.nitem == 8);
    assert(eq(&d, d.item[0].title, d.item[0].title_len, "英伟达董事会"));
    assert(eq(&d, d.item[0].sum, d.item[0].sum_len, "董事长表示"));
    assert(d.item[1].sum_len == 0);
    assert(d.item[4].sum_len == 0 && eq(&d, d.item[4].title, d.item[4].title_len, "第三条"));
    assert(eq(&d, d.item[7].sum, d.item[7].sum_len, "摘要"));

    assert(!news_parse("HELLO\nS\tx\nI\ty\n", 14, 0, &d) && d.nsec == 0);
    assert(!news_parse("BRIEF1\nD\tx\n", 11, 0, &d));   // 没有任何一栏
    assert(!news_parse(NULL, 0, 0, &d));
}

static void test_nav(void) {
    static news_doc_t d;
    assert(news_parse(SAMPLE, strlen(SAMPLE), 0xA1B2C3D4u, &d));
    news_nav_t n;
    news_nav_reset(&n);
    assert(n.level == NEWS_DIR && n.sec == 0);
    assert(news_on_key(&n, &d, UP, CL).action == NEWS_DO_NONE);        // 顶了
    assert(news_on_key(&n, &d, OK, LG).evt_len == 0);                  // 目录上按住不念
    assert(news_on_key(&n, &d, DN, CL).action == NEWS_DO_REDRAW && n.sec == 1);
    assert(news_on_key(&n, &d, DN, CL).action == NEWS_DO_REDRAW && n.sec == 2);
    assert(news_on_key(&n, &d, DN, CL).action == NEWS_DO_NONE && n.sec == 2);   // 到底了
    news_on_key(&n, &d, UP, CL);
    assert(news_on_key(&n, &d, OK, CL).action == NEWS_DO_REDRAW && n.level == NEWS_LIST && n.item == 0);
    // 列表往下：一次看得到 4 条，第 5 条要卷
    for (int i = 0; i < 4; i++) news_on_key(&n, &d, DN, CL);
    assert(n.item == 4 && n.item_top == 1);
    assert(news_on_key(&n, &d, DN, CL).action == NEWS_DO_NONE);
    assert(news_current_item(&n, &d) == 6);
    // 按住确定 → 念第 6 条（整份的序号）+ crc
    news_out_t o = news_on_key(&n, &d, OK, LG);
    assert(o.evt_len == 7 && o.evt[0] == NEWS_EVT_SAY && o.evt[1] == 6 && o.evt[2] == 0);
    assert(o.evt[3] == 0xD4 && o.evt[4] == 0xC3 && o.evt[5] == 0xB2 && o.evt[6] == 0xA1);
    // 打开这条；画面说共 2 页
    assert(news_on_key(&n, &d, OK, CL).action == NEWS_DO_REDRAW && n.level == NEWS_DETAIL && n.page == 0);
    n.pages = 2;
    news_on_key(&n, &d, DN, CL);
    assert(n.page == 1 && n.item == 4);
    news_on_key(&n, &d, DN, CL);                                       // 翻完 → 下一栏第一条
    assert(n.sec == 2 && n.item == 0 && n.page == 0 && n.pages == 1);
    assert(news_on_key(&n, &d, DN, CL).action == NEWS_DO_NONE);        // 全部看完
    news_on_key(&n, &d, UP, CL);                                       // 上 → 回上一栏最后一条
    assert(n.sec == 1 && n.item == 4 && n.page == 0);
    news_on_key(&n, &d, UP, CL);
    assert(n.item == 3);
    o = news_on_key(&n, &d, OK, LG);
    assert(o.evt_len == 7 && o.evt[1] == 5);
    // 确定 → 回列表（游标停在这条）；上 长按 → 目录；再长按 → 回菜单
    assert(news_on_key(&n, &d, OK, CL).action == NEWS_DO_REDRAW && n.level == NEWS_LIST && n.item == 3);
    assert(n.item_top <= 3 && n.item_top + NEWS_LIST_VISIBLE > 3);
    news_on_key(&n, &d, OK, CL);
    assert(news_on_key(&n, &d, UP, LG).action == NEWS_DO_REDRAW && n.level == NEWS_LIST);
    assert(news_on_key(&n, &d, UP, LG).action == NEWS_DO_REDRAW && n.level == NEWS_DIR);
    assert(news_on_key(&n, &d, UP, LG).action == NEWS_DO_EXIT);
    // 第一栏第一条往上：不动
    news_nav_reset(&n);
    news_on_key(&n, &d, OK, CL);
    news_on_key(&n, &d, OK, CL);
    assert(news_on_key(&n, &d, UP, CL).action == NEWS_DO_NONE);
    // 没有晨报：只能回菜单
    static news_doc_t empty;
    memset(&empty, 0, sizeof empty);
    news_nav_reset(&n);
    assert(news_on_key(&n, &empty, OK, CL).action == NEWS_DO_NONE);
    assert(news_on_key(&n, &empty, OK, LG).evt_len == 0);
    assert(news_on_key(&n, &empty, UP, LG).action == NEWS_DO_EXIT);
    assert(news_on_key(&n, NULL, UP, LG).action == NEWS_DO_EXIT);
}

// ---- 假 flash（NOR：擦成 0xFF，写只能 1 → 0）----
static uint8_t s_flash[NEWS_PART_SIZE];
static int s_fail_write;   // > 0：第几次写入失败
static int s_writes;

static bool f_erase(void *ctx, uint32_t off, uint32_t len) {
    (void)ctx;
    assert(off % NEWS_SECTOR == 0 && len % NEWS_SECTOR == 0 && off + len <= NEWS_PART_SIZE);
    memset(s_flash + off, 0xFF, len);
    return true;
}
static bool f_write(void *ctx, uint32_t off, const void *data, uint32_t len) {
    (void)ctx;
    assert(off + len <= NEWS_PART_SIZE);
    if (s_fail_write && ++s_writes == s_fail_write) return false;
    const uint8_t *p = data;
    for (uint32_t i = 0; i < len; i++) s_flash[off + i] &= p[i];
    return true;
}
static bool f_read(void *ctx, uint32_t off, void *data, uint32_t len) {
    (void)ctx;
    assert(off + len <= NEWS_PART_SIZE);
    memcpy(data, s_flash + off, len);
    return true;
}
static const news_flash_t FL = { f_erase, f_write, f_read, NULL };

static void put32(uint8_t *p, uint32_t v) {
    for (int i = 0; i < 4; i++) p[i] = (uint8_t)(v >> (8 * i));
}

// 照 app 的做法送一份：开始 → 每段 chunk 字 → 传完；回最后的状态
static int send_brief(news_rx_t *rx, const char *text, size_t len, size_t chunk, bool *committed) {
    uint8_t pkt[256];
    pkt[0] = NEWS_CMD_DATA;
    pkt[1] = NEWS_DATA_BEGIN;
    put32(pkt + 2, (uint32_t)len);
    put32(pkt + 6, news_crc32(0, text, len));
    int st = news_rx_on_cmd(rx, &FL, pkt, 10, committed);
    if (st >= 0) return st;
    for (size_t off = 0; off < len; off += chunk) {
        const size_t k = len - off < chunk ? len - off : chunk;
        pkt[1] = NEWS_DATA_CHUNK;
        put32(pkt + 2, (uint32_t)off);
        memcpy(pkt + 6, text + off, k);
        st = news_rx_on_cmd(rx, &FL, pkt, 6 + k, committed);
        if (st >= 0) return st;
    }
    pkt[1] = NEWS_DATA_END;
    return news_rx_on_cmd(rx, &FL, pkt, 2, committed);
}

static void test_rx(void) {
    memset(s_flash, 0xFF, sizeof s_flash);   // 新烧的韧体：分区是空的
    news_rx_t rx;
    news_rx_init(&rx, &FL);
    assert(rx.cur == -1);
    static const uint8_t ask[] = { NEWS_CMD_ASK };
    bool committed = false;
    assert(news_rx_on_cmd(&rx, &FL, ask, 1, &committed) == NEWS_ST_NONE);
    uint8_t pkt[6];
    news_status_packet(&rx, NEWS_ST_NONE, pkt);
    assert(pkt[0] == 0x83 && pkt[1] == 1 && pkt[2] == 0 && pkt[5] == 0);

    // 第一份 → A 格
    assert(send_brief(&rx, SAMPLE, strlen(SAMPLE), 37, &committed) == NEWS_ST_OK && committed);
    assert(rx.cur == 0 && rx.cur_seq == 1 && rx.cur_crc == news_crc32(0, SAMPLE, strlen(SAMPLE)));
    uint32_t off, len;
    assert(news_rx_current(&rx, &off, &len) && off == NEWS_HDR_SIZE && len == strlen(SAMPLE));
    assert(memcmp(s_flash + off, SAMPLE, len) == 0);
    assert(news_rx_on_cmd(&rx, &FL, ask, 1, &committed) == NEWS_ST_OK && !committed);
    news_status_packet(&rx, NEWS_ST_OK, pkt);
    assert(pkt[1] == 0 && pkt[2] == (uint8_t)rx.cur_crc);

    // 重开机：读得回来
    news_rx_t again;
    news_rx_init(&again, &FL);
    assert(again.cur == 0 && again.cur_seq == 1 && again.cur_len == strlen(SAMPLE));

    // 第二份（比一个 sector 大）→ B 格；A 格不动
    static char big[9000];
    memcpy(big, "BRIEF1\nS\t栏\n", 14);
    for (size_t i = 14; i < sizeof big - 1; i++) big[i] = (char)('a' + i % 26);
    big[sizeof big - 1] = '\n';
    assert(send_brief(&rx, big, sizeof big, 240, &committed) == NEWS_ST_OK && committed);
    assert(rx.cur == 1 && rx.cur_seq == 2);
    assert(memcmp(s_flash + NEWS_HDR_SIZE, SAMPLE, strlen(SAMPLE)) == 0);
    news_rx_init(&again, &FL);
    assert(again.cur == 1 && again.cur_seq == 2 && again.cur_len == sizeof big);

    // 传到一半断线（没送「传完」）→ 旧的还在；下一次重传照样可以
    uint8_t p[16] = { NEWS_CMD_DATA, NEWS_DATA_BEGIN };
    put32(p + 2, 100);
    put32(p + 6, 1234);
    assert(news_rx_on_cmd(&rx, &FL, p, 10, &committed) == -1);
    p[1] = NEWS_DATA_CHUNK;
    put32(p + 2, 0);
    memcpy(p + 6, "BRIEF1\n", 7);
    assert(news_rx_on_cmd(&rx, &FL, p, 13, &committed) == -1);
    assert(news_rx_progress(&rx) == 7);
    news_rx_init(&again, &FL);
    assert(again.cur == 1 && again.cur_seq == 2);   // A 格被擦了一半，但 B 格还好好的

    // 漏了一段 → 收坏了；之后的段不再回；「传完」回收坏了
    put32(p + 2, 50);
    assert(news_rx_on_cmd(&rx, &FL, p, 13, &committed) == NEWS_ST_BAD);
    assert(news_rx_on_cmd(&rx, &FL, p, 13, &committed) == -1);
    assert(news_rx_progress(&rx) == -1);
    uint8_t end[2] = { NEWS_CMD_DATA, NEWS_DATA_END };
    assert(news_rx_on_cmd(&rx, &FL, end, 2, &committed) == NEWS_ST_BAD && !committed);
    assert(rx.cur == 1);

    // crc 不对
    p[1] = NEWS_DATA_BEGIN;
    put32(p + 2, 7);
    put32(p + 6, 1234);
    news_rx_on_cmd(&rx, &FL, p, 10, &committed);
    p[1] = NEWS_DATA_CHUNK;
    put32(p + 2, 0);
    news_rx_on_cmd(&rx, &FL, p, 13, &committed);
    assert(news_rx_on_cmd(&rx, &FL, end, 2, &committed) == NEWS_ST_BAD && rx.cur == 1);

    // 太大
    p[1] = NEWS_DATA_BEGIN;
    put32(p + 2, NEWS_MAX_LEN + 1);
    assert(news_rx_on_cmd(&rx, &FL, p, 10, &committed) == NEWS_ST_TOO_BIG);
    put32(p + 2, 0);
    assert(news_rx_on_cmd(&rx, &FL, p, 10, &committed) == NEWS_ST_TOO_BIG);

    // 写 flash 失败
    s_writes = 0;
    s_fail_write = 2;
    assert(send_brief(&rx, SAMPLE, strlen(SAMPLE), 40, &committed) == NEWS_ST_FLASH && rx.cur == 1);
    s_fail_write = 0;

    // 再传一份成功 → 回到 A 格，序号 3
    assert(send_brief(&rx, SAMPLE, strlen(SAMPLE), 240, &committed) == NEWS_ST_OK);
    assert(rx.cur == 0 && rx.cur_seq == 3);
    news_rx_init(&again, &FL);
    assert(again.cur == 0 && again.cur_seq == 3);

    // 格子里的资料被改坏（crc 对不上）→ 开机不用它
    s_flash[NEWS_HDR_SIZE + 3] ^= 0x01;
    news_rx_init(&again, &FL);
    assert(again.cur == 1 && again.cur_seq == 2);

    // 不认识的封包
    static const uint8_t junk[] = { 0x06, 0x09 };
    assert(news_rx_on_cmd(&rx, &FL, junk, 2, &committed) == -1);
    assert(news_rx_on_cmd(&rx, &FL, NULL, 0, &committed) == -1);
}

static void check_file(const char *path) {
    FILE *f = fopen(path, "rb");
    assert(f);
    static char buf[NEWS_MAX_LEN];
    const size_t n = fread(buf, 1, sizeof buf, f);
    fclose(f);
    static news_doc_t d;
    assert(news_parse(buf, n, 0, &d));
    printf("%s：%u 字节、%u 栏、%u 条\n", path, (unsigned)n, d.nsec, d.nitem);
    for (int s = 0; s < d.nsec; s++) printf("  %.*s · %u 条\n", (int)d.sec[s].name_len, buf + d.sec[s].name, d.sec[s].count);
}

int main(int argc, char **argv) {
    test_crc();
    test_parse();
    test_nav();
    test_rx();
    if (argc > 1) check_file(argv[1]);
    printf("news_model: all tests passed\n");
    return 0;
}
