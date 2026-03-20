#!/bin/bash
# ============================================================================
# CN KIS V1.0 - 生产环境定期巡检脚本
#
# 用法:
#   ./scripts/workstation_patrol.sh                   # 默认远程巡检
#   ./scripts/workstation_patrol.sh --local            # 本地巡检 (localhost)
#   ./scripts/workstation_patrol.sh --notify           # 巡检并通知（飞书机器人）
#
# 工作台列表从 config/workstations.yaml 动态读取
# ============================================================================
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 配置
TARGET_HOST="${PATROL_HOST:-118.196.64.48}"
SSH_KEY="${SSH_KEY:-/Users/aksu/Downloads/openclaw1.1.pem}"
SSH_HOST="root@$TARGET_HOST"
SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10 $SSH_HOST"
LOCAL_MODE=0
NOTIFY_MODE=0

for arg in "$@"; do
  case "$arg" in
    --local) LOCAL_MODE=1; TARGET_HOST="localhost" ;;
    --notify) NOTIFY_MODE=1 ;;
  esac
done

# 从 workstations.yaml 读取工作台列表
WORKSTATIONS=$(python3 -c "
import yaml
with open('config/workstations.yaml') as f:
    data = yaml.safe_load(f)
for ws in data['workstations']:
    print(ws['key'])
")

TOTAL=0
PASS=0
FAIL=0
REPORT=""

log() {
  echo "$1"
  REPORT="$REPORT\n$1"
}

check() {
  TOTAL=$((TOTAL + 1))
  if [ "$2" -eq 0 ]; then
    PASS=$((PASS + 1))
    log "  ✓ $1"
  else
    FAIL=$((FAIL + 1))
    log "  ✗ $1"
  fi
}

echo "========================================"
echo "  CN KIS V1.0 生产环境巡检"
echo "  目标: $TARGET_HOST"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# ---- 1. API 健康检查 ----
log "[1] API 健康检查"
HTTP_CODE=$(curl -s -o /tmp/patrol_health.json -w "%{http_code}" "http://$TARGET_HOST/api/v1/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  DB_STATUS=$(python3 -c "import json; d=json.load(open('/tmp/patrol_health.json')); print(d['data']['database'])" 2>/dev/null || echo "error")
  check "API 返回 200" 0
  if [ "$DB_STATUS" = "ok" ]; then
    check "数据库连接正常" 0
  else
    check "数据库连接正常" 1
  fi
else
  check "API 返回 200 (实际: $HTTP_CODE)" 1
  check "数据库连接正常 (API 不可达)" 1
fi

# ---- 2. 工作台 HTTP 可达性 ----
echo ""
log "[2] 工作台 HTTP 可达性"
for ws in $WORKSTATIONS; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$TARGET_HOST/$ws/" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    check "$ws: HTTP 200" 0
  else
    check "$ws: HTTP $HTTP_CODE" 1
  fi
done

# ---- 3. 远程服务状态（仅 SSH 模式） ----
if [ "$LOCAL_MODE" -eq 0 ]; then
  echo ""
  log "[3] 远程服务状态"

  # Nginx
  NGINX_STATUS=$($SSH_CMD "systemctl is-active nginx 2>/dev/null || echo inactive" 2>/dev/null || echo "unreachable")
  if [ "$NGINX_STATUS" = "active" ]; then
    check "Nginx 服务运行中" 0
  else
    check "Nginx 服务 ($NGINX_STATUS)" 1
  fi

  # Django API
  API_STATUS=$($SSH_CMD "systemctl is-active cn-kis-api 2>/dev/null || echo inactive" 2>/dev/null || echo "unreachable")
  if [ "$API_STATUS" = "active" ]; then
    check "cn-kis-api 服务运行中" 0
  else
    check "cn-kis-api 服务 ($API_STATUS)" 1
  fi

  # 磁盘空间
  DISK_USAGE=$($SSH_CMD "df -h / | awk 'NR==2{print \$5}' | tr -d '%'" 2>/dev/null || echo "100")
  if [ "$DISK_USAGE" -lt 90 ]; then
    check "磁盘使用率 ${DISK_USAGE}% (<90%)" 0
  else
    check "磁盘使用率 ${DISK_USAGE}% (≥90%)" 1
  fi
fi

# ---- 汇总 ----
echo ""
echo "========================================"
if [ "$FAIL" -gt 0 ]; then
  log "巡检结果: $FAIL 项异常 / $TOTAL 项检查"
  echo "========================================"
  exit 1
else
  log "巡检结果: 全部通过 ($PASS/$TOTAL)"
  echo "========================================"
fi

# ---- 飞书机器人通知（可选） ----
if [ "$NOTIFY_MODE" -eq 1 ] && [ -n "$FEISHU_WEBHOOK_URL" ]; then
  STATUS_EMOJI="✅"
  [ "$FAIL" -gt 0 ] && STATUS_EMOJI="❌"

  curl -s -X POST "$FEISHU_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"msg_type\": \"text\",
      \"content\": {
        \"text\": \"$STATUS_EMOJI CN KIS 巡检报告 ($TARGET_HOST)\\n通过: $PASS/$TOTAL\\n失败: $FAIL/$TOTAL\\n时间: $(date '+%Y-%m-%d %H:%M:%S')\"
      }
    }" > /dev/null
fi
