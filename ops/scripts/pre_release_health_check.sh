#!/usr/bin/env bash
# CN KIS V2.0 — 发布前健康检查门禁
#
# 使用方式：
#   ./ops/scripts/pre_release_health_check.sh [SERVER_URL]
#
# 默认 SERVER_URL: https://cn-kis.utest.cn
# 所有检查通过后输出 ✅ RELEASE_GATE_PASSED，否则以非零退出
#
# 包含的检查：
#   1. 后端 API 健康（/v2/api/v1/health 或 /v2/api/v1/openapi.json）
#   2. 所有 19 个工作台静态文件可访问（HTTP 200）
#   3. Nginx 路由隔离（governance/data-platform 返回独立 HTML）
#   4. 环境隔离（无 V1 残留引用）

set -euo pipefail

SERVER="${1:-https://cn-kis.utest.cn}"
FAIL=0
PASS=0

check() {
  local name="$1"
  local url="$2"
  local expect="${3:-200}"

  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" || echo "000")
  if [ "$status" = "$expect" ]; then
    echo "  ✅ $name: HTTP $status"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name: HTTP $status (期望 $expect) — $url"
    FAIL=$((FAIL + 1))
  fi
}

html_contains() {
  local name="$1"
  local url="$2"
  local keyword="$3"

  content=$(curl -s --max-time 10 "$url" || echo "")
  if echo "$content" | grep -q "$keyword"; then
    echo "  ✅ $name: HTML 包含 '$keyword'"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name: HTML 未包含 '$keyword' — $url"
    FAIL=$((FAIL + 1))
  fi
}

echo "================================================================"
echo "  CN KIS V2.0 — 发布前健康检查"
echo "  目标服务器: $SERVER"
echo "================================================================"
echo ""

echo "── 1. 后端 API ──"
check "OpenAPI 文档" "$SERVER/v2/api/v1/openapi.json" "200"
echo ""

echo "── 2. 工作台静态文件（19 台）──"
WORKSTATIONS=(
  secretary research quality finance hr crm execution recruitment
  equipment material facility evaluator lab-personnel ethics reception
  control-plane governance digital-workforce data-platform
)
for ws in "${WORKSTATIONS[@]}"; do
  check "$ws" "$SERVER/$ws/" "200"
done
echo ""

echo "── 3. Nginx 路由隔离（独立授权台）──"
html_contains "governance 包含独立 App ID" "$SERVER/governance/" "cli_a937515668b99cc9"
html_contains "data-platform 包含独立 App ID" "$SERVER/data-platform/" "cli_a93753da2c381cef"
echo ""

echo "── 4. 环境隔离检查 ──"
# 检查前端 bundle 无 /api/v1 残留（应为 /v2/api/v1）
if command -v grep &> /dev/null; then
  legacy_count=$(grep -rl '"\/api\/v1"' workstations/ 2>/dev/null | grep -v node_modules | grep -v dist | wc -l || echo "0")
  if [ "$legacy_count" -eq "0" ]; then
    echo "  ✅ 环境隔离: 无 /api/v1 V1 残留引用"
    PASS=$((PASS + 1))
  else
    echo "  ❌ 环境隔离: 发现 $legacy_count 个文件包含 /api/v1 V1 残留"
    FAIL=$((FAIL + 1))
  fi
fi
echo ""

echo "================================================================"
echo "  检查结果: ✅ $PASS 通过  ❌ $FAIL 失败"
echo "================================================================"

if [ "$FAIL" -eq "0" ]; then
  echo ""
  echo "✅ RELEASE_GATE_PASSED"
  exit 0
else
  echo ""
  echo "❌ RELEASE_GATE_FAILED — 请修复以上失败项后再发布"
  exit 1
fi
