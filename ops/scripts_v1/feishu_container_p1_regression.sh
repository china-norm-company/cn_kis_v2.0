#!/usr/bin/env bash
set -euo pipefail

echo "=== 飞书容器 P1 回归：recruitment / material / equipment ==="

echo "[1/3] recruitment (iPhone 13)"
pnpm exec playwright test \
  --config "apps/recruitment/playwright.config.ts" \
  "apps/recruitment/e2e/mobile/03-feishu-container.mobile.spec.ts" \
  --project "招募台 E2E Mobile"

echo "[2/3] material (iPhone 13)"
pnpm exec playwright test \
  --config "apps/material/playwright.config.ts" \
  "apps/material/e2e/mobile/03-feishu-container.mobile.spec.ts" \
  --project "度支·物料管理工作台 E2E Mobile"

echo "[3/3] equipment (iPhone 13)"
pnpm exec playwright test \
  --config "apps/equipment/playwright.config.ts" \
  "apps/equipment/e2e/mobile/03-feishu-container.mobile.spec.ts" \
  --project "器衡·设备管理工作台 E2E Mobile"

echo "=== 飞书容器 P1 回归完成 ==="
