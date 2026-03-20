#!/bin/bash
# 全面测试 - headed 方式
# 含义：逐项可见输出 + 前端启动 + 浏览器可见的 E2E（Playwright headed）
# 用法: ./scripts/run_full_tests_headed.sh
# 可选: ./scripts/run_full_tests_headed.sh --skip-frontend  仅后端
# 可选: ./scripts/run_full_tests_headed.sh --skip-browser  不跑浏览器 E2E（仍跑后端与前端单元）

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_FRONTEND=0
SKIP_BROWSER=0
for arg in "$@"; do
  case "$arg" in
    --skip-frontend) SKIP_FRONTEND=1 ;;
    --skip-browser)  SKIP_BROWSER=1 ;;
  esac
done

echo "=========================================="
echo "  CN_KIS 全面测试 (headed)"
echo "  含：后端/前端单元逐项输出 + 前端启动 + 浏览器 E2E"
echo "=========================================="
echo ""

# 1. 后端 Django 系统检查
echo ">>> [1/4] 后端 Django 系统检查"
cd "$ROOT/backend"
PYTHONPATH=. USE_SQLITE=true DJANGO_SETTINGS_MODULE=settings python3 manage.py check 2>&1
echo "  ✓ Django check 通过"
echo ""

# 2. 后端单元 + E2E（逐项显示 -v -s）
echo ">>> [2/4] 后端单元与 E2E（逐项显示）"
PYTHONPATH=. USE_SQLITE=true python3 -m pytest \
  tests/unit/test_contact_record.py \
  tests/unit/test_withdrawal.py \
  tests/unit/test_recruitment_state.py \
  tests/e2e/test_recruitment_workflow.py \
  tests/e2e/test_subject_execution.py \
  tests/e2e/test_subject_lifecycle.py \
  tests/e2e/test_subject_management_design.py \
  -v --tb=short -s -o addopts="" 2>&1
echo "  ✓ 后端相关测试完成"
echo ""

# 3. 前端招募工作台单元/组件测试（Vitest，非浏览器）
if [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo ">>> [3/4] 前端招募工作台 (Vitest 组件/单元)"
  pnpm --filter @cn-kis/recruitment test 2>&1
  echo "  ✓ 前端单元测试完成"
else
  echo ">>> [3/4] 前端测试 (已跳过 --skip-frontend)"
fi
echo ""

# 4. 浏览器 E2E（真正启动前端 + headed 模式打开浏览器）
if [ "$SKIP_BROWSER" -eq 0 ] && [ "$SKIP_FRONTEND" -eq 0 ]; then
  echo ">>> [4/4] 浏览器 E2E (headed：启动前端 + 可见浏览器)"
  "$ROOT/scripts/run_e2e_headed.sh"
else
  echo ">>> [4/4] 浏览器 E2E (已跳过 --skip-browser 或 --skip-frontend)"
fi

echo ""
echo "=========================================="
echo "  全面测试 (headed) 执行完毕"
echo "=========================================="
