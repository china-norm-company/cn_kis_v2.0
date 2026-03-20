#!/bin/bash
# 防走样：联调门禁 - 公网联调地址与鉴权
# 请求 BASE_URL：/api/v1/health 必须 200；/api/v1/my/profile 无 token 必须 403
# 用法: BASE_URL=https://<your-api-domain> bash scripts/api_integration_gate.sh

set -e
BASE_URL="${BASE_URL:-}"
if [ -z "$BASE_URL" ]; then
  echo "联调门禁跳过：未设置 BASE_URL（云托管 callContainer 模式默认可跳过）"
  echo "如需执行公网联调，请显式传入 BASE_URL，例如："
  echo "  BASE_URL=https://api.example.com bash scripts/api_integration_gate.sh"
  exit 0
fi
API="${BASE_URL}/api/v1"

FAIL=0

echo "联调门禁: BASE_URL=$BASE_URL"

# 1. 健康检查必须 200
if resp=$(curl -sS -w "\n%{http_code}" -m 15 "$API/health" 2>/dev/null); then
  code=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | sed '$d')
  if [ "$code" = "200" ]; then
    echo "  /api/v1/health: $code OK"
  else
    echo "  /api/v1/health: $code (期望 200)"
    FAIL=1
  fi
else
  echo "  /api/v1/health: 请求失败"
  FAIL=1
fi

# 2. 鉴权接口无 token 必须 403
if resp=$(curl -sS -w "\n%{http_code}" -m 10 "$API/my/profile" 2>/dev/null); then
  code=$(echo "$resp" | tail -n1)
  if [ "$code" = "403" ]; then
    echo "  /api/v1/my/profile (无 token): 403 OK"
  else
    echo "  /api/v1/my/profile (无 token): $code (期望 403)"
    FAIL=1
  fi
else
  echo "  /api/v1/my/profile: 请求失败"
  FAIL=1
fi

if [ "$FAIL" -eq 1 ]; then
  echo "联调门禁未通过"
  exit 1
fi
echo "联调门禁通过"
exit 0
