#!/usr/bin/env bash
set -euo pipefail

# Real backend integration tests for secretary AI abilities.
# Required:
#   AI_LIVE_AUTH_TOKEN
# Optional:
#   AI_LIVE_BASE_URL (default: http://118.196.64.48)
#   AI_LIVE_AGENT_ID (default: general-assistant)
#   AI_LIVE_REQUIRE_STRICT_FALLBACK=1 (fail if strict fallback cannot be verified)
#   AI_LIVE_RUN_HEADED=1 (also run headed live UI validation)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/secretary"
LIVE_ENV_FILE="$APP_DIR/.env.live"

if [[ -f "$LIVE_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$LIVE_ENV_FILE"
  set +a
fi

if [[ -z "${AI_LIVE_AUTH_TOKEN:-}" ]]; then
  echo "ERROR: AI_LIVE_AUTH_TOKEN is required."
  echo "Please set it in $LIVE_ENV_FILE"
  echo "Example:"
  echo "  cat > \"$LIVE_ENV_FILE\" <<'EOF'"
  echo "  AI_LIVE_BASE_URL=http://118.196.64.48"
  echo "  AI_LIVE_AUTH_TOKEN=<jwt>"
  echo "  AI_LIVE_AGENT_ID=general-assistant"
  echo "  AI_LIVE_REQUIRE_STRICT_FALLBACK=0"
  echo "  EOF"
  echo "  bash scripts/run_secretary_ai_live_tests.sh"
  exit 1
fi

echo "Running secretary AI live backend tests..."
echo "  base_url=${AI_LIVE_BASE_URL:-http://118.196.64.48}"
echo "  agent_id=${AI_LIVE_AGENT_ID:-general-assistant}"
echo "  strict_fallback=${AI_LIVE_REQUIRE_STRICT_FALLBACK:-0}"
echo "  run_headed=${AI_LIVE_RUN_HEADED:-0}"

cd "$APP_DIR"
pnpm run test:ai-live

if [[ "${AI_LIVE_RUN_HEADED:-0}" == "1" ]]; then
  echo "Running headed live UI validation..."
  pnpm run test:ai-live-headed
else
  echo "Skip headed UI validation (set AI_LIVE_RUN_HEADED=1 to enable)."
fi
