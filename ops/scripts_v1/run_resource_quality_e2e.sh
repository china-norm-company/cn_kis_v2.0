#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"

MODE="smoke"
if [[ "${1:-}" == "--full" ]]; then
  MODE="full"
fi

if [[ "$MODE" == "full" ]]; then
  MARK_EXPR="e2e"
  echo "Running FULL resource-facility-quality backend E2E regression..."
else
  MARK_EXPR="e2e and smoke"
  echo "Running SMOKE resource-facility-quality backend E2E regression..."
fi

USE_SQLITE=true PYTHONPATH=. python3 -m pytest \
  tests/e2e/test_equipment_facility_quality_e2e.py \
  tests/e2e/test_equipment_facility_quality_api_e2e.py \
  tests/e2e/test_quality_workflow_api_e2e.py \
  -m "$MARK_EXPR" \
  --tb=short -v
