#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "用法: bash scripts/mobile_dual_regression.sh <app1> [app2 ...]"
  echo "示例: bash scripts/mobile_dual_regression.sh evaluator reception execution"
  exit 1
fi

for app in "$@"; do
  app_dir="apps/${app}"
  config_file="${app_dir}/playwright.config.ts"

  if [ ! -d "$app_dir" ]; then
    echo "跳过不存在的工作台目录: $app_dir"
    continue
  fi

  if [ ! -f "$config_file" ]; then
    echo "=== [$app] 未配置 Playwright，跳过双回归 ==="
    continue
  fi

  has_desktop_tests="false"
  desktop_specs=()
  desktop_candidates=(
    "$app_dir"/e2e/*.spec.ts
    "$app_dir"/e2e/*/*.spec.ts
    "$app_dir"/e2e/*/*/*.spec.ts
  )
  for spec in "${desktop_candidates[@]}"; do
    if [[ -f "$spec" && "$spec" != *.mobile.spec.ts ]]; then
      has_desktop_tests="true"
      desktop_specs+=("$spec")
    fi
  done

  if [[ "$has_desktop_tests" == "true" ]]; then
    echo "=== [$app] 桌面回归 ==="
    pnpm exec playwright test --config "$config_file" "${desktop_specs[@]}"
  else
    echo "=== [$app] 无桌面用例，跳过桌面回归 ==="
  fi

  if ls "$app_dir"/e2e/mobile/*.mobile.spec.ts >/dev/null 2>&1; then
    echo "=== [$app] 移动回归 ==="
    pnpm exec playwright test --config "$config_file" "$app_dir/e2e/mobile"
  else
    echo "=== [$app] 无移动用例，跳过移动回归 ==="
  fi
done

echo "双回归执行完成"
