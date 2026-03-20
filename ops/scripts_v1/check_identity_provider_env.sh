#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-deploy/.env.volcengine.plan-a}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE"
  echo "Usage: bash scripts/check_identity_provider_env.sh [env-file]"
  exit 2
fi

required_keys=(
  "VOLC_ACCESSKEY"
  "VOLC_SECRETKEY"
  "VOLC_ACCOUNT_ID"
  "VOLC_SUB_ACCESSKEY"
  "VOLC_SUB_SECRETKEY"
  "VOLC_CERT_ROLE_TRN"
  "IDENTITY_VERIFY_H5_CONFIG_ID"
  "IDENTITY_VERIFY_CALLBACK_TOKEN"
)

optional_keys=(
  "IDENTITY_VERIFY_ALLOW_MANUAL_COMPLETE"
)

missing=()
invalid=()

read_key() {
  local key="$1"
  awk -F= -v k="$key" '
    $1 == k {
      sub(/^[ \t]+/, "", $2)
      sub(/[ \t]+$/, "", $2)
      gsub(/^["'"'"']|["'"'"']$/, "", $2)
      print $2
      found=1
      exit
    }
    END {
      if (!found) print ""
    }
  ' "$ENV_FILE"
}

echo "Checking identity provider env (volcengine SDK) in: $ENV_FILE"
echo

for key in "${required_keys[@]}"; do
  value="$(read_key "$key")"
  if [[ -z "$value" ]]; then
    missing+=("$key")
    echo "[MISSING] $key"
  else
    echo "[OK] $key configured"
  fi
done

for key in "${optional_keys[@]}"; do
  value="$(read_key "$key")"
  if [[ -z "$value" ]]; then
    echo "[OPTIONAL] $key not set (default=false)"
  else
    echo "[OPTIONAL] $key=$value"
  fi
done

echo
if (( ${#missing[@]} > 0 )); then
  echo "Identity provider env check FAILED"
  echo "Missing keys: ${missing[*]}"
  exit 1
fi

echo "Identity provider env check PASSED"
