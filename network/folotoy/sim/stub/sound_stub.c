// 模拟器用的假喇叭 / 麦克风（只给 sim/ 用，不会编进韧体）：sim.c 直接设下面这几个值
#include "sound.h"

int g_song_line = -1;
bool g_song_done;
bool g_blow;
uint8_t g_mic_level;

bool sound_start(void) { return true; }
void sound_play_song(bool zh) { (void)zh; g_song_line = 0; }
void sound_stop(void) { g_song_line = -1; }
void sound_alarm(bool on) { (void)on; }
void sound_listen(bool on) { (void)on; }
int sound_song_line(void) { return g_song_line; }
bool sound_take_song_done(void) { bool v = g_song_done; g_song_done = false; return v; }
bool sound_take_blow(void) { bool v = g_blow; g_blow = false; return v; }
uint8_t sound_mic_level(void) { return g_mic_level; }
void sound_knock(void) {}
void sound_tick(void) {}
void sound_win(void) {}
void sound_lose(void) {}
void sound_note(uint8_t midi) { (void)midi; }
