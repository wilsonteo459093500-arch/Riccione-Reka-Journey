#!/usr/bin/env bash
# 在电脑上模拟 FoloToy 屏幕：画出名片 / 活动 / 大二维码三个画面，用程序扫二维码确认网址对；
# 再画车用遥控器的四个状态（等配对、已连线、刚按播放、没连上就按），和口袋机（菜单、蜡烛、计时器）。
# 要 cc、git、python3。LVGL 用 ../build.sh 同一个快取（没有就自己 clone）。
#
#   ./sim/run.sh                       # 输出到 /tmp/folotoy-build/sim-out
#   ./sim/run.sh --update-screenshot   # 顺便把对照图存成 firmware/screens.png、firmware/car-screens.png
#
# 设定跟 Kconfig.projbuild 的预设值一致；改了预设值这里也要改。
set -euo pipefail

CARD_URL="https://space-riccione-reka.vercel.app/c"
CARD_LABEL="Scan to connect"
CARD_NAME="Wilson Teo"
EVENT_LABEL="Event check-in"
REMOTE_NAME="SPACE Remote"
EVENT_URL="https://space-riccione-reka.vercel.app/c?e=demo-event"   # 只是示范，测活动二维码切换用
LVGL_COMMIT="85aa60d18b3d5e5588d7b247abf90198f07c8a63"            # v9.5.0，跟 build.sh 一样

SIM="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MAIN="${SIM}/../main"
WORK="${WORK:-/tmp/folotoy-build}"
LVGL_REPO="${WORK}/cache/lvgl"
LVGL="${WORK}/sim-lvgl"
# lv_conf.h 改了（例如多开一个字型）就要重编 LVGL：.o 资料夹跟着 lv_conf.h 的 hash 走
OBJ="${WORK}/sim-obj-$(md5sum "${SIM}/lv_conf.h" | cut -c1-8)"
OUT="${WORK}/sim-out/card"
CAR_OUT="${WORK}/sim-out/car"
POCKET_OUT="${WORK}/sim-out/pocket"
FIND_OUT="${WORK}/sim-out/find"
DEKU_OUT="${WORK}/sim-out/deku"
NEWS_OUT="${WORK}/sim-out/news"
mkdir -p "${WORK}/cache" "${OUT}" "${CAR_OUT}" "${POCKET_OUT}" "${FIND_OUT}" "${DEKU_OUT}" "${NEWS_OUT}"

# --- 晨报字型（GB2312 全部汉字，约 10MB 原始码，不放仓库）：跟 build.sh 一样从 npm 取字型档再产生 ---
FONT_DIR="${WORK}/cache/noto-sans-sc"
if [[ ! -f "${FONT_DIR}/package/500Medium/NotoSansSC_500Medium.ttf" ]]; then
  mkdir -p "${FONT_DIR}"
  curl -sSL "https://registry.npmjs.org/@expo-google-fonts/noto-sans-sc/-/noto-sans-sc-0.4.4.tgz" | tar -xz -C "${FONT_DIR}" package/500Medium/NotoSansSC_500Medium.ttf package/700Bold/NotoSansSC_700Bold.ttf package/LICENSE_FONT
fi
NEWS_FONT="${WORK}/sim-font_news_20.c"
python3 "${SIM}/../tools/make_font.py" --news-out "${NEWS_FONT}" --ttf "${FONT_DIR}/package/500Medium/NotoSansSC_500Medium.ttf" --bold-ttf "${FONT_DIR}/package/700Bold/NotoSansSC_700Bold.ttf" >/dev/null

# --- LVGL 原始码 + 编一次的 .o（之后重用）---
if [[ ! -d "${LVGL}/src" ]]; then
  [[ -d "${LVGL_REPO}/.git" ]] || git clone -q --filter=blob:none --no-checkout https://github.com/lvgl/lvgl.git "${LVGL_REPO}"
  mkdir -p "${LVGL}"
  git -C "${LVGL_REPO}" archive "${LVGL_COMMIT}" | tar -x -C "${LVGL}"
fi
if [[ ! -f "${OBJ}/.done" ]]; then
  mkdir -p "${OBJ}"
  find "${LVGL}/src" -name '*.c' | while read -r f; do
    echo "${f}"
  done | xargs -P "$(nproc)" -I{} sh -c 'cc -O1 -w -I"$0" -I"$1" -DLV_CONF_INCLUDE_SIMPLE -c "$3" -o "$2/$(echo "$3" | md5sum | cut -c1-12).o"' "${SIM}" "${LVGL}" "${OBJ}" {}
  touch "${OBJ}/.done"
fi

# --- 名片 + 车用画面 + 模拟器 ---
cc -O1 -Wall -Wextra -Werror -I"${SIM}" -I"${SIM}/stub" -I"${LVGL}" -I"${MAIN}" -DLV_CONF_INCLUDE_SIMPLE \
  "-DCONFIG_SPACE_CARD_URL=\"${CARD_URL}\"" "-DCONFIG_SPACE_CARD_LABEL=\"${CARD_LABEL}\"" \
  "-DCONFIG_SPACE_CARD_NAME=\"${CARD_NAME}\"" "-DCONFIG_SPACE_CARD_EVENT_LABEL=\"${EVENT_LABEL}\"" \
  "-DCONFIG_SPACE_REMOTE_NAME=\"${REMOTE_NAME}\"" \
  "${SIM}/sim.c" "${SIM}/stub/ble_remote_stub.c" "${SIM}/stub/sound_stub.c" "${SIM}/stub/news_store_stub.c" \
  "${MAIN}/space_card.c" "${MAIN}/space_card_model.c" "${MAIN}/car_screen.c" "${MAIN}/car_remote_model.c" \
  "${MAIN}/pocket_model.c" "${MAIN}/audio_dsp.c" "${MAIN}/menu_screen.c" "${MAIN}/candle_screen.c" "${MAIN}/timer_screen.c" \
  "${MAIN}/tools_screen.c" "${MAIN}/games_model.c" "${MAIN}/games_screen.c" "${MAIN}/find_screen.c" \
  "${MAIN}/deku_model.c" "${MAIN}/deku_screen.c" "${MAIN}/deku_lines.c" \
  "${MAIN}/news_model.c" "${MAIN}/news_screen.c" "${NEWS_FONT}" \
  "${MAIN}"/font_*.c "${MAIN}/cover_img.c" "${MAIN}/star_img.c" \
  "${OBJ}"/*.o -lm -o "${WORK}/sim"
rm -f "${OUT}"/*.ppm "${OUT}"/*.png "${CAR_OUT}"/*.ppm "${CAR_OUT}"/*.png "${POCKET_OUT}"/*.ppm "${POCKET_OUT}"/*.png "${FIND_OUT}"/*.ppm "${FIND_OUT}"/*.png "${DEKU_OUT}"/*.ppm "${DEKU_OUT}"/*.png "${NEWS_OUT}"/*.ppm "${NEWS_OUT}"/*.png
NEWS_OUT="${NEWS_OUT}" NEWS_BRIEF="${SIM}/../android/app/src/test/resources/brief-sample.txt" \
  "${WORK}/sim" "${OUT}" "${CAR_OUT}" "${POCKET_OUT}" "${FIND_OUT}" "${DEKU_OUT}" "${EVENT_URL}"

# --- 扫二维码（OpenCV 装在独立 venv）---
VENV="${WORK}/sim-venv"
if [[ ! -x "${VENV}/bin/python" ]]; then
  python3 -m venv "${VENV}"
  "${VENV}/bin/pip" install -q opencv-python-headless pillow
fi
"${VENV}/bin/python" -I "${SIM}/scan_qr.py" "${OUT}" "${CARD_URL}?s=folotoy" "${EVENT_URL}&s=folotoy"
"${VENV}/bin/python" -I "${SIM}/scan_qr.py" "${CAR_OUT}"
"${VENV}/bin/python" -I "${SIM}/scan_qr.py" "${POCKET_OUT}"
"${VENV}/bin/python" -I "${SIM}/scan_qr.py" "${FIND_OUT}"
"${VENV}/bin/python" -I "${SIM}/scan_qr.py" "${DEKU_OUT}"
"${VENV}/bin/python" -I "${SIM}/scan_qr.py" "${NEWS_OUT}"

if [[ "${1:-}" == "--update-screenshot" ]]; then
  cp "${OUT}/screens.png" "${SIM}/../firmware/screens.png"
  cp "${CAR_OUT}/screens.png" "${SIM}/../firmware/car-screens.png"
  cp "${POCKET_OUT}/screens.png" "${SIM}/../firmware/pocket-screens.png"
  cp "${FIND_OUT}/screens.png" "${SIM}/../firmware/find-screens.png"
  cp "${DEKU_OUT}/screens.png" "${SIM}/../firmware/deku-screens.png"
  cp "${NEWS_OUT}/screens.png" "${SIM}/../firmware/news-screens.png"
  echo "已更新 firmware/screens.png、car-screens.png、pocket-screens.png、find-screens.png、deku-screens.png、news-screens.png"
fi
