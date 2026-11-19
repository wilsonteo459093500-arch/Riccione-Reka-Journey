// find_screen.h —— 「手机找 FoloToy」时盖在最上面的画面：红白闪 +「我在这里！」
//
// 画在 LVGL 的 top layer：不管底下是名片、口袋机还是车用画面，都盖得住，停了就拿掉，底下的画面不受影响。
// 都要在持 LVGL 锁时呼叫。
#pragma once

#include <stdbool.h>

void find_screen_show(void);
void find_screen_update(bool red);   // 红底白字 / 白底红字
void find_screen_hide(void);
