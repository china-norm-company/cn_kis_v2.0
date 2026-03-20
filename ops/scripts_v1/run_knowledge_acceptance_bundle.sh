#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATE_TAG="${1:-$(date +%F)}"
STABILITY_REPORT="backend/logs/knowledge_stability/knowledge_stability_report_${DATE_TAG}.md"
EVIDENCE_PACKAGE="docs/KNOWLEDGE_ACCEPTANCE_EVIDENCE_PACKAGE_${DATE_TAG}.md"

mkdir -p "$ROOT_DIR/backend/logs/knowledge_stability"

cd "$ROOT_DIR"
python3 backend/manage.py generate_knowledge_stability_report --days 14 --output "$STABILITY_REPORT"
python3 backend/manage.py build_knowledge_evidence_package \
  --date "$DATE_TAG" \
  --stability-report "$STABILITY_REPORT" \
  --output "$EVIDENCE_PACKAGE"

echo "Knowledge acceptance bundle generated:"
echo "  - $STABILITY_REPORT"
echo "  - $EVIDENCE_PACKAGE"
