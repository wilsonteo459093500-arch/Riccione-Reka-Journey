// 模拟器用的假蓝牙（只给 sim/ 用，不会编进韧体）：连线状态由 sim.c 设定
#include "ble_remote.h"

car_link_t g_link = CAR_LINK_ADVERTISING;

bool ble_remote_start(const char *device_name) { (void)device_name; return true; }
car_link_t ble_remote_link(void) { return g_link; }
bool ble_remote_send(uint16_t usage) { return g_link == CAR_LINK_READY && usage != 0; }
void ble_remote_set_battery(int percent) { (void)percent; }

bool g_app_present;
static const uint8_t *s_cmds[4];
static size_t s_cmd_lens[4];
static int s_ncmd;
void sim_push_cmd(const uint8_t *d, size_t n) { if (s_ncmd < 4) { s_cmds[s_ncmd] = d; s_cmd_lens[s_ncmd++] = n; } }
bool ble_remote_app_present(void) { return g_app_present; }
bool ble_remote_notify_key(const uint8_t evt[2]) { (void)evt; return g_app_present; }
bool ble_remote_take_cmd(uint8_t *buf, size_t *len, size_t cap) {
    if (!s_ncmd) return false;
    size_t n = s_cmd_lens[0] < cap ? s_cmd_lens[0] : cap;
    for (size_t i = 0; i < n; i++) buf[i] = s_cmds[0][i];
    *len = n;
    for (int i = 1; i < s_ncmd; i++) { s_cmds[i - 1] = s_cmds[i]; s_cmd_lens[i - 1] = s_cmd_lens[i]; }
    s_ncmd--;
    return true;
}
