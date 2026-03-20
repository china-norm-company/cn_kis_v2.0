#!/bin/bash
# CN_KIS 质量门禁 - 开发完成后必须通过
# 用法: ./scripts/quality_gate.sh [--skip-feishu] [--skip-frontend] [--skip-volcengine] [--skip-backend] [--skip-tests] [--skip-dual] [--skip-resource-e2e] [--skip-digital-worker] [--resource-e2e-full] [--mode local|ci|production]
#
# --skip-feishu     跳过飞书 API 测试（无凭证时使用）
# --skip-frontend   跳过前端构建与类型检查
# --skip-volcengine 跳过火山云配置校验
# --skip-backend    跳过后端检查
# --skip-tests      跳过单元测试
# --skip-dual       跳过全工作台双回归（桌面+移动）
# --skip-resource-e2e 跳过设备-设施-质量后端E2E回归
# --skip-digital-worker 跳过数字员工真实能力发布门禁
# --resource-e2e-full 设备-设施-质量后端E2E使用全量模式（默认 smoke）
# --mode            质量门禁模式：local(默认)/ci/production

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_FEISHU=0
SKIP_FRONTEND=0
SKIP_VOLCENGINE=0
SKIP_BACKEND=0
SKIP_TESTS=0
SKIP_DUAL=0
SKIP_RESOURCE_E2E=0
SKIP_DIGITAL_WORKER=0
RESOURCE_E2E_MODE="smoke"
QUALITY_GATE_MODE="${QUALITY_GATE_MODE:-local}"

run_and_tail() {
  local lines="$1"
  shift
  set +e
  "$@" 2>&1 | tail -n "$lines"
  local cmd_status=${PIPESTATUS[0]}
  set -e
  return "$cmd_status"
}

digital_worker_eval_ready() {
  [ -n "${AI_LIVE_BASE_URL:-}" ] \
    && [ -n "${AI_LIVE_AUTH_TOKEN:-}" ] \
    && { [ -n "${KIMI_API_KEY:-}" ] || [ -n "${ARK_API_KEY:-}" ]; }
}

for arg in "$@"; do
  case "$arg" in
    --skip-feishu) SKIP_FEISHU=1 ;;
    --skip-frontend) SKIP_FRONTEND=1 ;;
    --skip-volcengine) SKIP_VOLCENGINE=1 ;;
    --skip-backend) SKIP_BACKEND=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --skip-dual) SKIP_DUAL=1 ;;
    --skip-resource-e2e) SKIP_RESOURCE_E2E=1 ;;
    --skip-digital-worker) SKIP_DIGITAL_WORKER=1 ;;
    --resource-e2e-full) RESOURCE_E2E_MODE="full" ;;
    --mode=*)
      QUALITY_GATE_MODE="${arg#*=}"
      ;;
  esac
done

TOTAL=28
STEP=0
PASS=0
FAIL=0

# 从 workstations.yaml 动态读取工作台列表（唯一真相源）
WORKSTATIONS=$(python3 -c "
import yaml
with open('config/workstations.yaml') as f:
    data = yaml.safe_load(f)
for ws in data['workstations']:
    print(ws['key'])
")

echo "=== CN_KIS V1.0 质量门禁 ($TOTAL 项) ==="
echo ""

# 0. 工作台配置完整性检查
STEP=$((STEP + 1))
echo "[$STEP/$TOTAL] 工作台配置完整性检查..."
if python3 scripts/workstation_health_check.py; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "  ⚠ 工作台配置不完整，请运行 python3 scripts/workstation_health_check.py 查看详情"
fi

# 1. 火山云配置
STEP=$((STEP + 1))
if [ "$SKIP_VOLCENGINE" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 火山云配置校验..."
  if python3 scripts/validate_volcengine_config.py; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 火山云配置校验失败"
  fi
else
  echo "[$STEP/$TOTAL] 火山云配置 (已跳过)"
fi

# 2. 飞书 API
STEP=$((STEP + 1))
if [ "$SKIP_FEISHU" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 飞书 API 测试..."
  if python3 scripts/test_feishu_api_integration.py; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 飞书 API 测试失败"
  fi
else
  echo "[$STEP/$TOTAL] 飞书 API (已跳过)"
fi

# 3. 后端检查（Django check + migration 一致性）
STEP=$((STEP + 1))
if [ "$SKIP_BACKEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 后端系统检查..."
  cd "$ROOT/backend"
  DEPLOY_CHECK_OUTPUT=$(env USE_SQLITE=true DJANGO_SETTINGS_MODULE=settings python3 manage.py check --deploy 2>&1 || true)
  echo "$DEPLOY_CHECK_OUTPUT" | tail -n 12
  if echo "$DEPLOY_CHECK_OUTPUT" | grep -qE "security\\.W[0-9]+"; then
    if [ "$QUALITY_GATE_MODE" = "local" ]; then
      PASS=$((PASS + 1))
      echo "  ⚠ Django deploy 安全告警存在（local 模式仅告警，不阻断）"
    else
      FAIL=$((FAIL + 1))
      echo "  ⚠ Django deploy 安全告警存在（阻断）"
    fi
  elif echo "$DEPLOY_CHECK_OUTPUT" | grep -qE "System check identified [1-9]"; then
    FAIL=$((FAIL + 1))
    echo "  ⚠ Django check 存在未解决问题（阻断）"
  else
    PASS=$((PASS + 1))
  fi

  echo "  应用并检查迁移一致性..."
  if ! env USE_SQLITE=true DJANGO_SETTINGS_MODULE=settings python3 manage.py migrate --noinput > /dev/null 2>&1; then
    FAIL=$((FAIL + 1))
    echo "  ⚠ 迁移执行失败（阻断）"
  else
    PENDING=$(env USE_SQLITE=true DJANGO_SETTINGS_MODULE=settings python3 manage.py showmigrations --plan 2>/dev/null | grep "\\[ \\]" | wc -l | tr -d ' ')
    if [ "$PENDING" -gt 0 ]; then
      FAIL=$((FAIL + 1))
      echo "  ⚠ 有 $PENDING 个待执行迁移（阻断）"
    else
      echo "  ✓ 迁移全部已应用"
    fi
  fi
  cd "$ROOT"
else
  echo "[$STEP/$TOTAL] 后端检查 (已跳过)"
fi

# 4. 前端 Packages 构建
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 前端共享包构建..."
  which pnpm > /dev/null 2>&1 || npm install -g pnpm

  PKGS_OK=true
  for pkg in ui-kit api-client feishu-sdk; do
    echo "  构建 @cn-kis/$pkg..."
    if ! run_and_tail 2 pnpm --filter "@cn-kis/$pkg" build; then
      echo "  ⚠ @cn-kis/$pkg 构建失败"
      PKGS_OK=false
    fi
  done
  if [ "$PKGS_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] 前端共享包 (已跳过)"
fi

# 5. 前端工作台应用构建（含 execution）
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 前端工作台构建..."

  APPS_OK=true
  for app in $WORKSTATIONS; do
    echo "  构建 @cn-kis/$app..."
    if ! run_and_tail 2 pnpm --filter "@cn-kis/$app" build; then
      echo "  ⚠ @cn-kis/$app 构建失败"
      APPS_OK=false
    fi
  done
  if [ "$APPS_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] 前端工作台 (已跳过)"
fi

# 6. 前端类型检查（含 execution）
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 前端类型检查..."

  TS_OK=true
  for app in $WORKSTATIONS; do
    if [ -f "apps/$app/tsconfig.json" ]; then
      echo "  类型检查 @cn-kis/$app..."
      if ! run_and_tail 3 bash -lc "cd \"apps/$app\" && npx tsc --noEmit"; then
        echo "  ⚠ @cn-kis/$app 类型检查失败"
        TS_OK=false
      fi
    fi
  done
  if [ "$TS_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] 前端类型检查 (已跳过)"
fi

# 7. 飞书统一客户端测试
STEP=$((STEP + 1))
if [ "$SKIP_FEISHU" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 飞书统一客户端 (FeishuClient) 测试..."
  cd "$ROOT"
  if USE_SQLITE=true python3 scripts/test_feishu_client.py; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ FeishuClient 测试失败"
  fi
else
  echo "[$STEP/$TOTAL] 飞书统一客户端 (已跳过)"
fi

# 8. 飞书原生能力集成检查（静态分析）
STEP=$((STEP + 1))
if [ "$SKIP_BACKEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 飞书原生能力集成检查..."
  cd "$ROOT"
  INTEGRATION_OK=true

  if grep -q "open.feishu.cn" backend/libs/feishu_client.py 2>/dev/null; then
    echo "  ✓ FeishuClient 包含飞书 API URL"
  else
    echo "  ⚠ FeishuClient 缺少飞书 API URL"
    INTEGRATION_OK=false
  fi

  FEISHU_SERVICES=0
  for svc in workorder quality finance visit hr crm protocol subject feishu_sync; do
    if grep -qE "feishu_client|feishu_approval|notification|anycross" "backend/apps/$svc/services.py" 2>/dev/null; then
      FEISHU_SERVICES=$((FEISHU_SERVICES + 1))
    fi
  done
  echo "  ✓ $FEISHU_SERVICES/9 个业务模块 services.py 包含飞书集成调用"
  if [ "$FEISHU_SERVICES" -lt 5 ]; then
    echo "  ⚠ 飞书集成覆盖率不足（至少 5 个模块）"
    INTEGRATION_OK=false
  fi

  FIELD_WRITES=0
  if grep -q "feishu_approval_instance_id" backend/apps/workorder/services.py 2>/dev/null; then
    FIELD_WRITES=$((FIELD_WRITES + 1))
  fi
  if grep -q "feishu_approval_instance_id" backend/apps/quality/services.py 2>/dev/null; then
    FIELD_WRITES=$((FIELD_WRITES + 1))
  fi
  if grep -q "feishu_approval_id" backend/apps/finance/services.py 2>/dev/null; then
    FIELD_WRITES=$((FIELD_WRITES + 1))
  fi
  if grep -q "feishu_event_id" backend/apps/visit/services.py 2>/dev/null; then
    FIELD_WRITES=$((FIELD_WRITES + 1))
  fi
  if grep -q "feishu_calendar_id" backend/apps/hr/services.py 2>/dev/null; then
    FIELD_WRITES=$((FIELD_WRITES + 1))
  fi
  echo "  ✓ $FIELD_WRITES/5 个飞书预留字段在 services.py 中被写入"
  if [ "$FIELD_WRITES" -lt 3 ]; then
    echo "  ⚠ 飞书预留字段写入不足"
    INTEGRATION_OK=false
  fi

  if grep -q "approval-callback" backend/apps/feishu_sync/api.py 2>/dev/null; then
    echo "  ✓ 审批回调端点存在"
  else
    echo "  ⚠ 缺少审批回调端点"
    INTEGRATION_OK=false
  fi
  if grep -q "anycross-callback" backend/apps/feishu_sync/api.py 2>/dev/null; then
    echo "  ✓ AnyCross 回调端点存在"
  else
    echo "  ⚠ 缺少 AnyCross 回调端点"
    INTEGRATION_OK=false
  fi

  if [ "$INTEGRATION_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] 飞书原生能力集成检查 (已跳过)"
fi

# 9. 飞书集成测试脚本批量运行
STEP=$((STEP + 1))
if [ "$SKIP_FEISHU" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 飞书集成测试脚本..."
  cd "$ROOT"
  TESTS_OK=true
  for test_script in test_feishu_bot_message test_feishu_approval test_feishu_calendar test_feishu_project; do
    if [ -f "scripts/${test_script}.py" ]; then
      echo "  运行 ${test_script}..."
      if run_and_tail 3 env USE_SQLITE=true python3 "scripts/${test_script}.py"; then
        :
      else
        echo "  ⚠ ${test_script} 失败"
        TESTS_OK=false
      fi
    else
      echo "  ⚠ 缺少测试脚本: ${test_script}.py"
      TESTS_OK=false
    fi
  done
  if [ "$TESTS_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] 飞书集成测试脚本 (已跳过)"
fi

# ============================================================================
# 新增检查项 (10-14)
# ============================================================================

# 10. 后端单元测试 (pytest)
STEP=$((STEP + 1))
if [ "$SKIP_TESTS" -eq 0 ] && [ "$SKIP_BACKEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 后端单元测试 (pytest)..."
  cd "$ROOT/backend"
  if run_and_tail 10 env USE_SQLITE=true DJANGO_SECURE_SSL_REDIRECT=false python3 -m pytest tests/ --tb=short -q; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 后端单元测试失败"
  fi
  cd "$ROOT"
else
  echo "[$STEP/$TOTAL] 后端单元测试 (已跳过)"
fi

# 10.5 设备-设施-质量后端E2E回归（smoke）
STEP=$((STEP + 1))
if [ "$SKIP_RESOURCE_E2E" -eq 0 ] && [ "$SKIP_BACKEND" -eq 0 ] && [ "$SKIP_TESTS" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 设备-设施-质量后端E2E回归（${RESOURCE_E2E_MODE}）..."
  cd "$ROOT"
  if [ "$RESOURCE_E2E_MODE" = "full" ]; then
    RESOURCE_E2E_CMD=(bash scripts/run_resource_quality_e2e.sh --full)
  else
    RESOURCE_E2E_CMD=(bash scripts/run_resource_quality_e2e.sh)
  fi
  if run_and_tail 20 "${RESOURCE_E2E_CMD[@]}"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 设备-设施-质量后端E2E回归失败"
  fi
else
  echo "[$STEP/$TOTAL] 设备-设施-质量后端E2E回归 (已跳过)"
fi

# 11. 前端 execution 应用构建检查（单独检查）
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] Execution 应用独立构建检查..."
  if run_and_tail 5 pnpm --filter "@cn-kis/execution" build; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ execution 应用构建失败"
  fi
else
  echo "[$STEP/$TOTAL] Execution 应用构建检查 (已跳过)"
fi

# 12. 前端 execution 类型检查
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] Execution 应用类型检查..."
  if [ -f "apps/execution/tsconfig.json" ]; then
    if run_and_tail 5 bash -lc "cd apps/execution && npx tsc --noEmit"; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
      echo "  ⚠ execution 类型检查失败"
    fi
  else
    echo "  ⚠ 缺少 apps/execution/tsconfig.json"
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] Execution 类型检查 (已跳过)"
fi

# 13. 前端组件测试 (vitest)
STEP=$((STEP + 1))
if [ "$SKIP_TESTS" -eq 0 ] && [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 前端组件测试 (vitest)..."
  VITEST_OK=true
  for vitest_app in execution evaluator research recruitment; do
    if [ -f "apps/$vitest_app/package.json" ] && grep -q '"test"' "apps/$vitest_app/package.json" 2>/dev/null; then
      echo "  运行 @cn-kis/$vitest_app vitest..."
      if ! run_and_tail 10 pnpm --filter "@cn-kis/$vitest_app" test; then
        echo "  ⚠ @cn-kis/$vitest_app 前端组件测试失败"
        VITEST_OK=false
      fi
    else
      echo "  ⚠ @cn-kis/$vitest_app 缺少 test 脚本，跳过"
    fi
  done
  if [ "$VITEST_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 前端组件测试失败"
  fi
else
  echo "[$STEP/$TOTAL] 前端组件测试 (已跳过)"
fi

# 14. API Schema 一致性检查
STEP=$((STEP + 1))
if [ "$SKIP_BACKEND" -eq 0 ] && [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] API Schema 一致性检查..."
  SCHEMA_OK=true

  # 检查前端 api-client 中是否有对应后端所有主要模块的 API 模块
  for module in workorder edc subject protocol resource quality audit identity visit scheduling workflow recruitment execution questionnaire loyalty; do
    if [ -f "packages/api-client/src/modules/${module}.ts" ]; then
      echo "  ✓ ${module}.ts 存在"
    else
      echo "  ⚠ 缺少 ${module}.ts API 模块"
      SCHEMA_OK=false
    fi
  done

  if [ "$SCHEMA_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] API Schema 一致性检查 (已跳过)"
fi

# 15. 角色化仪表盘渲染检查
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 角色化仪表盘渲染检查..."
  ROLE_RENDER_OK=true

  for dashboard in CRCSupervisorDashboard CRCDashboard SchedulerDashboard; do
    if [ -f "apps/execution/src/pages/dashboards/${dashboard}.tsx" ]; then
      echo "  ✓ ${dashboard}.tsx 存在"
    else
      echo "  ✗ 缺少 ${dashboard}.tsx"
      ROLE_RENDER_OK=false
    fi
  done

  # 检查 DashboardPage 包含角色路由逻辑
  if grep -q "hasRole\|hasAnyRole" apps/execution/src/pages/DashboardPage.tsx 2>/dev/null; then
    echo "  ✓ DashboardPage 包含角色路由逻辑"
  else
    echo "  ⚠ DashboardPage 缺少角色路由逻辑"
    ROLE_RENDER_OK=false
  fi

  if [ "$ROLE_RENDER_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] 角色化仪表盘渲染检查 (已跳过)"
fi

# 16. 核心业务链路检查
STEP=$((STEP + 1))
if [ "$SKIP_BACKEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 核心业务链路检查..."
  CORE_LINK_OK=true

  # 检查执行上下文模型
  if [ -f "backend/apps/workorder/models_context.py" ]; then
    echo "  ✓ models_context.py 存在"
  else
    echo "  ✗ 缺少 models_context.py"
    CORE_LINK_OK=false
  fi

  # 检查 CRC dashboard service
  if [ -f "backend/apps/workorder/services/crc_dashboard_service.py" ]; then
    echo "  ✓ crc_dashboard_service.py 存在"
  else
    echo "  ✗ 缺少 crc_dashboard_service.py"
    CORE_LINK_OK=false
  fi

  # 检查进展通报服务
  if [ -f "backend/apps/workorder/services/progress_report_service.py" ]; then
    echo "  ✓ progress_report_service.py 存在"
  else
    echo "  ✗ 缺少 progress_report_service.py"
    CORE_LINK_OK=false
  fi

  # 检查 API 端点包含核心路由
  for endpoint in crc-dashboard project-context progress-report analytics/kpi; do
    if grep -q "${endpoint}" backend/apps/workorder/api.py 2>/dev/null; then
      echo "  ✓ API 包含 ${endpoint}"
    else
      echo "  ⚠ API 缺少 ${endpoint}"
      CORE_LINK_OK=false
    fi
  done

  if [ "$CORE_LINK_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] 核心业务链路检查 (已跳过)"
fi

# 17. 飞书集成完整性检查
STEP=$((STEP + 1))
if [ "$SKIP_FEISHU" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 飞书集成完整性检查..."
  FEISHU_INT_OK=true

  # 检查飞书消息卡片模板在 progress_report_service 中定义
  if grep -q "msg_type\|card\|飞书" backend/apps/workorder/services/progress_report_service.py 2>/dev/null; then
    echo "  ✓ 进展通报包含飞书消息模板"
  else
    echo "  ⚠ 进展通报缺少飞书消息模板"
    FEISHU_INT_OK=false
  fi

  # 检查前端飞书上下文使用
  if grep -q "useFeishuContext" apps/execution/src/pages/DashboardPage.tsx 2>/dev/null; then
    echo "  ✓ 仪表盘使用飞书上下文"
  else
    echo "  ⚠ 仪表盘未使用飞书上下文"
    FEISHU_INT_OK=false
  fi

  # 检查飞书 SDK 包存在
  if [ -d "packages/feishu-sdk" ]; then
    echo "  ✓ feishu-sdk 包存在"
  else
    echo "  ⚠ 缺少 feishu-sdk 包"
    FEISHU_INT_OK=false
  fi

  if [ "$FEISHU_INT_OK" = true ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "[$STEP/$TOTAL] 飞书集成完整性检查 (已跳过)"
fi

# 18. 占位词/未接线入口阻断检查（扩展盲区）
STEP=$((STEP + 1))
echo "[$STEP/$TOTAL] 占位词与未接线入口检查..."
PLACEHOLDER_PATTERN="功能开发中|详情页开发中|待接入上传组件|TODO:\\s*wire\\s+to|TODO:\\s*implement|NotImplementedError"
PLACEHOLDER_HITS=$(rg -n \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/coverage/**' \
  --glob '!**/e2e/**' \
  --glob '!**/*.{spec,test}.{ts,tsx,js,jsx}' \
  --glob '!**/*.md' \
  "$PLACEHOLDER_PATTERN" \
  apps packages backend 2>/dev/null || true)

ALLOWLIST_FILE="scripts/quality_gate_placeholder_allowlist.txt"
if [ -n "$PLACEHOLDER_HITS" ] && [ -f "$ALLOWLIST_FILE" ]; then
  FILTERED_HITS=$(echo "$PLACEHOLDER_HITS" | rg -v -f "$ALLOWLIST_FILE" || true)
else
  FILTERED_HITS="$PLACEHOLDER_HITS"
fi
if [ -n "$FILTERED_HITS" ]; then
  FAIL=$((FAIL + 1))
  echo "  ⚠ 发现占位词或未接线入口（阻断）"
  echo "$FILTERED_HITS" | tail -n 20
else
  PASS=$((PASS + 1))
  echo "  ✓ 未发现占位词或未接线入口"
fi

# 18b. 防走样·交付路径占位符扫描（小程序+受试者后端）
STEP=$((STEP + 1))
echo "[$STEP/$TOTAL] 防走样·交付路径占位符扫描..."
if BASE_DIR="$ROOT" bash "$ROOT/scripts/placeholder_scan_delivery.sh" 2>/dev/null; then
  PASS=$((PASS + 1))
  echo "  ✓ 交付路径无禁用词"
else
  FAIL=$((FAIL + 1))
  echo "  ⚠ 交付路径存在 TODO/待实现/mock-only/占位，见 scripts/placeholder_scan_delivery.sh"
fi

# 19. AUTH 统一契约静态检查
STEP=$((STEP + 1))
echo "[$STEP/$TOTAL] AUTH 统一契约检查..."
AUTH_OK=true
if grep -q "generateState" "packages/feishu-sdk/src/auth.ts" \
  && grep -q "session_meta" "packages/feishu-sdk/src/auth.ts" \
  && grep -q "state:" "packages/feishu-sdk/src/auth.ts"; then
  echo "  ✓ feishu-sdk 包含 state/session_meta 统一协议"
else
  echo "  ⚠ feishu-sdk 缺少统一认证字段处理"
  AUTH_OK=false
fi
if grep -q "state: Optional\\[str\\]" "backend/apps/identity/api.py" \
  && grep -q "session_meta" "backend/apps/identity/api.py" \
  && grep -q "error_code" "backend/apps/identity/api.py"; then
  echo "  ✓ 后端认证回调包含 state/error_code/session_meta"
else
  echo "  ⚠ 后端认证回调缺少统一错误/会话字段"
  AUTH_OK=false
fi
if [ "$AUTH_OK" = true ]; then
  if [ "$SKIP_TESTS" -eq 0 ] && [ "$SKIP_BACKEND" -eq 0 ]; then
    echo "  运行 AUTH 关键回归测试..."
    if run_and_tail 20 env USE_SQLITE=true DJANGO_SETTINGS_MODULE=settings DJANGO_SECURE_SSL_REDIRECT=false \
      python3 -m pytest \
      backend/tests/unit/test_identity_auth_state.py \
      backend/tests/unit/test_identity_oauth_exchange.py \
      backend/tests/unit/test_identity_feishu_callback_contract.py -q; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
      echo "  ⚠ AUTH 关键回归测试失败（阻断）"
    fi
  else
    PASS=$((PASS + 1))
  fi
else
  FAIL=$((FAIL + 1))
fi

# 20. 飞书调用统一入口检查（除 feishu_client 外禁止直连 URL）
STEP=$((STEP + 1))
echo "[$STEP/$TOTAL] 飞书调用统一入口检查..."
DIRECT_HITS=$(grep -R -n "open.feishu.cn/open-apis" backend/apps backend/libs \
  --exclude-dir="tests" \
  --exclude-dir="__pycache__" \
  --exclude="feishu_client.py" 2>/dev/null || true)
FEISHU_URL_ALLOWLIST="scripts/quality_gate_feishu_url_allowlist.txt"
if [ -n "$DIRECT_HITS" ] && [ -f "$FEISHU_URL_ALLOWLIST" ]; then
  DIRECT_HITS=$(echo "$DIRECT_HITS" | grep -Evf "$FEISHU_URL_ALLOWLIST" || true)
fi
if [ -n "$DIRECT_HITS" ]; then
  FAIL=$((FAIL + 1))
  echo "  ⚠ 发现业务层直连飞书 URL（阻断）"
  echo "$DIRECT_HITS" | tail -n 20
else
  PASS=$((PASS + 1))
  echo "  ✓ 未发现业务层直连飞书 URL"
fi

# 21. 移动化完成度检查（布局 + 用例）
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 移动化完成度检查..."
  if python3 scripts/mobile_completion_gate.py; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 移动化完成度检查失败"
  fi
else
  echo "[$STEP/$TOTAL] 移动化完成度检查 (已跳过)"
fi

# 22. 飞书容器一致性检查
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 飞书容器一致性检查..."
  if python3 scripts/feishu_container_gate.py; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 飞书容器一致性检查失败"
  fi
else
  echo "[$STEP/$TOTAL] 飞书容器一致性检查 (已跳过)"
fi

# 23. 禁止 utest.cc 硬编码门禁（防回退）
STEP=$((STEP + 1))
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 禁止 utest.cc 硬编码门禁..."
  if node scripts/check_feishu_api_fallback_gate.mjs; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 源代码中发现 utest.cc 硬编码（阻断）"
  fi
else
  echo "[$STEP/$TOTAL] 禁止 utest.cc 硬编码门禁 (已跳过)"
fi

# 24. 全工作台双回归（桌面 + 移动）
STEP=$((STEP + 1))
if [ "$SKIP_DUAL" -eq 0 ] && [ "$SKIP_FRONTEND" -eq 0 ] && [ "$SKIP_TESTS" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 全工作台双回归（并行波次）..."
  if run_and_tail 20 pnpm e2e:dual:all-workstations:parallel; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ⚠ 全工作台双回归失败"
  fi
else
  echo "[$STEP/$TOTAL] 全工作台双回归 (已跳过)"
fi

# 25. 数字员工真实能力发布门禁
STEP=$((STEP + 1))
if [ "$SKIP_DIGITAL_WORKER" -eq 0 ] && [ "$SKIP_BACKEND" -eq 0 ] && [ "$SKIP_TESTS" -eq 0 ]; then
  echo "[$STEP/$TOTAL] 数字员工真实能力发布门禁..."
  if digital_worker_eval_ready; then
    DIGITAL_WORKER_RUN_ID="${DIGITAL_WORKER_REAL_EVAL_RUN_ID:-quality-gate-$(date +%Y%m%dT%H%M%S)}"
    if run_and_tail 40 python3 scripts/run_digital_worker_real_eval.py \
      --batch all \
      --run-id "$DIGITAL_WORKER_RUN_ID" \
      --require-decision 可试点; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
      echo "  ⚠ 数字员工真实能力发布门禁失败"
    fi
  else
    echo "  ⚠ 缺少数字员工真实验收所需环境变量：AI_LIVE_BASE_URL / AI_LIVE_AUTH_TOKEN / (KIMI_API_KEY or ARK_API_KEY)"
    if [ "$QUALITY_GATE_MODE" = "production" ]; then
      FAIL=$((FAIL + 1))
      echo "  ⚠ production 模式下不允许跳过数字员工真实能力门禁"
    else
      echo "  ⚠ 当前为 $QUALITY_GATE_MODE 模式，仅提示不阻断；如需跳过可显式传 --skip-digital-worker"
    fi
  fi
else
  echo "[$STEP/$TOTAL] 数字员工真实能力发布门禁 (已跳过)"
fi

echo ""
echo "========================================"
if [ "$FAIL" -gt 0 ]; then
  echo "  质量门禁：$FAIL 项未通过 ❌"
  echo "========================================"
  exit 1
else
  echo "  质量门禁通过 ✓ ($PASS/$TOTAL 已检查)"
  echo "========================================"
fi
