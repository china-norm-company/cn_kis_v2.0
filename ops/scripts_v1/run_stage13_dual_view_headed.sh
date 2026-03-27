#!/bin/bash
# Stage13 双视角 Headed 统一编排
# 用法:
#   ./scripts/run_stage13_dual_view_headed.sh
#   ./scripts/run_stage13_dual_view_headed.sh --report docs/your-report.md

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPORT_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report)
      REPORT_PATH="${2:-}"
      shift 2
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$REPORT_PATH" ]]; then
  TS="$(date '+%Y-%m-%d_%H-%M-%S')"
  REPORT_PATH="docs/STAGE13_DUAL_VIEW_HEADED_EVIDENCE_${TS}.md"
fi

mkdir -p "$ROOT/.tmp/stage13-headed"

START_HUMAN="$(date '+%Y-%m-%d %H:%M:%S')"
START_EPOCH="$(date +%s)"

echo "# Stage13 双视角 Headed 证据报告" > "$REPORT_PATH"
echo "" >> "$REPORT_PATH"
echo "- 执行时间：$START_HUMAN" >> "$REPORT_PATH"
echo "- 执行方式：跨台统一编排（受试者 + 研究者 + 招募/接待/执行/评估）" >> "$REPORT_PATH"
echo "- 执行脚本：\`scripts/run_stage13_dual_view_headed.sh\`" >> "$REPORT_PATH"
echo "" >> "$REPORT_PATH"
echo "## 套件执行结果" >> "$REPORT_PATH"
echo "" >> "$REPORT_PATH"
echo "| 套件 | 阶段映射 | 结果 | 通过数 | 失败数 | 耗时(s) |" >> "$REPORT_PATH"
echo "|---|---|---|---:|---:|---:|" >> "$REPORT_PATH"

SUM_PASSED=0
SUM_FAILED=0

run_suite() {
  local suite_name="$1"
  local stage_map="$2"
  local command="$3"
  local log_file="$4"

  local t0
  local t1
  local duration
  local status_text
  local passed_count
  local failed_count

  echo ""
  echo ">>> [RUN] ${suite_name}"
  echo "    stages: ${stage_map}"
  echo "    cmd: ${command}"

  t0="$(date +%s)"
  set +e
  bash -lc "$command" > "$log_file" 2>&1
  local exit_code=$?
  set -e
  t1="$(date +%s)"
  duration=$((t1 - t0))

  passed_count="$( (grep -Eo '[0-9]+ passed' "$log_file" || true) | awk '{v=$1} END{if(v=="") v=0; print v}')"
  failed_count="$( (grep -Eo '[0-9]+ failed' "$log_file" || true) | awk '{v=$1} END{if(v=="") v=0; print v}')"

  if [[ "$exit_code" -eq 0 ]]; then
    status_text="PASS"
  else
    status_text="FAIL"
  fi

  echo "| ${suite_name} | ${stage_map} | ${status_text} | ${passed_count} | ${failed_count} | ${duration} |" >> "$REPORT_PATH"

  echo "" >> "$REPORT_PATH"
  echo "### ${suite_name}" >> "$REPORT_PATH"
  echo "" >> "$REPORT_PATH"
  echo "- 阶段映射：${stage_map}" >> "$REPORT_PATH"
  echo "- 执行命令：\`${command}\`" >> "$REPORT_PATH"
  echo "- 结果：${status_text}（通过 ${passed_count} / 失败 ${failed_count} / 耗时 ${duration}s）" >> "$REPORT_PATH"
  echo "- 日志：\`${log_file#$ROOT/}\`" >> "$REPORT_PATH"
  echo "" >> "$REPORT_PATH"

  SUM_PASSED=$((SUM_PASSED + passed_count))
  SUM_FAILED=$((SUM_FAILED + failed_count))

  if [[ "$exit_code" -ne 0 ]]; then
    echo "!!! 套件失败: ${suite_name}"
    return "$exit_code"
  fi
}

run_suite \
  "受试者端全生命周期（wechat-mini）" \
  "S02-S13（受试者主链）" \
  "pnpm --filter \"@cn-kis/wechat-mini\" e2e:headed -- e2e/headed/lifecycle-mobile-panorama.spec.ts" \
  "$ROOT/.tmp/stage13-headed/wechat-mini.log"

run_suite \
  "研究者协同（research）" \
  "S02/S08/S10/S11（任务分发、协同、变更）" \
  "pnpm --filter \"@cn-kis/research\" test:e2e:headed -- e2e/05-task-delegation.spec.ts e2e/06-full-day-workflow.spec.ts" \
  "$ROOT/.tmp/stage13-headed/research.log"

run_suite \
  "招募台（recruitment）" \
  "S04-S07（招募、联系、初筛、入组衔接）" \
  "pnpm --filter \"@cn-kis/recruitment\" test:e2e:headed -- e2e/03-registration-workflow.spec.ts e2e/05-pre-screening-workflow.spec.ts" \
  "$ROOT/.tmp/stage13-headed/recruitment.log"

run_suite \
  "接待台（reception）" \
  "S07-S08（预约到场、签到签出、前台分流）" \
  "pnpm --filter \"@cn-kis/reception\" e2e:headed -- e2e/06-reception-e2e-flow.spec.ts e2e/07-reception-feishu-auth.spec.ts" \
  "$ROOT/.tmp/stage13-headed/reception.log"

run_suite \
  "执行台（execution）" \
  "S08-S10（工单生命周期、执行闭环）" \
  "pnpm --filter \"@cn-kis/execution\" test:e2e:headed -- e2e/25-workorder-lifecycle.spec.ts" \
  "$ROOT/.tmp/stage13-headed/execution.log"

run_suite \
  "评估台（evaluator）" \
  "S09-S10（执行安全、权限与归属校验）" \
  "pnpm --filter \"@cn-kis/evaluator\" test:e2e:headed -- e2e/02-workorder-execution-flow.spec.ts e2e/05-security-validation.spec.ts" \
  "$ROOT/.tmp/stage13-headed/evaluator.log"

run_suite \
  "接待台看板与异常入口（reception）" \
  "S08-S10（分流、事件上报、工单联动）" \
  "pnpm --filter \"@cn-kis/reception\" e2e:headed -- e2e/05-reception-dashboard.spec.ts" \
  "$ROOT/.tmp/stage13-headed/reception-dashboard.log"

run_suite \
  "执行台异常处理（execution）" \
  "S10-S11（异常预警、冲突与韧性）" \
  "pnpm --filter \"@cn-kis/execution\" test:e2e:headed -- e2e/06-exception-handling.spec.ts" \
  "$ROOT/.tmp/stage13-headed/execution-exception.log"

run_suite \
  "研究台S13全覆盖回归（research）" \
  "S12-S13（结项管理、通知、全路由回归）" \
  "pnpm --filter \"@cn-kis/research\" test:e2e:headed -- e2e/13-full-coverage-regression.spec.ts e2e/11-business-operations.spec.ts" \
  "$ROOT/.tmp/stage13-headed/research-s13.log"

run_suite \
  "招募台筛选与辅助链路（recruitment）" \
  "S05-S07/S12（筛选、依从、礼金、问卷、客服）" \
  "pnpm --filter \"@cn-kis/recruitment\" test:e2e:headed -- e2e/04-screening-and-auxiliary.spec.ts" \
  "$ROOT/.tmp/stage13-headed/recruitment-aux.log"

run_suite \
  "后端跨台一致性脚本（reception-sync）" \
  "跨台一致性（状态回写、数据一致、飞书触达）" \
  "cd backend && python3 manage.py shell < scripts/verify_reception_feishu_delivery.py && python3 manage.py shell < scripts/verify_reception_cross_workstation_sync.py && python3 manage.py shell < scripts/verify_reception_data_consistency.py" \
  "$ROOT/.tmp/stage13-headed/backend-cross-sync.log"

run_suite \
  "后端流程驱动仿真贯通（subject-chain）" \
  "S04/S10/S12/S13 + eCRF（非mock真实造数）" \
  "cd backend && USE_SQLITE=true DJANGO_SETTINGS_MODULE=settings python3 scripts/simulate_subject_full_lifecycle_and_verify.py" \
  "$ROOT/.tmp/stage13-headed/backend-sim-chain.log"

END_EPOCH="$(date +%s)"
TOTAL_SEC=$((END_EPOCH - START_EPOCH))
END_HUMAN="$(date '+%Y-%m-%d %H:%M:%S')"

echo "" >> "$REPORT_PATH"
echo "## 总结" >> "$REPORT_PATH"
echo "" >> "$REPORT_PATH"
echo "- 结束时间：$END_HUMAN" >> "$REPORT_PATH"
echo "- 总耗时：${TOTAL_SEC}s" >> "$REPORT_PATH"
echo "- 跨台通过总数：${SUM_PASSED}" >> "$REPORT_PATH"
echo "- 跨台失败总数：${SUM_FAILED}" >> "$REPORT_PATH"
echo "- 说明：此报告用于将 \`docs/STAGE13_DUAL_VIEW_E2E_MATRIX.md\` 的阶段证据从模块级推进到可执行链路级。" >> "$REPORT_PATH"

echo ""
echo "========================================"
echo "Stage13 双视角 Headed 编排完成"
echo "证据报告: $REPORT_PATH"
echo "日志目录: .tmp/stage13-headed/"
echo "========================================"
