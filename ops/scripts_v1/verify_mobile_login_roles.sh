#!/usr/bin/env bash
# P0.9 API 验证脚本：验证后端微信/短信登录接口返回真实 roles
# 用法：
#   chmod +x scripts/verify_mobile_login_roles.sh
#   ./scripts/verify_mobile_login_roles.sh [BASE_URL]
#
# 需要环境变量：
#   TEST_PHONE         - 测试手机号（已在测试环境注册）
#   TEST_SMS_CODE      - 测试短信验证码（或配置绕过）
#   BASE_URL           - API 基础 URL（默认 http://localhost:8000）

set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:8000}}"
TEST_PHONE="${TEST_PHONE:-}"
TEST_SMS_CODE="${TEST_SMS_CODE:-}"
PASS=0
FAIL=0

echo "================================================"
echo "P0.9 移动端登录 roles API 验证"
echo "BASE_URL: $BASE_URL"
echo "================================================"

# -------------------------------------------------------
# 辅助函数
# -------------------------------------------------------
check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "  ✅ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc"
    FAIL=$((FAIL + 1))
  fi
}

# -------------------------------------------------------
# 1. 验证 GET /auth/profile 端点可访问（需要 Bearer token）
# -------------------------------------------------------
echo ""
echo "== 检查 /auth/profile 端点 =="

# 用无效 token 请求，应返回 401
PROFILE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalid-token-for-test" \
  "$BASE_URL/api/v1/auth/profile" 2>/dev/null || echo "0")

check "/auth/profile 无效 token 应返回 401 或 403" \
  "$([ "$PROFILE_STATUS" = "401" ] || [ "$PROFILE_STATUS" = "403" ] && echo true || echo false)"

# -------------------------------------------------------
# 2. 如果有测试账号，验证短信登录返回 roles
# -------------------------------------------------------
if [ -n "$TEST_PHONE" ] && [ -n "$TEST_SMS_CODE" ]; then
  echo ""
  echo "== 验证 POST /auth/sms/verify 返回 roles =="

  SMS_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$TEST_PHONE\",\"code\":\"$TEST_SMS_CODE\",\"scene\":\"cn_kis_login\"}" \
    "$BASE_URL/api/v1/auth/sms/verify" 2>/dev/null || echo "{}")

  SMS_HAS_TOKEN=$(echo "$SMS_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('true' if data.get('access_token') else 'false')
" 2>/dev/null || echo "false")

  check "SMS 登录返回 access_token" "$SMS_HAS_TOKEN"

  SMS_ROLES=$(echo "$SMS_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
roles = data.get('roles', None)
print('true' if isinstance(roles, list) else 'false')
" 2>/dev/null || echo "false")

  check "SMS 登录响应包含 roles 字段（列表类型）" "$SMS_ROLES"

  SMS_WORKBENCHES=$(echo "$SMS_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
wb = data.get('visible_workbenches', None)
print('true' if isinstance(wb, list) else 'false')
" 2>/dev/null || echo "false")

  check "SMS 登录响应包含 visible_workbenches 字段（列表类型）" "$SMS_WORKBENCHES"

  # 如果登录成功，用 token 验证 /auth/profile
  if [ "$SMS_HAS_TOKEN" = "true" ]; then
    SMS_TOKEN=$(echo "$SMS_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('access_token', ''))
" 2>/dev/null || echo "")

    echo ""
    echo "== 验证 GET /auth/profile 使用真实 token =="

    PROFILE_RESPONSE=$(curl -s \
      -H "Authorization: Bearer $SMS_TOKEN" \
      "$BASE_URL/api/v1/auth/profile" 2>/dev/null || echo "{}")

    PROFILE_HAS_ROLES=$(echo "$PROFILE_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
body = data.get('data', data)
roles = body.get('roles', None)
print('true' if isinstance(roles, list) else 'false')
" 2>/dev/null || echo "false")

    check "/auth/profile 使用真实 token 返回 roles 字段" "$PROFILE_HAS_ROLES"

    PROFILE_HAS_ACCOUNT_TYPE=$(echo "$PROFILE_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
body = data.get('data', data)
at = body.get('account_type', None)
print('true' if at is not None else 'false')
" 2>/dev/null || echo "false")

    check "/auth/profile 返回 account_type 字段" "$PROFILE_HAS_ACCOUNT_TYPE"
  fi
else
  echo ""
  echo "⚠️  未设置 TEST_PHONE / TEST_SMS_CODE，跳过真实登录验证"
  echo "   设置方式: export TEST_PHONE=1xxxxxxxxxx TEST_SMS_CODE=xxxxxx"
fi

# -------------------------------------------------------
# 3. 验证后端 pytest 单元测试
# -------------------------------------------------------
if command -v pytest &>/dev/null; then
  echo ""
  echo "== 运行后端 pytest 单元测试（mobile login roles）=="
  cd "$(dirname "$0")/.." || exit 1
  if pytest backend/tests/unit/test_mobile_login_roles.py -v --tb=short 2>&1; then
    check "后端 pytest: test_mobile_login_roles" "true"
  else
    check "后端 pytest: test_mobile_login_roles" "false"
  fi
fi

# -------------------------------------------------------
# 总结
# -------------------------------------------------------
echo ""
echo "================================================"
echo "验证结果: $PASS 通过 / $FAIL 失败"
echo "================================================"

if [ $FAIL -gt 0 ]; then
  echo "❌ 部分验证失败，请检查上面的错误项"
  exit 1
else
  echo "✅ 所有验证通过"
  exit 0
fi
