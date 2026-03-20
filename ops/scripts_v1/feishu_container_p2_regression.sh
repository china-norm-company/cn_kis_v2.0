#!/usr/bin/env bash
set -euo pipefail

echo "=== 飞书容器 P2 回归：secretary / finance / research / quality / hr / crm / facility / lab-personnel / ethics ==="

run_one() {
  local app="$1"
  echo ">>> ${app}"
  pnpm exec playwright test \
    --config "apps/${app}/playwright.config.ts" \
    "apps/${app}/e2e/mobile/03-feishu-container.mobile.spec.ts"
}

run_one secretary
run_one finance
run_one research
run_one quality
run_one hr
run_one crm
run_one facility
run_one lab-personnel
run_one ethics

echo "=== 飞书容器 P2 回归完成 ==="
