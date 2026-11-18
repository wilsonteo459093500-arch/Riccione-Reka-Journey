// 模拟器用的假蓝牙（只给 sim/ 用，不会编进韧体）：连线状态由 sim.c 设定
#include "ble_remote.h"

car_link_t g_link = CAR_LINK_ADVERTISING;

bool ble_remote_start(const char *device_name) { (void)device_name; return true; }
car_link_t ble_remote_link(void) { return g_link; }
bool ble_remote_send(uint16_t usage) { return g_link == CAR_LINK_READY && usage != 0; }
void ble_remote_set_battery(int percent) { (void)percent; }
