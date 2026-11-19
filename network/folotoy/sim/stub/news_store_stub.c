// 模拟器用的假晨报存储（只给 sim/ 用）：晨报从档案读（app 单元测试产生的同一份），版本 / 接收进度由 sim.c 设
#include <stdio.h>
#include <stdlib.h>

#include "news_model.h"
#include "news_store.h"

uint32_t g_news_version;
int g_news_progress = -1;
static char *s_text;
static size_t s_len;

void sim_news_load(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); exit(1); }
    s_text = malloc(NEWS_MAX_LEN);
    s_len = fread(s_text, 1, NEWS_MAX_LEN, f);
    fclose(f);
    g_news_version++;
}

void news_store_start(void) {}
bool news_store_push(const uint8_t *data, size_t len) { (void)data; (void)len; return false; }
uint32_t news_store_version(void) { return g_news_version; }
int news_store_progress(void) { return g_news_progress; }
bool news_store_map(const char **text, size_t *len, uint32_t *crc) {
    if (!s_text) return false;
    *text = s_text;
    *len = s_len;
    *crc = news_crc32(0, s_text, s_len);
    return true;
}
