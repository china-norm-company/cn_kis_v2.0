#!/usr/bin/env bash
set -euo pipefail

# P3 preflight checks for secretary workstation.
# Usage:
#   bash scripts/p3_preflight_check.sh
#   bash scripts/p3_preflight_check.sh --backend-dir /opt/cn-kis/backend --skip-real-claw

BACKEND_DIR="${BACKEND_DIR:-/opt/cn-kis/backend}"
SKIP_SEED_ROLES=0
SKIP_REAL_CLAW=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-dir)
      BACKEND_DIR="${2:-}"
      shift 2
      ;;
    --skip-seed-roles)
      SKIP_SEED_ROLES=1
      shift
      ;;
    --skip-real-claw)
      SKIP_REAL_CLAW=1
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--backend-dir DIR] [--skip-seed-roles] [--skip-real-claw]"
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

echo "[P3 Preflight] backend dir: $BACKEND_DIR"
cd "$BACKEND_DIR"

run_step "Django check" python manage.py check

if [[ "$SKIP_SEED_ROLES" -eq 0 ]]; then
  run_step "RBAC seed_roles" python manage.py seed_roles
else
  echo "==> Skip RBAC seed_roles (--skip-seed-roles)"
fi

run_step "LLM providers check" python manage.py check_llm_providers
run_step "Kimi invoke check" python manage.py check_llm_providers --provider kimi --invoke
run_step "Kimi Claw config check" python manage.py check_kimi_claw_delegate
run_step "Kimi Claw dry-run invoke" python manage.py check_kimi_claw_delegate --invoke

if [[ "$SKIP_REAL_CLAW" -eq 0 ]]; then
  run_step "Kimi Claw real invoke" python manage.py check_kimi_claw_delegate --invoke --real
else
  echo "==> Skip Kimi Claw real invoke (--skip-real-claw)"
fi

echo
echo "[P3 Preflight] PASS"
