#!/bin/bash
# 最小可用联调检查：健康 + 鉴权 + 可选带 token 时关键接口响应结构
# 未通过则禁止进入真机验收。用法:
#   BASE_URL=https://<your-api-domain> bash scripts/minimal_integration_check.sh
#   INTEGRATION_TOKEN=xxx BASE_URL=https://<your-api-domain> bash scripts/minimal_integration_check.sh

set -e
ROOT="${BASE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BASE_URL="${BASE_URL:-}"
if [ -z "$BASE_URL" ]; then
  echo "最小联调检查跳过：未设置 BASE_URL（云托管 callContainer 模式默认可跳过）"
  echo "如需执行公网联调，请显式传入 BASE_URL。"
  exit 0
fi
API="${BASE_URL}/api/v1"
FAIL=0

echo "最小联调检查: BASE_URL=$BASE_URL"

# 1. 健康检查 200，且 body 含 code 或 status
resp=$(curl -sS -m 15 "$API/health" 2>/dev/null) || true
if echo "$resp" | grep -qE '"code"[[:space:]]*:[[:space:]]*0|"status"[[:space:]]*:[[:space:]]*"healthy"|"code"[[:space:]]*:[[:space:]]*200'; then
  echo "  /api/v1/health: 200 结构 OK"
else
  code=$(curl -sS -o /dev/null -w "%{http_code}" -m 15 "$API/health" 2>/dev/null) || code="err"
  if [ "$code" = "200" ]; then
    echo "  /api/v1/health: 200 OK (body 未校验)"
  else
    echo "  /api/v1/health: 失败 (code=$code)"
    FAIL=1
  fi
fi

# 2. 无 token 时 /my/profile 必须 403
code=$(curl -sS -o /dev/null -w "%{http_code}" -m 10 "$API/my/profile" 2>/dev/null) || code="err"
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  echo "  /api/v1/my/profile (无 token): $code OK"
else
  echo "  /api/v1/my/profile (无 token): $code (期望 403/401)"
  FAIL=1
fi

# 3. 若有 INTEGRATION_TOKEN，校验关键接口返回 code + data
if [ -n "$INTEGRATION_TOKEN" ]; then
  for path in "/my/profile" "/my/screening-status"; do
    resp=$(curl -sS -m 10 -H "Authorization: Bearer $INTEGRATION_TOKEN" "$API$path" 2>/dev/null) || true
    if echo "$resp" | grep -qE '"code"[[:space:]]*:[[:space:]]*200'; then
      if echo "$resp" | grep -q '"data"'; then
        echo "  $path (带 token): code+data 结构 OK"
      else
        echo "  $path (带 token): 缺 data 字段"
        FAIL=1
      fi
    else
      echo "  $path (带 token): 非 200 或缺 code"
      FAIL=1
    fi
  done
fi

if [ "$FAIL" -eq 1 ]; then
  echo "最小联调检查未通过"
  exit 1
fi
echo "最小联调检查通过"
exit 0
