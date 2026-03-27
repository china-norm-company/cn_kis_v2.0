#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SECRETS_FILE="${APP_DIR}/eas.secrets.local"

if ! command -v eas >/dev/null 2>&1; then
  echo "eas CLI 未安装，请先执行: npm i -g eas-cli"
  exit 1
fi

if [[ ! -f "${SECRETS_FILE}" ]]; then
  echo "未找到 ${SECRETS_FILE}"
  echo "请先执行：cp eas.secrets.example eas.secrets.local 并填写变量"
  exit 1
fi

echo "开始同步 EAS Secrets..."
while IFS= read -r line || [[ -n "${line}" ]]; do
  line="$(echo "${line}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "${line}" ]] && continue
  [[ "${line}" == \#* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"
  if [[ -z "${key}" || -z "${value}" ]]; then
    continue
  fi

  # 非交互更新同名 secret
  eas secret:create --scope project --name "${key}" --value "${value}" --force --non-interactive >/dev/null
  echo "已同步: ${key}"
done < "${SECRETS_FILE}"

echo "EAS Secrets 同步完成。"
