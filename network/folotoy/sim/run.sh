#!/usr/bin/env bash
# 在电脑上模拟 FoloToy 屏幕：画出名片 / 活动 / 大二维码三个画面，用程序扫二维码确认网址对。
# 要 cc、git、python3。LVGL 用 ../build.sh 同一个快取（没有就自己 clone）。
#
#   ./sim/run.sh                       # 输出到 /tmp/folotoy-build/sim-out
#   ./sim/run.sh --update-screenshot   # 顺便把对照图存成 firmware/screens.png
#
# 设定跟 Kconfig.projbuild 的预设值一致；改了预设值这里也要改。
set -euo pipefail

CARD_URL="https://space-riccione-reka.vercel.app/c"
CARD_LABEL="Scan to connect"
CARD_NAME="Wilson Teo"
EVENT_LABEL="Event check-in"
EVENT_URL="https://space-riccione-reka.vercel.app/c?e=demo-event"   # 只是示范，测活动二维码切换用
LVGL_COMMIT="85aa60d18b3d5e5588d7b247abf90198f07c8a63"            # v9.5.0，跟 build.sh 一样

SIM="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MAIN="${SIM}/../main"
WORK="${WORK:-/tmp/folotoy-build}"
LVGL_REPO="${WORK}/cache/lvgl"
LVGL="${WORK}/sim-lvgl"
OBJ="${WORK}/sim-obj"
OUT="${WORK}/sim-out"
mkdir -p "${WORK}/cache" "${OUT}"

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

# --- 名片画面 + 模拟器 ---
cc -O1 -Wall -Wextra -Werror -I"${SIM}" -I"${SIM}/stub" -I"${LVGL}" -I"${MAIN}" -DLV_CONF_INCLUDE_SIMPLE \
  "-DCONFIG_SPACE_CARD_URL=\"${CARD_URL}\"" "-DCONFIG_SPACE_CARD_LABEL=\"${CARD_LABEL}\"" \
  "-DCONFIG_SPACE_CARD_NAME=\"${CARD_NAME}\"" "-DCONFIG_SPACE_CARD_EVENT_LABEL=\"${EVENT_LABEL}\"" \
  "${SIM}/sim.c" "${MAIN}/space_card.c" "${MAIN}/space_card_model.c" "${OBJ}"/*.o -lm -o "${WORK}/sim"
rm -f "${OUT}"/*.ppm "${OUT}"/*.png
"${WORK}/sim" "${OUT}" "${EVENT_URL}"

# --- 扫二维码（OpenCV 装在独立 venv）---
VENV="${WORK}/sim-venv"
if [[ ! -x "${VENV}/bin/python" ]]; then
  python3 -m venv "${VENV}"
  "${VENV}/bin/pip" install -q opencv-python-headless pillow
fi
"${VENV}/bin/python" -I "${SIM}/scan_qr.py" "${OUT}" "${CARD_URL}?s=folotoy" "${EVENT_URL}&s=folotoy"

if [[ "${1:-}" == "--update-screenshot" ]]; then
  cp "${OUT}/screens.png" "${SIM}/../firmware/screens.png"
  echo "已更新 firmware/screens.png"
fi
