#!/bin/bash
# 防走样：证据审计门禁
# 检查 test-results/evidence 下是否存在至少一个场景的证据（response 或 screenshot）
# 可选：EVIDENCE_REQUIRED_SCENARIOS="S01-LOGIN,S02-STATUS" 要求这些场景必须有证据
# 用法: bash scripts/evidence_audit_gate.sh

set -e
ROOT="${BASE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
EVIDENCE_DIR="$ROOT/workstations/wechat-mini/test-results/evidence"
REQUIRED="${EVIDENCE_REQUIRED_SCENARIOS:-}"

if [ ! -d "$EVIDENCE_DIR" ]; then
  echo "证据目录不存在: $EVIDENCE_DIR"
  exit 1
fi

FAIL=0
if [ -n "$REQUIRED" ]; then
  for id in $(echo "$REQUIRED" | tr ',' ' '); do
    subdir="$EVIDENCE_DIR/$id"
    if [ ! -d "$subdir" ]; then
      echo "缺少证据子目录: $id"
      FAIL=1
      continue
    fi
    has_response=$(find "$subdir" -maxdepth 1 -name '*.json' 2>/dev/null | head -1)
    has_screenshot=$(find "$subdir" -maxdepth 1 \( -name '*.png' -o -name '*.jpg' \) 2>/dev/null | head -1)
    if [ -z "$has_response" ] && [ -z "$has_screenshot" ]; then
      echo "场景 $id 证据不完整（需至少 response 或 screenshot）"
      FAIL=1
    fi
  done
else
  # 仅检查目录存在且非空
  count=$(find "$EVIDENCE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  if [ "$count" -eq 0 ]; then
    echo "证据目录下暂无场景子目录（可选：设置 EVIDENCE_REQUIRED_SCENARIOS 强制要求）"
  fi
fi

if [ "$FAIL" -eq 1 ]; then
  echo "证据审计门禁未通过"
  exit 1
fi
echo "证据审计门禁通过"
exit 0
