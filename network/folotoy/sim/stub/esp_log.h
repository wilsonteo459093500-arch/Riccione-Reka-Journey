#pragma once
// 模拟器用的假标头（只给 sim/ 用，不会编进韧体）
#include <stdio.h>
#define ESP_LOGE(t,f,...) fprintf(stderr,"E %s: " f "\n",t,##__VA_ARGS__)
#define ESP_LOGW(t,f,...) fprintf(stderr,"W %s: " f "\n",t,##__VA_ARGS__)
#define ESP_LOGI(t,f,...) fprintf(stderr,"I %s: " f "\n",t,##__VA_ARGS__)
