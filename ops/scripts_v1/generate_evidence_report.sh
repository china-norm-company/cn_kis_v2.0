#!/bin/bash
# 根据 test-results/evidence 目录生成证据链报告 EVIDENCE_CHAIN_REPORT.md
# 用法: bash scripts/generate_evidence_report.sh

set -e
ROOT="${BASE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
EVIDENCE_DIR="$ROOT/workstations/wechat-mini/test-results/evidence"
REPORT_FILE="$ROOT/workstations/wechat-mini/test-results/EVIDENCE_CHAIN_REPORT.md"

mkdir -p "$(dirname "$REPORT_FILE")"

echo "# 证据链报告" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "生成时间: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| 场景 ID | 有 response | 有 screenshot | 结论 |" >> "$REPORT_FILE"
echo "|--------|-------------|--------------|------|" >> "$REPORT_FILE"

if [ ! -d "$EVIDENCE_DIR" ]; then
  echo "| (无证据目录) | - | - | 未执行 |" >> "$REPORT_FILE"
  echo "已生成空报告: $REPORT_FILE"
  exit 0
fi

for subdir in "$EVIDENCE_DIR"/*/; do
  [ -d "$subdir" ] || continue
  id=$(basename "$subdir")
  has_json=$(find "$subdir" -maxdepth 1 -name '*.json' 2>/dev/null | head -1)
  has_img=$(find "$subdir" -maxdepth 1 \( -name '*.png' -o -name '*.jpg' \) 2>/dev/null | head -1)
  r="否"; s="否"
  [ -n "$has_json" ] && r="是"
  [ -n "$has_img" ] && s="是"
  if [ "$r" = "是" ] || [ "$s" = "是" ]; then
    conclusion="已留证"
  else
    conclusion="不完整"
  fi
  echo "| $id | $r | $s | $conclusion |" >> "$REPORT_FILE"
done

echo ""
echo "已生成报告: $REPORT_FILE"
exit 0
