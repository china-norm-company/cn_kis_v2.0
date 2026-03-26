#!/usr/bin/env bash
# 生成微信小程序预览二维码（开发版）
# 防走样要点：
# 1) 二维码文件每次先删后生成，避免复用过期文件
# 2) 若 dist/app.json 缺失，先自动构建，避免 preview 失败
set -euo pipefail
CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_PNG="${ROOT}/test-results/wechat-preview-qr.png"
OUT_JSON="${ROOT}/test-results/wechat-preview-info.json"
mkdir -p "${ROOT}/test-results"
rm -f "$OUT_PNG" "$OUT_JSON"

if [ ! -f "${ROOT}/dist/app.json" ]; then
  echo "检测到 dist/app.json 不存在，先执行构建..."
  (cd "$ROOT" && pnpm run build:weapp)
fi

LOGIN_OUTPUT="$("$CLI" islogin 2>/dev/null || true)"
if [[ "$LOGIN_OUTPUT" != *'"login":true'* ]]; then
  echo "微信开发者工具未登录，请先执行: $CLI login"
  exit 1
fi

"$CLI" preview --project "$ROOT" -f image -o "$OUT_PNG" -i "$OUT_JSON" "$@"
if [ ! -f "$OUT_PNG" ]; then
  echo "预览失败：未生成二维码文件，请检查开发者工具登录态。"
  exit 1
fi

echo "预览二维码已生成: $OUT_PNG"
echo "预览信息文件: $OUT_JSON"
if command -v open >/dev/null 2>&1; then
  open "$OUT_PNG" || true
fi
