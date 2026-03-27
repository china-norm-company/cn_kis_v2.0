#!/usr/bin/env bash
# 依次运行 .maestro 下所有 E2E 测试流程（headed，依赖已连接设备/模拟器）
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

for jdk in /opt/homebrew/opt/openjdk@17/bin /opt/homebrew/opt/openjdk/bin; do
  [[ -d "$jdk" ]] && { export PATH="$jdk:$PATH"; break; }
done
[[ -d "$HOME/.maestro/bin" ]] && export PATH="$PATH:$HOME/.maestro/bin"

RUNNER="$ROOT_DIR/scripts/run-maestro.sh"
FAILED=0
PASS=0
declare -a RESULTS=()

ALL_FLOWS=(
  .maestro/L01-full-login.yaml
  .maestro/L02-home-after-login.yaml
  .maestro/L03-visit-tabs-after-login.yaml
  .maestro/L04-profile-after-login.yaml
  .maestro/L05-notifications-after-login.yaml
  .maestro/L06-ai-chat-after-login.yaml
  .maestro/L07-questionnaire-after-login.yaml
  .maestro/L08-logout.yaml
  .maestro/flow.yaml
  .maestro/login-flow.yaml
  .maestro/visit-flow.yaml
)

for f in "${ALL_FLOWS[@]}"; do
  if [[ -f "$f" ]]; then
    name=$(basename "$f" .yaml)
    echo "===== $name ====="
    if bash "$RUNNER" test "$f"; then
      echo "PASS: $name"
      RESULTS+=("PASS  $name")
      PASS=$((PASS+1))
    else
      echo "FAIL: $name"
      RESULTS+=("FAIL  $name")
      FAILED=1
    fi
    echo ""
  fi
done

echo ""
echo "============================================"
echo "  iOS Headed E2E 测试结果汇总"
echo "============================================"
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo "--------------------------------------------"
TOTAL=${#RESULTS[@]}
FAIL_COUNT=$((TOTAL - PASS))
echo "  通过: $PASS  失败: $FAIL_COUNT  合计: $TOTAL"
echo "============================================"
exit $FAILED
