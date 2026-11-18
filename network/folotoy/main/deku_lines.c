// deku_lines.c —— tools/make_deku.py 从 deku/lines.json 产生，不要手改。
// 只有用户审过（status = approved）的句子。
#include "deku_model.h"

const deku_line_t DEKU_LINES[] = {
    { "", DEKU_JOKE, "", "" },   // 还没有审过的句子（占位，不算数）
};
const size_t DEKU_LINE_COUNT = 0;
