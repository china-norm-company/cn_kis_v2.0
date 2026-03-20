#!/usr/bin/env bash
set -euo pipefail

# WorkOrder legacy freeze rollout pipeline helper.
# Usage examples:
#   bash scripts/workorder_freeze_pipeline.sh --backend-dir backend --stage preflight
#   bash scripts/workorder_freeze_pipeline.sh --backend-dir backend --stage hourly --hours 1
#   bash scripts/workorder_freeze_pipeline.sh --backend-dir backend --stage full --allow-missing-columns

BACKEND_DIR="${BACKEND_DIR:-backend}"
STAGE="full" # preflight | hourly | full
DAYS=1
HOURS=1
MAX_MISMATCH_COUNT=0
MAX_MISMATCH_RATE=0
WARN_MISMATCH_COUNT=1
WARN_MISMATCH_RATE=0.001
ALLOW_MISSING_COLUMNS=0
STRICT_HOURLY=1
PYTHON_BIN="${PYTHON_BIN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-dir)
      BACKEND_DIR="${2:-}"
      shift 2
      ;;
    --stage)
      STAGE="${2:-}"
      shift 2
      ;;
    --days)
      DAYS="${2:-1}"
      shift 2
      ;;
    --hours)
      HOURS="${2:-1}"
      shift 2
      ;;
    --max-mismatch-count)
      MAX_MISMATCH_COUNT="${2:-0}"
      shift 2
      ;;
    --max-mismatch-rate)
      MAX_MISMATCH_RATE="${2:-0}"
      shift 2
      ;;
    --warn-mismatch-count)
      WARN_MISMATCH_COUNT="${2:-1}"
      shift 2
      ;;
    --warn-mismatch-rate)
      WARN_MISMATCH_RATE="${2:-0.001}"
      shift 2
      ;;
    --allow-missing-columns)
      ALLOW_MISSING_COLUMNS=1
      shift
      ;;
    --non-strict-hourly)
      STRICT_HOURLY=0
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: workorder_freeze_pipeline.sh [options]
  --backend-dir DIR
  --stage preflight|hourly|full      (default: full)
  --days N                           (default: 1)
  --hours N                          (default: 1)
  --max-mismatch-count N             (default: 0)
  --max-mismatch-rate FLOAT          (default: 0)
  --warn-mismatch-count N            (default: 1)
  --warn-mismatch-rate FLOAT         (default: 0.001)
  --allow-missing-columns
  --non-strict-hourly
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Backend dir not found: $BACKEND_DIR"
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/manage.py" ]]; then
  echo "manage.py not found under: $BACKEND_DIR"
  exit 1
fi

if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  else
    echo "python/python3 not found in PATH"
    exit 1
  fi
fi

run_step() {
  local label="$1"
  shift
  echo
  echo "==> ${label}"
  "$@"
}

build_allow_missing_args() {
  if [[ "$ALLOW_MISSING_COLUMNS" -eq 1 ]]; then
    echo "--allow-missing-columns"
  fi
}

echo "[WorkOrder Freeze Pipeline] backend dir: $BACKEND_DIR"
echo "[WorkOrder Freeze Pipeline] stage: $STAGE"
cd "$BACKEND_DIR"

run_preflight() {
  local allow_arg
  allow_arg="$(build_allow_missing_args)"
  run_step "Django check" "$PYTHON_BIN" manage.py check
  run_step "Freeze preflight gate" "$PYTHON_BIN" manage.py workorder_freeze_preflight \
    --days "$DAYS" \
    --max-mismatch-count "$MAX_MISMATCH_COUNT" \
    --max-mismatch-rate "$MAX_MISMATCH_RATE" \
    $allow_arg
}

run_hourly_guard() {
  local allow_arg strict_arg
  allow_arg="$(build_allow_missing_args)"
  strict_arg=""
  if [[ "$STRICT_HOURLY" -eq 1 ]]; then
    strict_arg="--strict"
  fi
  run_step "Hourly guard" "$PYTHON_BIN" manage.py workorder_freeze_hourly_guard \
    --hours "$HOURS" \
    --warn-mismatch-count "$WARN_MISMATCH_COUNT" \
    --warn-mismatch-rate "$WARN_MISMATCH_RATE" \
    $strict_arg \
    $allow_arg
}

case "$STAGE" in
  preflight)
    run_preflight
    ;;
  hourly)
    run_hourly_guard
    ;;
  full)
    run_preflight
    run_step "Transition daily report" "$PYTHON_BIN" manage.py workorder_legacy_transition_report --days "$DAYS"
    run_step "Dual-track consistency audit" "$PYTHON_BIN" manage.py db_fk_consistency_audit
    run_hourly_guard
    ;;
  *)
    echo "Invalid --stage: $STAGE"
    exit 1
    ;;
esac

echo
echo "[WorkOrder Freeze Pipeline] PASS"
