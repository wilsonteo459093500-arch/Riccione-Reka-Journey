# SPACE 名片 · FoloToy AI Passport 小应用

FoloToy AI Passport（ESP32-C3、240×320 屏幕、三个按键）开机直接显示**你的 SPACE 名片二维码**。
活动上把它拿出来：对方手机一扫 → 打开 SPACE 公开名片页 → 留资料 → **自动进 SPACE**（标签「扫码」，互动记成「扫 FoloToy 留资料」）。

上游韧体：[FoloToy/ai-passport](https://github.com/FoloToy/ai-passport)（MIT，ESP-IDF 5.5.3 + LVGL 9.5）。
这个资料夹不是完整韧体，是放进上游 fork 的 `main/`（取代原本的测试菜单）。

## 画面和按键

```
┌──────────────────────┐
│ SPACE          87%   │  左上品牌字、右上电量（读不到就不显示）
│      Wilson Teo      │  名字
│  ┌────────────────┐  │
│  │   二维码 176px  │  │  白底 + 白边，深色背景（跟手机名片页同一套颜色）
│  └────────────────┘  │
│   Scan to connect    │  这个二维码是什么
│        ● ○           │  有「活动」二维码时的页点
└──────────────────────┘
```

| 按键 | 做什么 |
|---|---|
| 上 / 下 短按 | 切换「名片」/「活动」二维码（menuconfig 有设活动网址才有第二个） |
| 确定 短按 | 亮度 100% → 60% → 30% |
| 确定 长按 | 大二维码模式：只剩 224px 的二维码，远一点也扫得到；再长按回来 |
| 闲置 60 秒 | 自动调暗到 15%；调暗时按任何键只会叫醒，不会切换 |

二维码用 LVGL 内建的 `lv_qrcode`（qrcodegen、ECC M、整数倍放大不会糊）。网址会自动加上 `?s=folotoy`（已经有 `s=` 就不加）。

## 怎么装（第一次大约 30 分钟，要一台电脑 + USB 资料线）

1. **Fork 上游**：GitHub 打开 `FoloToy/ai-passport` → Fork → 开一个分支 `space-card`。照上游 `docs/development/engineering/environment-setup.md` 装好 **ESP-IDF 5.5.3**。
2. **放进这些档案**（覆盖同名的）：
   ```
   network/folotoy/main/main.c               → <fork>/main/main.c
   network/folotoy/main/CMakeLists.txt       → <fork>/main/CMakeLists.txt
   network/folotoy/main/Kconfig.projbuild    → <fork>/main/Kconfig.projbuild
   network/folotoy/main/space_card.c / .h    → <fork>/main/
   network/folotoy/main/space_card_model.c / .h → <fork>/main/
   network/folotoy/tests/test_space_card_model.c → <fork>/tests/
   ```
   上游的 `main/key_guard.h` **留着**（按键唤醒的保护，新的 `main.c` 有用到）。`demo_*.c`、`ui_pixel*` 可以留在资料夹里（不会被编进韧体，上游的 host 测试还会用到）。
3. **设定**：把 `network/folotoy/sdkconfig.space.defaults` 的内容接在 `<fork>/sdkconfig.defaults` 最后面（打开 `lv_qrcode`、关掉用不到的蓝牙）。
   在 `<fork>/tools/validate.sh` 的 host 测试那段加一行（照旁边的写法）：
   ```bash
   cc ... -Imain tests/test_space_card_model.c main/space_card_model.c -o "${test_dir}/test_space_card_model"
   "${test_dir}/test_space_card_model"
   ```
4. **填你的网址**：
   ```bash
   idf.py set-target esp32c3
   idf.py menuconfig        # → SPACE card
   ```
   - `Card link`：SPACE →「我的名片」→ FoloToy 分页 → 复制（例：`https://space-riccione-reka.vercel.app/c`）
   - `Name at the top`：英文名（预设字型 Montserrat 没有中文，中文会变成 `?`）
   - 选填 `Event link`：「活动模式」某个活动的二维码连结（上下键切换）
5. **编译、烧录**：
   ```bash
   ./tools/validate.sh --static     # host 测试（含 test_space_card_model）
   idf.py build
   idf.py -p /dev/ttyACM0 flash monitor   # Mac：/dev/cu.usbmodem*；Windows：COM3 之类
   ```
   开机 log 会印出 `二维码 1：https://…/c?s=folotoy`。
6. **验收**：用 iPhone 相机、Android 相机、WhatsApp 内建扫码各扫一次 → 打开的是你的名片页 → 留一笔假资料 → SPACE「人脉」顶部出现「新朋友 1」，标签「扫码」、互动「扫 FoloToy 留资料」。

换网址 / 换活动：改 menuconfig 再烧一次（第一版没做 Wi-Fi 同步，见下面「以后可以加」）。

## 结构

| 档案 | 内容 |
|---|---|
| `main/space_card_model.c/.h` | 纯逻辑：网址加 `s=folotoy`、按键 → 状态、闲置调暗、亮度、二维码大小 / 版本估算、电量文字（**有 host 测试**） |
| `main/space_card.c/.h` | LVGL 画面：深色底、品牌字、电量、名字、白底二维码、说明、页点；大二维码模式 |
| `main/main.c` | 开机：BSP 初始化 → 画面 → 按键（回呼只丢 queue，input task 拿 LVGL 锁再改画面；沿用上游的按键唤醒保护） |
| `main/Kconfig.projbuild` | menuconfig 的「SPACE card」：网址、名字、说明字、活动网址 |
| `tests/test_space_card_model.c` | host 测试：`cc -std=c11 -Wall -Wextra -Werror -Imain main/space_card_model.c tests/test_space_card_model.c -o /tmp/t && /tmp/t` |

照上游规则：衍生 app 用自己的画面（没有沿用测试菜单 / `ui_pixel` 外壳），只重用 BSP 和 `key_guard.h`；LVGL 只在持锁时碰；按键回呼不阻塞；电量放右上角、读不到就不显示；只用 ASCII 字（没有中文字型问题）。

## 验证状态（诚实版）

```text
Build:        NOT RUN   —— 开发环境没有 ESP-IDF；只做了「语法 / 型别检查」：用真的 LVGL 9.5.0 标头 + 上游 BSP 标头编译 space_card.c、main.c（ESP-IDF 的部分用空壳）
Host tests:   PASS      —— test_space_card_model（gcc，-Wall -Wextra -Werror）；上游 key-wake 合约（on_key 先 key_guard_consume 再看 !s_input_ready）也对过
Device tests: NOT RUN   —— 没有机器
Unverified:   真机画面（颜色、圆角、字的位置）、二维码在这块屏幕上实际扫不扫得到（尤其活动网址 3px/格时）、背光百分比的实际亮度、电量读数
```

## 以后可以加

- **Wi-Fi 同步**：开机连 Wi-Fi 读 `/api/card` 拿最新的活动网址，不用重烧（要做 Wi-Fi 设定页，上游有 BluFi 配网可以参考）
- **FoloToy 背面的 NFC**：还不确定能不能写；先用 NTAG215 贴纸贴在背面（SPACE「我的名片」→ NFC 贴纸分页可以写）
- 中文名字：要加中文字型子集（上游 `docs/development/engineering/lvgl-chinese-fonts.md`）
