// 模拟器用的 DEKU 句库（只给 sim/ 截图用，不会编进韧体）：
// 真的句库要用户审过才有（main/deku_lines.c），截图先用一句示范占位，不放任何名人的话。
#include "deku_model.h"

const deku_line_t DEKU_LINES[] = {
    { "J00", DEKU_JOKE, "审好的笑话、名人的话会在这里", "" },
};
const size_t DEKU_LINE_COUNT = 1;
