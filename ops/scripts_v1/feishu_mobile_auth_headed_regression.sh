#!/usr/bin/env bash
set -euo pipefail

echo "=== 飞书移动端认证专项（headed）回归开始 ==="

echo "[1/4] 15 工作台移动端容器回归"
pnpm e2e:mobile:all-workstations

echo "[2/4] 认证与权限专项（reception）"
pnpm exec playwright test \
  --headed \
  --config "apps/reception/playwright.config.ts" \
  "apps/reception/e2e/07-reception-feishu-auth.spec.ts"

run_feishu_integration_suite() {
  local app="$1"
  echo ">>> ${app} 08-feishu-integration.spec.ts"
  pnpm exec playwright test \
    --headed \
    --config "apps/${app}/playwright.config.ts" \
    "apps/${app}/e2e/08-feishu-integration.spec.ts"
}

echo "[3/4] 认证与权限专项（equipment/material/facility/lab-personnel）"
run_feishu_integration_suite equipment
run_feishu_integration_suite material
run_feishu_integration_suite facility
run_feishu_integration_suite lab-personnel

echo "[4/4] 门禁校验"
pnpm quality:feishu-container
pnpm quality:mobile-completion

echo "=== 飞书移动端认证专项（headed）回归完成 ==="
