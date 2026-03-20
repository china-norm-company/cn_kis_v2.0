#!/usr/bin/env bash
set -euo pipefail

echo "=== 飞书容器全工作台回归开始 ==="
bash scripts/feishu_container_p0_regression.sh
bash scripts/feishu_container_p1_regression.sh
bash scripts/feishu_container_p2_regression.sh
echo "=== 飞书容器全工作台回归完成 ==="
