#!/usr/bin/env bash
set -euo pipefail

PARALLEL_MODE=0
if [[ "${1:-}" == "--parallel" ]]; then
  PARALLEL_MODE=1
fi

WORKSTATIONS=(
  secretary finance research execution quality hr crm
  recruitment equipment material facility evaluator
  lab-personnel ethics reception
)

if [[ "$PARALLEL_MODE" -eq 0 ]]; then
  bash scripts/mobile_dual_regression.sh "${WORKSTATIONS[@]}"
  exit 0
fi

echo "并行模式：按波次执行全工作台双回归"

WAVE_P0=(evaluator reception execution)
WAVE_P1=(recruitment material equipment)
WAVE_P2=(secretary finance quality hr crm ethics research lab-personnel facility)

run_wave() {
  local wave_name="$1"
  shift
  echo "=== 启动 ${wave_name} ==="
  bash scripts/mobile_dual_regression.sh "$@"
  echo "=== 完成 ${wave_name} ==="
}

set +e
run_wave "WAVE_P0" "${WAVE_P0[@]}" &
PID_P0=$!
run_wave "WAVE_P1" "${WAVE_P1[@]}" &
PID_P1=$!
run_wave "WAVE_P2" "${WAVE_P2[@]}" &
PID_P2=$!

wait "$PID_P0"; S0=$?
wait "$PID_P1"; S1=$?
wait "$PID_P2"; S2=$?
set -e

if [[ "$S0" -ne 0 || "$S1" -ne 0 || "$S2" -ne 0 ]]; then
  echo "并行双回归失败：P0=$S0 P1=$S1 P2=$S2"
  exit 1
fi

echo "并行双回归执行完成"
