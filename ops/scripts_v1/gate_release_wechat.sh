#!/bin/bash
# 微信小程序发布前一键总门禁：
# 1) 占位符扫描
# 2) Headed 自动化门禁
# 3) 可选公网联调门禁（仅当显式设置 BASE_URL）

set -e

echo "[1/3] 占位符扫描"
bash scripts/placeholder_scan_delivery.sh

echo "[2/3] Headed 自动化门禁"
pnpm gate:wechat-headed

if [ -n "${BASE_URL:-}" ]; then
  echo "[3/3] 公网联调门禁: BASE_URL=$BASE_URL"
  BASE_URL="$BASE_URL" bash scripts/api_integration_gate.sh
else
  echo "[3/3] 公网联调门禁: 跳过（未设置 BASE_URL，云托管模式）"
  echo "      如需执行联调：BASE_URL=https://api.example.com pnpm gate:release:wechat"
fi

echo "微信发布总门禁通过"
