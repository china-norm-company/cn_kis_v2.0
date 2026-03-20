#!/usr/bin/env bash
set -euo pipefail

echo "=== 飞书容器 P0 回归：execution / evaluator / reception ==="

echo "[1/4] execution (iPhone 13)"
pnpm exec playwright test \
  --config "apps/execution/playwright.config.ts" \
  "apps/execution/e2e/mobile/03-feishu-container.mobile.spec.ts" \
  --project "实验室执行工作台 E2E Mobile"

echo "[2/4] evaluator (iPhone 13)"
pnpm exec playwright test \
  --config "apps/evaluator/playwright.config.ts" \
  "apps/evaluator/e2e/mobile/03-feishu-container.mobile.spec.ts" \
  --project "技术评估工作台 E2E Mobile"

echo "[3/4] evaluator (Android Pixel 5)"
pnpm exec playwright test \
  --config "apps/evaluator/playwright.config.ts" \
  "apps/evaluator/e2e/mobile/03-feishu-container.mobile.spec.ts" \
  --project "技术评估工作台 E2E Mobile Android"

echo "[4/4] reception (iPhone 13)"
pnpm exec playwright test \
  --config "apps/reception/playwright.config.ts" \
  "apps/reception/e2e/mobile/03-feishu-container.mobile.spec.ts" \
  --project "接待台 E2E Mobile"

echo "=== 飞书容器 P0 回归完成 ==="
