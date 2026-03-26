#!/bin/bash
# 防走样：交付路径占位符与禁用词扫描
# 扫描 workstations/wechat-mini 与受试者相关后端，禁止 TODO/待实现/mock-only/占位 作为交付态
# 用法: BASE_DIR="$ROOT" bash scripts/placeholder_scan_delivery.sh
# 白名单: scripts/quality_gate_placeholder_allowlist.txt (每行正则，命中则排除)

set -e
ROOT="${BASE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

# 交付路径（受试者小程序 + 受试者/认证后端）
DELIVERY_DIRS="workstations/wechat-mini/src backend/apps/subject backend/apps/identity backend/apps/visit backend/apps/notification backend/apps/edc backend/apps/qrcode"

# 禁用词（交付态不可出现）
PATTERN='TODO|待实现|mock-only|占位|Mock only|MOCK_ONLY'

HITS=$(rg -n --no-ignore \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/__pycache__/**' \
  --glob '!**/*.min.js' \
  --glob '!**/*.spec.ts' \
  --glob '!**/*.test.ts' \
  --glob '!**/*.spec.tsx' \
  --glob '!**/*.test.tsx' \
  --glob '!**/e2e/**' \
  --glob '!**/test_*.py' \
  --glob '!**/*_test.py' \
  "$PATTERN" \
  $DELIVERY_DIRS 2>/dev/null || true)

ALLOWLIST_FILE="scripts/quality_gate_placeholder_allowlist.txt"
if [ -n "$HITS" ] && [ -f "$ALLOWLIST_FILE" ]; then
  FILTERED=$(echo "$HITS" | rg -v -f "$ALLOWLIST_FILE" 2>/dev/null || true)
else
  FILTERED="$HITS"
fi

if [ -n "$FILTERED" ]; then
  echo "占位符/禁用词扫描未通过（交付路径中禁止出现）"
  echo "$FILTERED"
  exit 1
fi
echo "占位符/禁用词扫描通过"
exit 0
