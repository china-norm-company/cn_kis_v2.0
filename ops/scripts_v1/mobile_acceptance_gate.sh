#!/usr/bin/env bash
set -euo pipefail

echo "==> [1/3] 移动化结构门禁"
python3 scripts/mobile_completion_gate.py

echo "==> [2/3] 15工作台移动双回归"
bash scripts/mobile_dual_all_workstations.sh

echo "==> [3/3] 飞书容器门禁（P0/P1/P2）"
bash scripts/feishu_container_all_workstations.sh

echo "✅ 移动端15工作台验收门禁通过"
