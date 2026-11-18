#!/usr/bin/env bash
# 编出 FoloToy 名片韧体（一个可以直接烧的 .bin）。要 git、Docker、python3 + Pillow，不用装 ESP-IDF。
#
#   ./build.sh                 # 编 SPACE 名片 → firmware/SPACE-card-full.bin
#   ./build.sh --original      # 编官方原版（换回去用）→ firmware/FoloToy-original-<commit>-full.bin
#   WORK=/some/dir ./build.sh  # 工作资料夹（预设 /tmp/folotoy-build）
#
# 做什么：
#   1. 取上游 FoloToy/ai-passport（固定 commit）
#   2. 把这个资料夹的 main/、tests/ 叠上去，sdkconfig.space.defaults 接在 sdkconfig.defaults 后面
#   3. 依赖照上游 dependencies.lock 的版本从 git 取（不经组件仓库，离线环境也能编）
#   0. 检查中文 / 大数字字型是最新的（tools/make_font.py --check；字型档从 npm 取到快取）
#   4. 在 espressif/idf:v5.5.3 里 host 测试 → idf.py build → merge-bin → 上游 verify_firmware.py
set -euo pipefail

UPSTREAM_REPO="https://github.com/FoloToy/ai-passport.git"
UPSTREAM_COMMIT="e85197d56abe92c35a1cfb84fad85fba2545c9cc"
IDF_IMAGE="espressif/idf:v5.5.3"

# dependencies.lock 的版本 → 对应的 git 来源（repo、commit、资料夹）
#   lvgl/lvgl 9.5.0、esp_lvgl_port 2.9.0、button 4.2.0、cmake_utilities 1.1.1、esp_codec_dev 1.6.2
DEPS=(
  "lvgl|https://github.com/lvgl/lvgl.git|85aa60d18b3d5e5588d7b247abf90198f07c8a63|."
  "esp_lvgl_port|https://github.com/espressif/esp-bsp.git|058d2aa|components/esp_lvgl_port"
  "button|https://github.com/espressif/esp-iot-solution.git|69fbec42|components/button"
  "cmake_utilities|https://github.com/espressif/esp-iot-solution.git|59c66ec4|tools/cmake_utilities"
  "esp_codec_dev|https://github.com/espressif/esp-adf.git|8341053|components/esp_codec_dev"
)

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORK="${WORK:-/tmp/folotoy-build}"
MODE="space"
[[ "${1:-}" == "--original" ]] && MODE="original"

mkdir -p "${WORK}"
CACHE="${WORK}/cache"
SRC="${WORK}/src-${MODE}"
mkdir -p "${CACHE}"

# --- 0. 中文 / 大数字字型是不是最新（程序里加了新的中文字却没重新产生，画面会出现方框）---
FONT_TGZ_URL="https://registry.npmjs.org/@expo-google-fonts/noto-sans-sc/-/noto-sans-sc-0.4.4.tgz"
FONT_DIR="${CACHE}/noto-sans-sc"
if [[ ! -f "${FONT_DIR}/package/700Bold/NotoSansSC_700Bold.ttf" ]]; then
  mkdir -p "${FONT_DIR}"
  curl -sSL "${FONT_TGZ_URL}" | tar -xz -C "${FONT_DIR}" package/500Medium/NotoSansSC_500Medium.ttf package/700Bold/NotoSansSC_700Bold.ttf package/LICENSE_FONT
fi
python3 "${HERE}/tools/make_font.py" --check \
  --ttf "${FONT_DIR}/package/500Medium/NotoSansSC_500Medium.ttf" \
  --bold-ttf "${FONT_DIR}/package/700Bold/NotoSansSC_700Bold.ttf"

python3 "${HERE}/tools/make_cover.py" --check

# --- 1. 上游 ---
if [[ ! -d "${CACHE}/ai-passport/.git" ]]; then
  git clone -q "${UPSTREAM_REPO}" "${CACHE}/ai-passport"
fi
git -C "${CACHE}/ai-passport" fetch -q origin "${UPSTREAM_COMMIT}" 2>/dev/null || true
rm -rf "${SRC:?}"
mkdir -p "${SRC}"
git -C "${CACHE}/ai-passport" archive "${UPSTREAM_COMMIT}" | tar -x -C "${SRC}"

# --- 2. 叠上 SPACE 名片 ---
if [[ "${MODE}" == "space" ]]; then
  cp "${HERE}"/main/* "${SRC}/main/"
  cp "${HERE}"/tests/test_*.c "${SRC}/tests/"
  cat "${HERE}/sdkconfig.space.defaults" >> "${SRC}/sdkconfig.defaults"
fi

# --- 3. 依赖（git，blobless clone 只拿需要的资料夹）---
for dep in "${DEPS[@]}"; do
  IFS='|' read -r name url commit path <<<"${dep}"
  repo="${CACHE}/$(basename "${url}" .git)"
  if [[ ! -d "${repo}/.git" ]]; then
    git clone -q --filter=blob:none --no-checkout "${url}" "${repo}"
  fi
  mkdir -p "${SRC}/components/${name}"
  if [[ "${path}" == "." ]]; then
    git -C "${repo}" archive "${commit}" | tar -x -C "${SRC}/components/${name}"
  else
    depth=$(awk -F/ '{print NF}' <<<"${path}")
    git -C "${repo}" archive "${commit}" "${path}" | tar -x -C "${SRC}/components/${name}" --strip-components="${depth}"
  fi
done

# --- 4. 编译 + 验证（Docker 里）---
docker run --rm -v "${SRC}:/project" -w /project \
  -e IDF_COMPONENT_MANAGER=0 -e LVGL_VERSION=9.5.0 -e MODE="${MODE}" \
  "${IDF_IMAGE}" bash -c '
    set -e
    if [ "$MODE" = space ]; then
      cc -std=c11 -Wall -Wextra -Werror -Imain main/space_card_model.c tests/test_space_card_model.c -o /tmp/t && /tmp/t
      cc -std=c11 -Wall -Wextra -Werror -Imain main/space_card_model.c main/car_remote_model.c tests/test_car_remote_model.c -o /tmp/t2 && /tmp/t2
      cc -std=c11 -Wall -Wextra -Werror -Imain main/space_card_model.c main/pocket_model.c tests/test_pocket_model.c -o /tmp/t3 && /tmp/t3
      cc -std=gnu11 -Wall -Wextra -Werror -Imain main/audio_dsp.c tests/test_audio_dsp.c -lm -o /tmp/t4 && /tmp/t4
      cc -std=c11 -Wall -Wextra -Werror -Imain main/games_model.c tests/test_games_model.c -o /tmp/t5 && /tmp/t5
    fi
    idf.py set-target esp32c3 >/tmp/target.log 2>&1 || { tail -30 /tmp/target.log; exit 1; }
    idf.py build >/tmp/build.log 2>&1 || { tail -60 /tmp/build.log; exit 1; }
    if grep -E "main/[^ ]*\.c:[0-9]+:[0-9]+: warning" /tmp/build.log; then echo "main/ 有编译警告"; exit 1; fi
    idf.py merge-bin -o FoloToy-AI-Passport-full.bin >/dev/null 2>&1
    python3 tools/verify_firmware.py build
  '

OUT="${HERE}/firmware"
mkdir -p "${OUT}"
if [[ "${MODE}" == "space" ]]; then
  name="SPACE-card-full.bin"
else
  name="FoloToy-original-${UPSTREAM_COMMIT:0:7}-full.bin"
fi
cp "${SRC}/build/FoloToy-AI-Passport-full.bin" "${OUT}/${name}"
(cd "${OUT}" && sha256sum ./*.bin | sed 's# \./# #' > SHA256SUMS.txt)
echo "完成：${OUT}/${name}"
