#!/usr/bin/env bash
# 一键 iOS Headed 回归：
# 1) 校验 Xcode/Simulator/CocoaPods/Java/Maestro
# 2) 启动一个可用 iPhone 模拟器
# 3) 如未安装 App，自动执行 expo run:ios 构建安装
# 4) 运行全部 Maestro 流程
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

APP_BUNDLE_ID="${EXPO_BUNDLE_ID:-cc.utest.cnkis.subject}"
XCODE_DEV_DIR="/Applications/Xcode.app/Contents/Developer"

for jdk in /opt/homebrew/opt/openjdk@17/bin /opt/homebrew/opt/openjdk/bin; do
  if [[ -d "$jdk" ]]; then
    export PATH="$jdk:$PATH"
    break
  fi
done
if [[ -d "$HOME/.maestro/bin" ]]; then
  export PATH="$PATH:$HOME/.maestro/bin"
fi

need_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: 缺少命令 $cmd。$hint"
    exit 1
  fi
}

need_cmd pnpm "请先安装 Node.js 与 pnpm。"
need_cmd pod "请执行: brew install cocoapods"
need_cmd java "请执行: brew install openjdk@17"
need_cmd maestro "请执行: curl -Ls \"https://get.maestro.mobile.dev\" | bash"
need_cmd xcrun "请安装完整 Xcode。"

if [[ ! -d "/Applications/Xcode.app" ]]; then
  echo "ERROR: 未检测到 /Applications/Xcode.app。请先从 App Store 安装完整 Xcode。"
  exit 1
fi

CURRENT_DEV_DIR="$(xcode-select -p 2>/dev/null || true)"
if [[ "$CURRENT_DEV_DIR" != "$XCODE_DEV_DIR" ]]; then
  echo "ERROR: 当前 xcode-select 指向: ${CURRENT_DEV_DIR:-<empty>}"
  echo "请先执行（需要管理员权限）:"
  echo "  sudo xcode-select -s $XCODE_DEV_DIR"
  exit 1
fi

if ! xcrun simctl list devices >/dev/null 2>&1; then
  echo "ERROR: simctl 不可用。请打开 Xcode 完成首次组件安装后重试。"
  exit 1
fi

BOOTED_UDID="$(
python3 - <<'PY'
import json, subprocess

raw = subprocess.check_output(["xcrun", "simctl", "list", "devices", "-j"], text=True)
data = json.loads(raw)
for runtime, devices in data.get("devices", {}).items():
    for dev in devices:
        if dev.get("isAvailable") and dev.get("state") == "Booted":
            print(dev.get("udid", ""))
            raise SystemExit(0)
print("")
PY
)"

if [[ -z "$BOOTED_UDID" ]]; then
  TARGET_UDID="$(
python3 - <<'PY'
import json, subprocess

raw = subprocess.check_output(["xcrun", "simctl", "list", "devices", "-j"], text=True)
data = json.loads(raw)
for runtime in sorted(data.get("devices", {}).keys(), reverse=True):
    if "iOS" not in runtime:
        continue
    for dev in data["devices"][runtime]:
        name = dev.get("name", "")
        if dev.get("isAvailable") and name.startswith("iPhone"):
            print(dev.get("udid", ""))
            raise SystemExit(0)
print("")
PY
)"
  if [[ -z "$TARGET_UDID" ]]; then
    echo "ERROR: 未找到可用 iPhone 模拟器。请在 Xcode > Settings > Platforms 安装 iOS runtime。"
    exit 1
  fi
  echo "Booting simulator: $TARGET_UDID"
  xcrun simctl boot "$TARGET_UDID" >/dev/null 2>&1 || true
  open -a Simulator
  xcrun simctl bootstatus "$TARGET_UDID" -b
  BOOTED_UDID="$TARGET_UDID"
else
  open -a Simulator
fi

if ! xcrun simctl get_app_container "$BOOTED_UDID" "$APP_BUNDLE_ID" >/dev/null 2>&1; then
  echo "App ($APP_BUNDLE_ID) 未安装到当前模拟器，开始执行 ios 构建安装..."
  pnpm ios
fi

echo "开始执行 iOS Headed 全量 Maestro 回归..."
pnpm e2e:maestro:all

