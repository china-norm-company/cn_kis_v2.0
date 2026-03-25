#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE="${APP_DIR}/.env"
SECRETS_FILE="${APP_DIR}/eas.secrets.local"
FAILED=0

echo "== mobile-rn 发布配置检查 =="

check_file_exists() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "✗ 缺少文件: $file"
    FAILED=1
  else
    echo "✓ 文件存在: $file"
  fi
}

get_value() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    echo ""
    return
  fi
  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  echo "${line#*=}"
}

check_required_key() {
  local file="$1"
  local key="$2"
  local value
  value="$(get_value "$file" "$key")"
  if [[ -z "$value" ]]; then
    echo "✗ ${file##*/} 缺少 ${key}"
    FAILED=1
  else
    echo "✓ ${file##*/} ${key} 已配置"
  fi
}

check_file_exists "$ENV_FILE"
check_file_exists "$SECRETS_FILE"

echo
echo "-- 检查 .env 关键项 --"
check_required_key "$ENV_FILE" "EXPO_PUBLIC_API_BASE"
check_required_key "$ENV_FILE" "EXPO_PUBLIC_ENV_NAME"

echo
echo "-- 检查 eas.secrets.local 关键项 --"
check_required_key "$SECRETS_FILE" "EXPO_PUBLIC_API_BASE"
check_required_key "$SECRETS_FILE" "EXPO_PROJECT_ID"
check_required_key "$SECRETS_FILE" "EXPO_BUNDLE_ID"
check_required_key "$SECRETS_FILE" "EXPO_ANDROID_PACKAGE"

API_BASE="$(get_value "$SECRETS_FILE" "EXPO_PUBLIC_API_BASE")"
BUNDLE_ID="$(get_value "$SECRETS_FILE" "EXPO_BUNDLE_ID")"
ANDROID_PACKAGE="$(get_value "$SECRETS_FILE" "EXPO_ANDROID_PACKAGE")"

if [[ -n "$API_BASE" && ! "$API_BASE" =~ ^https:// ]]; then
  echo "✗ EXPO_PUBLIC_API_BASE 必须使用 https://"
  FAILED=1
fi

if [[ -n "$BUNDLE_ID" && ! "$BUNDLE_ID" =~ ^[a-zA-Z0-9]+(\.[a-zA-Z0-9_]+)+$ ]]; then
  echo "✗ EXPO_BUNDLE_ID 格式非法: $BUNDLE_ID"
  FAILED=1
fi

if [[ -n "$ANDROID_PACKAGE" && ! "$ANDROID_PACKAGE" =~ ^[a-zA-Z0-9]+(\.[a-zA-Z0-9_]+)+$ ]]; then
  echo "✗ EXPO_ANDROID_PACKAGE 格式非法: $ANDROID_PACKAGE"
  FAILED=1
fi

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "✓ 发布配置检查通过"
  exit 0
fi

echo "✗ 发布配置检查未通过，请按提示修复后重试"
exit 1
