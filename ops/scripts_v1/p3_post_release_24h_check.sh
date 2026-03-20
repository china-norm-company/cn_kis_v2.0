#!/usr/bin/env bash
set -euo pipefail

# P3 post-release 24h routine checks.
# Usage:
#   bash scripts/p3_post_release_24h_check.sh
#   bash scripts/p3_post_release_24h_check.sh --backend-dir /opt/cn-kis/backend --limit 300 --route-days 30

BACKEND_DIR="${BACKEND_DIR:-/opt/cn-kis/backend}"
LIMIT="${LIMIT:-200}"
ROUTE_DAYS="${ROUTE_DAYS:-30}"
CHECK_KIMI_INVOKE=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-dir)
      BACKEND_DIR="${2:-}"
      shift 2
      ;;
    --limit)
      LIMIT="${2:-200}"
      shift 2
      ;;
    --route-days)
      ROUTE_DAYS="${2:-30}"
      shift 2
      ;;
    --skip-kimi-invoke)
      CHECK_KIMI_INVOKE=0
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--backend-dir DIR] [--limit N] [--route-days N] [--skip-kimi-invoke]"
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

run_step() {
  local label="$1"
  shift
  echo
  echo "==> ${label}"
  "$@"
}

echo "[P3 24h Check] $(date '+%Y-%m-%d %H:%M:%S')"
echo "[P3 24h Check] backend dir: $BACKEND_DIR"
echo "[P3 24h Check] limit=$LIMIT route_days=$ROUTE_DAYS"

cd "$BACKEND_DIR"

run_step "LLM providers check" python manage.py check_llm_providers

if [[ "$CHECK_KIMI_INVOKE" -eq 1 ]]; then
  run_step "Kimi invoke check" python manage.py check_llm_providers --provider kimi --invoke
else
  echo "==> Skip Kimi invoke check (--skip-kimi-invoke)"
fi

run_step "Kimi Claw dry-run check" python manage.py check_kimi_claw_delegate --invoke
run_step "Assistant scheduler dry-run (route only)" \
  python manage.py run_assistant_scheduler --dry-run --limit "$LIMIT" --disable-daily-digest --route-days "$ROUTE_DAYS"

echo
echo "[P3 24h Check] DONE"
echo "Group message tip:"
echo "[P3观察] 通道/委派/调度巡检已完成，请根据输出填写 Runbook 指标卡。"
