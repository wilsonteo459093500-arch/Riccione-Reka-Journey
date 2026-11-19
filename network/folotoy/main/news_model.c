// news_model.c —— 见 news_model.h
#include "news_model.h"

#include <string.h>

uint32_t news_crc32(uint32_t crc, const void *data, size_t len) {
    const uint8_t *p = (const uint8_t *)data;
    crc = ~crc;
    while (len--) {
        crc ^= *p++;
        for (int k = 0; k < 8; k++) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
    return ~crc;
}

static uint32_t rd32(const uint8_t *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static void wr32(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
    p[2] = (uint8_t)(v >> 16);
    p[3] = (uint8_t)(v >> 24);
}

// ---------------- 解析 ----------------
// 一行里第 k 个栏位（TAB 隔开）；没有回 false
static bool field(const char *line, size_t n, int k, uint32_t base, uint32_t *at, uint32_t *flen) {
    size_t a = 0;
    for (int i = 0; i < k; i++) {
        while (a < n && line[a] != '\t') a++;
        if (a >= n) return false;
        a++;
    }
    size_t b = a;
    while (b < n && line[b] != '\t') b++;
    *at = base + (uint32_t)a;
    *flen = (uint32_t)(b - a);
    return true;
}

bool news_parse(const char *text, size_t len, uint32_t crc, news_doc_t *doc) {
    memset(doc, 0, sizeof *doc);
    if (!text || len < 7 || memcmp(text, "BRIEF1", 6) != 0 || (text[6] != '\n' && text[6] != '\r')) return false;
    size_t i = 0;
    while (i < len) {
        size_t e = i;
        while (e < len && text[e] != '\n') e++;
        size_t n = e - i;
        if (n && text[i + n - 1] == '\r') n--;
        const char *line = text + i;
        uint32_t at, fl;
        if (n >= 2 && line[1] == '\t') {
            if (line[0] == 'D' && field(line, n, 1, (uint32_t)i, &at, &fl)) {
                doc->date = at;
                doc->date_len = fl;
            } else if (line[0] == 'S' && doc->nsec < NEWS_MAX_SECTIONS && field(line, n, 1, (uint32_t)i, &at, &fl)) {
                news_sec_t *s = &doc->sec[doc->nsec++];
                s->name = at;
                s->name_len = fl;
                s->first = doc->nitem;
                s->count = 0;
            } else if (line[0] == 'I' && doc->nsec > 0 && doc->nitem < NEWS_MAX_ITEMS &&
                       field(line, n, 1, (uint32_t)i, &at, &fl) && fl > 0) {
                news_item_t *it = &doc->item[doc->nitem++];
                it->title = at;
                it->title_len = fl;
                if (field(line, n, 2, (uint32_t)i, &at, &fl)) {
                    it->sum = at;
                    it->sum_len = fl;
                }
                doc->sec[doc->nsec - 1].count++;
            }
        }
        i = e + 1;
    }
    // 空的栏拿掉（目录上不显示）
    uint16_t k = 0;
    for (uint16_t s = 0; s < doc->nsec; s++) if (doc->sec[s].count) doc->sec[k++] = doc->sec[s];
    doc->nsec = k;
    if (doc->nsec == 0) {
        memset(doc, 0, sizeof *doc);
        return false;
    }
    doc->text = text;
    doc->len = len;
    doc->crc = crc;
    return true;
}

// ---------------- 翻页 ----------------
void news_nav_reset(news_nav_t *n) {
    memset(n, 0, sizeof *n);
    n->pages = 1;
}

// 游标移动后，让它留在看得到的范围里
static uint16_t keep_visible(uint16_t cursor, uint16_t top, uint16_t visible) {
    if (cursor < top) return cursor;
    if (cursor >= top + visible) return (uint16_t)(cursor - visible + 1);
    return top;
}

int news_current_item(const news_nav_t *n, const news_doc_t *doc) {
    if (!doc || doc->nsec == 0 || n->sec >= doc->nsec) return -1;
    const news_sec_t *s = &doc->sec[n->sec];
    if (n->item >= s->count) return -1;
    return s->first + n->item;
}

static void open_item(news_nav_t *n, uint16_t sec, uint16_t item) {
    n->sec = sec;
    n->item = item;
    n->page = 0;
    n->pages = 1;
}

news_out_t news_on_key(news_nav_t *n, const news_doc_t *doc, space_card_btn_t btn, space_card_ev_t ev) {
    news_out_t o = { 0 };
    const bool click = ev == SPACE_CARD_EV_CLICK, lng = ev == SPACE_CARD_EV_LONG;
    const bool has = doc && doc->nsec > 0;
    if (btn == SPACE_CARD_BTN_UP && lng) {
        if (n->level == NEWS_DIR || !has) {
            o.action = NEWS_DO_EXIT;
        } else if (n->level == NEWS_LIST) {
            n->level = NEWS_DIR;
            o.action = NEWS_DO_REDRAW;
        } else {
            n->level = NEWS_LIST;
            n->item_top = keep_visible(n->item, n->item_top, NEWS_LIST_VISIBLE);
            o.action = NEWS_DO_REDRAW;
        }
        return o;
    }
    if (!has || (!click && !lng)) return o;
    const news_sec_t *s = &doc->sec[n->sec < doc->nsec ? n->sec : 0];

    if (btn == SPACE_CARD_BTN_OK && lng) {   // 按住确定：念这条（目录上没有「这条」）
        const int idx = n->level == NEWS_DIR ? -1 : news_current_item(n, doc);
        if (idx >= 0) {
            o.evt[0] = NEWS_EVT_SAY;
            o.evt[1] = (uint8_t)idx;
            o.evt[2] = (uint8_t)(idx >> 8);
            wr32(o.evt + 3, doc->crc);
            o.evt_len = 7;
        }
        return o;
    }
    if (!click) return o;

    switch (n->level) {
    case NEWS_DIR:
        if (btn == SPACE_CARD_BTN_UP && n->sec > 0) n->sec--;
        else if (btn == SPACE_CARD_BTN_DOWN && n->sec + 1 < doc->nsec) n->sec++;
        else if (btn == SPACE_CARD_BTN_OK) {
            n->level = NEWS_LIST;
            n->item = 0;
            n->item_top = 0;
        } else return o;
        n->sec_top = keep_visible(n->sec, n->sec_top, NEWS_DIR_VISIBLE);
        o.action = NEWS_DO_REDRAW;
        break;
    case NEWS_LIST:
        if (btn == SPACE_CARD_BTN_UP && n->item > 0) n->item--;
        else if (btn == SPACE_CARD_BTN_DOWN && n->item + 1 < s->count) n->item++;
        else if (btn == SPACE_CARD_BTN_OK) {
            n->level = NEWS_DETAIL;
            open_item(n, n->sec, n->item);
        } else return o;
        n->item_top = keep_visible(n->item, n->item_top, NEWS_LIST_VISIBLE);
        o.action = NEWS_DO_REDRAW;
        break;
    case NEWS_DETAIL:
        if (btn == SPACE_CARD_BTN_OK) {
            n->level = NEWS_LIST;
            n->item_top = keep_visible(n->item, n->item_top, NEWS_LIST_VISIBLE);
        } else if (btn == SPACE_CARD_BTN_DOWN) {
            if (n->page + 1 < n->pages) n->page++;
            else if (n->item + 1 < s->count) open_item(n, n->sec, (uint16_t)(n->item + 1));
            else if (n->sec + 1 < doc->nsec) open_item(n, (uint16_t)(n->sec + 1), 0);   // 这栏看完：下一栏第一条
            else return o;
        } else {
            if (n->page > 0) n->page--;
            else if (n->item > 0) open_item(n, n->sec, (uint16_t)(n->item - 1));
            else if (n->sec > 0) open_item(n, (uint16_t)(n->sec - 1), (uint16_t)(doc->sec[n->sec - 1].count - 1));
            else return o;
        }
        n->sec_top = keep_visible(n->sec, n->sec_top, NEWS_DIR_VISIBLE);
        o.action = NEWS_DO_REDRAW;
        break;
    }
    return o;
}

// ---------------- 收晨报 ----------------
static uint32_t slot_base(int slot) {
    return slot ? NEWS_SLOT_SIZE : 0;
}

// 读一格的格头 + 整份算 crc；对了回 true
static bool slot_valid(const news_flash_t *fl, int slot, uint32_t *seq, uint32_t *len, uint32_t *crc) {
    uint8_t h[NEWS_HDR_SIZE];
    if (!fl->read(fl->ctx, slot_base(slot), h, sizeof h)) return false;
    if (rd32(h) != NEWS_MAGIC) return false;
    const uint32_t n = rd32(h + 8), want = rd32(h + 12);
    if (n == 0 || n > NEWS_MAX_LEN) return false;
    uint8_t buf[256];
    uint32_t c = 0;
    for (uint32_t off = 0; off < n; off += sizeof buf) {
        const uint32_t k = n - off < sizeof buf ? n - off : (uint32_t)sizeof buf;
        if (!fl->read(fl->ctx, slot_base(slot) + NEWS_HDR_SIZE + off, buf, k)) return false;
        c = news_crc32(c, buf, k);
    }
    if (c != want) return false;
    *seq = rd32(h + 4);
    *len = n;
    *crc = want;
    return true;
}

void news_rx_init(news_rx_t *rx, const news_flash_t *fl) {
    memset(rx, 0, sizeof *rx);
    rx->cur = -1;
    for (int slot = 0; slot < 2; slot++) {
        uint32_t seq, len, crc;
        if (!slot_valid(fl, slot, &seq, &len, &crc)) continue;
        if (rx->cur < 0 || (int32_t)(seq - rx->cur_seq) > 0) {
            rx->cur = slot;
            rx->cur_seq = seq;
            rx->cur_len = len;
            rx->cur_crc = crc;
        }
    }
}

static int target_slot(const news_rx_t *rx) {
    return rx->cur == 0 ? 1 : 0;
}

static int rx_fail(news_rx_t *rx, int st) {
    rx->active = false;
    return st;
}

int news_rx_on_cmd(news_rx_t *rx, const news_flash_t *fl, const uint8_t *data, size_t len, bool *committed) {
    if (committed) *committed = false;
    if (!data || len == 0) return -1;
    if (data[0] == NEWS_CMD_ASK && len == 1) return rx->cur >= 0 ? NEWS_ST_OK : NEWS_ST_NONE;
    if (data[0] != NEWS_CMD_DATA || len < 2) return -1;
    const uint32_t base = slot_base(target_slot(rx));
    switch (data[1]) {
    case NEWS_DATA_BEGIN:
        if (len != 10) return -1;
        rx->len = rd32(data + 2);
        rx->crc = rd32(data + 6);
        rx->got = 0;
        rx->erased = 0;
        rx->active = false;
        if (rx->len == 0 || rx->len > NEWS_MAX_LEN) return NEWS_ST_TOO_BIG;
        rx->active = true;
        return -1;
    case NEWS_DATA_CHUNK: {
        if (len < 7 || !rx->active) return -1;   // 已经失败过的那次：剩下的几段不用每段都回
        const uint32_t off = rd32(data + 2), n = (uint32_t)(len - 6);
        if (off != rx->got || off + n > rx->len) return rx_fail(rx, NEWS_ST_BAD);   // 漏了 / 多了：整份重来
        const uint32_t need = NEWS_HDR_SIZE + off + n;   // 从格子开头算，要擦到这里
        while (rx->erased < need) {
            if (!fl->erase(fl->ctx, base + rx->erased, NEWS_SECTOR)) return rx_fail(rx, NEWS_ST_FLASH);
            rx->erased += NEWS_SECTOR;
        }
        if (!fl->write(fl->ctx, base + NEWS_HDR_SIZE + off, data + 6, n)) return rx_fail(rx, NEWS_ST_FLASH);
        rx->got += n;
        return -1;
    }
    case NEWS_DATA_END: {
        if (len != 2 || !rx->active) return NEWS_ST_BAD;
        rx->active = false;
        if (rx->got != rx->len) return NEWS_ST_BAD;
        // 从 flash 读回来算 crc（确定写进去的就是传来的）
        uint8_t buf[256];
        uint32_t c = 0;
        for (uint32_t off = 0; off < rx->len; off += sizeof buf) {
            const uint32_t k = rx->len - off < sizeof buf ? rx->len - off : (uint32_t)sizeof buf;
            if (!fl->read(fl->ctx, base + NEWS_HDR_SIZE + off, buf, k)) return NEWS_ST_FLASH;
            c = news_crc32(c, buf, k);
        }
        if (c != rx->crc) return NEWS_ST_BAD;
        uint8_t h[NEWS_HDR_SIZE];
        const uint32_t seq = rx->cur >= 0 ? rx->cur_seq + 1 : 1;
        wr32(h, NEWS_MAGIC);
        wr32(h + 4, seq);
        wr32(h + 8, rx->len);
        wr32(h + 12, rx->crc);
        if (!fl->write(fl->ctx, base, h, sizeof h)) return NEWS_ST_FLASH;
        rx->cur = target_slot(rx);
        rx->cur_seq = seq;
        rx->cur_len = rx->len;
        rx->cur_crc = rx->crc;
        if (committed) *committed = true;
        return NEWS_ST_OK;
    }
    default:
        return -1;
    }
}

bool news_rx_current(const news_rx_t *rx, uint32_t *off, uint32_t *len) {
    if (rx->cur < 0) return false;
    *off = slot_base(rx->cur) + NEWS_HDR_SIZE;
    *len = rx->cur_len;
    return true;
}

int news_rx_progress(const news_rx_t *rx) {
    if (!rx->active || rx->len == 0) return -1;
    const uint32_t p = (uint32_t)((uint64_t)rx->got * 100u / rx->len);
    return p > 99 ? 99 : (int)p;
}

void news_status_packet(const news_rx_t *rx, int status, uint8_t out[6]) {
    out[0] = NEWS_EVT_STATUS;
    out[1] = (uint8_t)status;
    wr32(out + 2, rx->cur >= 0 ? rx->cur_crc : 0);
}
