#!/usr/bin/env bash
# 编出 SPACE 车控 Android app（APK）+ 跑单元测试。要 Docker，不用装 Android Studio。
#   ./android/build.sh          → ../firmware/SPACE-car-app.apk
# 用 cimg/android 镜像（里面有 Android SDK）。下载 Gradle 套件要能连 dl.google.com、Maven Central。
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
GRADLE_HOME_DIR="${GRADLE_HOME_DIR:-/tmp/folotoy-build/gradle-home}"
mkdir -p "${GRADLE_HOME_DIR}"
JAVA_OPTS=""
# 有 HTTPS 代理（云端开发环境）就让 Gradle 也走代理、信任代理的憑證
if [[ -n "${HTTPS_PROXY:-}" ]]; then
  hp="${HTTPS_PROXY#*://}"; hp="${hp%%/*}"
  JAVA_OPTS="-Dhttps.proxyHost=${hp%:*} -Dhttps.proxyPort=${hp##*:}"
  [[ -f /etc/ssl/certs/java/cacerts ]] && JAVA_OPTS="${JAVA_OPTS} -Djavax.net.ssl.trustStore=/ccr-cacerts -Djavax.net.ssl.trustStorePassword=changeit"
fi
docker run --rm -u 0 --network host -v "${HERE}:/w" -w /w -v "${GRADLE_HOME_DIR}:/gh" \
  $( [[ -f /etc/ssl/certs/java/cacerts ]] && echo "-v /etc/ssl/certs/java/cacerts:/ccr-cacerts:ro" ) \
  -e GRADLE_USER_HOME=/gh -e JAVA_TOOL_OPTIONS="${JAVA_OPTS}" \
  cimg/android:2025.10 bash -c '
    echo "sdk.dir=$ANDROID_HOME" > local.properties
    # --max-workers=1：代理一次下载太多会失败
    gradle --no-daemon -q --max-workers=1 testDebugUnitTest assembleDebug 2>&1 | grep -v "Picked up JAVA_TOOL_OPTIONS" || true
    test -f app/build/outputs/apk/debug/app-debug.apk
  '
for f in "${HERE}"/app/build/test-results/testDebugUnitTest/*.xml; do
  grep -o 'testsuite name="[^"]*" tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"' "$f"
  grep -q 'failures="0" errors="0"' "$f" || { echo "单元测试失败：$f"; exit 1; }
done
cp "${HERE}/app/build/outputs/apk/debug/app-debug.apk" "${HERE}/../firmware/SPACE-car-app.apk"
echo "完成：firmware/SPACE-car-app.apk"
