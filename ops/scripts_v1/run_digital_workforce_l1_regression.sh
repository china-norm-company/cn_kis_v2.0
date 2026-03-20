#!/usr/bin/env bash
# 数字员工 L1 稳定回归：执行 RUNBOOK「每轮必跑」全部命令，任一失败即退出。
# 用法：bash scripts/run_digital_workforce_l1_regression.sh
# 参考：docs/DIGITAL_WORKFORCE_ACCEPTANCE_RUNBOOK.md

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== 数字员工 L1 稳定回归（每轮必跑）==="

echo "[1/5] 前端单测（digital-workforce）"
pnpm --filter @cn-kis/digital-workforce test -- --run

echo "[2/5] 前端 E2E（digital-workforce）"
pnpm exec playwright test apps/digital-workforce/e2e/10-portal-acceptance.spec.ts apps/digital-workforce/e2e/20-main-flow-acceptance.spec.ts apps/digital-workforce/e2e/30-ops-pages-acceptance.spec.ts apps/digital-workforce/e2e/40-policy-approval-flow.spec.ts apps/digital-workforce/e2e/50-knowledge-quality-dashboard.spec.ts apps/digital-workforce/e2e/60-l2-eval-verdict.spec.ts --config=apps/digital-workforce/playwright.config.ts --reporter=line

echo "[3/5] 四工作台深度触点 E2E"
pnpm exec playwright test 12-digital-workforce-touchpoint --config=apps/research/playwright.config.ts --reporter=line
pnpm exec playwright test 07-digital-workforce-touchpoint --config=apps/quality/playwright.config.ts --reporter=line
pnpm exec playwright test 22-digital-workforce-touchpoint --config=apps/execution/playwright.config.ts --reporter=line
pnpm exec playwright test 07-digital-workforce-touchpoint --config=apps/finance/playwright.config.ts --reporter=line

echo "[4/5] 后端集成（数字员工 API、门禁、日报闭环二、启动包、交付流、禁止越界）"
cd backend && python -m pytest \
  tests/integration/test_digital_workforce_api.py \
  tests/integration/test_evidence_gate_business.py \
  tests/integration/test_digital_worker_gate_api.py \
  tests/integration/test_dashboard_daily_brief_closure_two.py \
  tests/integration/test_digital_worker_forbidden_without_confirmation.py \
  tests/integration/test_startup_package.py \
  tests/unit/test_digital_worker_delivery_flows.py \
  tests/integration/test_digital_worker_l3_security.py \
  tests/integration/test_l2_business_acceptance.py \
  -v --tb=short
cd "$ROOT"

echo "[5/5] L1 全绿"
echo "=== 数字员工 L1 稳定回归通过 ==="

# ──────────────────────────────────────────────────────────────
# [可选] Headed LLM 打分验收 — 需要 AI API 可用 + DIGITAL_WORKER_REAL_EVAL_ENABLED=1
# 用法：RUN_HEADED_EVAL=1 DIGITAL_WORKER_REAL_EVAL_ENABLED=1 bash scripts/run_digital_workforce_l1_regression.sh
# ──────────────────────────────────────────────────────────────
if [ "${RUN_HEADED_EVAL:-0}" = "1" ]; then
  echo ""
  echo "=== [可选] Headed 真实 Agent 验收（LLM Judge 打分）==="
  echo "注意：此阶段调用真实 AI API，需要 ARK_API_KEY 或 KIMI_API_KEY 已配置"
  echo ""

  echo "[6/6a] 运行 production_readiness 批次 AI 验收（后端 pytest）"
  cd backend && python -m pytest \
    tests/ai_eval/test_digital_worker_production_readiness.py \
    -v --tb=short \
    -s   # -s 输出 print 中的 Judge 评分结果
  cd "$ROOT"

  echo "[6/6b] 运行 Headed E2E 验收（Playwright + LLM Judge 打分）"
  pnpm exec playwright test apps/digital-workforce/e2e/headed/ \
    --config=apps/digital-workforce/playwright.headed.config.ts \
    --reporter=html

  echo ""
  echo "=== Headed 验收结果 ==="
  echo "报告位置："
  echo "  后端验收报告：backend/logs/digital_worker_real_eval/"
  echo "  前端验收报告：apps/digital-workforce/playwright-report/headed/index.html"
  echo "  截图与录像：apps/digital-workforce/playwright-report/headed/"
  echo ""
  echo "生产可行性判断标准："
  echo "  已可生产：overall_score >= 90，无 critical_issues"
  echo "  试点可用：overall_score >= 80，无 critical_issues"
  echo "  需整改：overall_score >= 70 或有 minor_issues"
  echo "  不可用：overall_score < 70 或有 critical_issues"
fi
