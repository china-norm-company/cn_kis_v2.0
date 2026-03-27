#!/bin/bash
# 微信小程序一键部署（构建 + 通讯云上传 + 日志）
# 用法：
#   ./scripts/deploy_wechat_mini.sh [VERSION] [DESC]
# 示例：
#   ./scripts/deploy_wechat_mini.sh 1.0.2 "tencent deploy"

set -euo pipefail

if [ "${ALLOW_LEGACY_SERVER_DEPLOY:-false}" != "true" ]; then
  echo "BLOCKED: 当前仓库小程序发布默认通道为「微信云托管」。"
  echo "请改用: pnpm deploy:wechat-mini  或  pnpm cloudrun:deploy"
  echo "如确需走遗留服务器上传链路，请显式确认:"
  echo "  ALLOW_LEGACY_SERVER_DEPLOY=true bash scripts/deploy_wechat_mini.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [ -f deploy/secrets.env ]; then
  set -a
  source deploy/secrets.env
  set +a
else
  echo "FAIL: deploy/secrets.env 不存在"
  exit 1
fi

SSH_HOST="${TENCENT_SSH_HOST:-}"
SSH_USER="${TENCENT_SSH_USER:-root}"
SSH_KEY="${TENCENT_SSH_KEY:-}"
SSH_PASS="${TENCENT_SSH_PASS:-}"
APPID="${WECHAT_MINI_APPID:-wx2019d5560fe47b1d}"
PRIVATE_KEY_LOCAL="${WECHAT_MINI_PRIVATE_KEY_PATH:-$HOME/Downloads/private.wx2019d5560fe47b1d.key}"
REMOTE_ENV_FILE="${WECHAT_MINI_REMOTE_ENV_FILE:-/opt/cn-kis/deploy/.env.tencent.plan-a}"
FORBIDDEN_VOLCENGINE_HOST="118.196.64.48"

if [ -z "$SSH_HOST" ]; then
  echo "FAIL: 必须设置 TENCENT_SSH_HOST（本脚本仅支持通讯云链路）"
  exit 1
fi
if [ "$SSH_HOST" = "$FORBIDDEN_VOLCENGINE_HOST" ]; then
  echo "FAIL: 检测到火山云主机 ${SSH_HOST}，本次部署禁止使用火山云服务"
  exit 1
fi
if [ -n "$SSH_KEY" ] && [ ! -f "$SSH_KEY" ]; then
  echo "FAIL: TENCENT_SSH_KEY 文件不存在: $SSH_KEY"
  exit 1
fi
if [ -z "$SSH_KEY" ] && [ -z "$SSH_PASS" ]; then
  echo "FAIL: 缺少可用 TENCENT_SSH_KEY 或 TENCENT_SSH_PASS"
  exit 1
fi
if [ -z "$SSH_KEY" ] && [ -n "$SSH_PASS" ] && ! command -v sshpass >/dev/null 2>&1; then
  echo "FAIL: 使用 TENCENT_SSH_PASS 需要安装 sshpass（macOS: brew install sshpass）"
  exit 1
fi
if [ ! -f "$PRIVATE_KEY_LOCAL" ]; then
  echo "FAIL: 微信上传私钥不存在: $PRIVATE_KEY_LOCAL"
  exit 1
fi

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  VERSION="$(date '+%Y.%m.%d.%H%M')"
fi
DESC="${2:-tencent deploy $VERSION}"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="-i $SSH_KEY $SSH_OPTS"
fi

if [ -n "$SSH_PASS" ] && [ -z "${SSH_KEY:-}" ]; then
  SSH_CMD="sshpass -p '$SSH_PASS' ssh $SSH_OPTS"
  SCP_CMD="sshpass -p '$SSH_PASS' scp $SSH_OPTS"
else
  SSH_CMD="ssh $SSH_OPTS"
  SCP_CMD="scp $SSH_OPTS"
fi

REMOTE_TMP_BASE="/tmp/wechat-mini-upload"
REMOTE_PRIVATE_KEY="/tmp/$(basename "$PRIVATE_KEY_LOCAL")"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/wechat-mini-deploy.log"

mkdir -p "$LOG_DIR"

echo "=== 微信小程序一键部署（通讯云）==="
echo "目标服务器: $SSH_USER@$SSH_HOST"
echo "AppID: $APPID"
echo "Version: $VERSION"
echo "Desc: $DESC"
echo ""

echo "[1/6] 构建小程序..."
WECHAT_MINI_API_BASE="${WECHAT_MINI_API_BASE:-}"
if [ -z "$WECHAT_MINI_API_BASE" ]; then
  echo "FAIL: 必须显式设置 WECHAT_MINI_API_BASE，避免误用旧域名。"
  echo "示例: WECHAT_MINI_API_BASE=https://mini.example.com/api/v1 ./scripts/deploy_wechat_mini.sh"
  exit 1
fi
case "$WECHAT_MINI_API_BASE" in
  https://* ) ;;
  * )
    echo "FAIL: WECHAT_MINI_API_BASE 必须是 https URL: $WECHAT_MINI_API_BASE"
    exit 1
    ;;
esac
WECHAT_MINI_ENABLE_FALLBACK="${WECHAT_MINI_ENABLE_FALLBACK:-false}"
WECHAT_MINI_BACKUP_BASE="${WECHAT_MINI_BACKUP_BASE:-}"
if [ "$WECHAT_MINI_ENABLE_FALLBACK" = "true" ] && [ -z "$WECHAT_MINI_BACKUP_BASE" ]; then
  echo "FAIL: WECHAT_MINI_ENABLE_FALLBACK=true 时必须提供 WECHAT_MINI_BACKUP_BASE"
  exit 1
fi
echo "使用小程序 API 基址: $WECHAT_MINI_API_BASE"
echo "启用备用通道: $WECHAT_MINI_ENABLE_FALLBACK"
[ -n "$WECHAT_MINI_BACKUP_BASE" ] && echo "备用通道地址: $WECHAT_MINI_BACKUP_BASE"
TARO_APP_API_BASE="$WECHAT_MINI_API_BASE" TARO_APP_ENABLE_FALLBACK="$WECHAT_MINI_ENABLE_FALLBACK" TARO_APP_API_BACKUP_BASE="$WECHAT_MINI_BACKUP_BASE" pnpm --filter @cn-kis/wechat-mini build:weapp

echo "[2/6] 同步后端环境（可选）..."
eval "$SSH_CMD \"$SSH_USER@$SSH_HOST\" \"mkdir -p /opt/cn-kis/deploy\""
if [ -f deploy/.env.tencent.plan-a ]; then
  eval "$SCP_CMD deploy/.env.tencent.plan-a \"$SSH_USER@$SSH_HOST:$REMOTE_ENV_FILE\""
elif [ -f deploy/.env.tencent.plan-a.example ]; then
  echo "WARN: 未找到 deploy/.env.tencent.plan-a，已上传示例文件（请在服务器补齐真实密钥）"
  eval "$SCP_CMD deploy/.env.tencent.plan-a.example \"$SSH_USER@$SSH_HOST:$REMOTE_ENV_FILE\""
else
  echo "WARN: 未找到 deploy/.env.tencent.plan-a(.example)，跳过环境文件同步"
fi
echo "  检查后端服务是否存在（cn-kis-api）..."
if eval "$SSH_CMD \"$SSH_USER@$SSH_HOST\" \"python3 - <<'PY'
import subprocess
out = subprocess.check_output(['systemctl', 'list-unit-files', '--type=service'], text=True, errors='ignore')
raise SystemExit(0 if 'cn-kis-api.service' in out else 1)
PY\""; then
  eval "$SSH_CMD \"$SSH_USER@$SSH_HOST\" \"systemctl restart cn-kis-api && systemctl is-active cn-kis-api >/dev/null\""
  echo "  ✓ 已重启 cn-kis-api"
else
  echo "WARN: 目标机不存在 cn-kis-api.service，跳过后端重启（不影响小程序上传）"
fi

echo "  校验线上认证核心版本（可选）..."
if eval "$SSH_CMD \"$SSH_USER@$SSH_HOST\" \"python3 - <<'PY'
from pathlib import Path
import sys

p = Path('/opt/cn-kis/backend/apps/identity/services.py')
if not p.exists():
    print('WARN: 线上缺少 apps/identity/services.py，跳过认证版本校验')
    sys.exit(0)

text = p.read_text(errors='ignore')
required = ['def _normalize_oauth_code', 'AUTH_CODE_MISSING', 'feishu_oauth_exchange_failed']
missing = [m for m in required if m not in text]
if missing:
    print('WARN: 线上认证核心版本可能过旧，缺少标记:', ','.join(missing))
    sys.exit(0)
print('PASS: 线上认证核心版本校验通过')
PY\""; then
  :
else
  echo "WARN: 认证核心版本校验失败，已跳过（不影响小程序上传）"
fi

echo "[3/6] 准备上传包..."
rm -rf /tmp/wechat-mini-upload
mkdir -p /tmp/wechat-mini-upload
cp -R workstations/wechat-mini/dist /tmp/wechat-mini-upload/
cp workstations/wechat-mini/project.config.json /tmp/wechat-mini-upload/

echo "[4/6] 上传包到通讯云..."
eval "$SCP_CMD -r /tmp/wechat-mini-upload \"$SSH_USER@$SSH_HOST:/tmp/\""
eval "$SCP_CMD \"$PRIVATE_KEY_LOCAL\" \"$SSH_USER@$SSH_HOST:$REMOTE_PRIVATE_KEY\""

echo "[5/6] 在通讯云执行微信上传..."
if eval "$SSH_CMD \"$SSH_USER@$SSH_HOST\" \"command -v npx >/dev/null 2>&1\""; then
  eval "$SSH_CMD \"$SSH_USER@$SSH_HOST\" \
    \"cd $REMOTE_TMP_BASE && npx -y miniprogram-ci upload --pp . --appid $APPID --pkp $REMOTE_PRIVATE_KEY --uv $VERSION --ud \\\"$DESC\\\" --use-project-config\""
else
  echo "WARN: 目标机未安装 npx，改为本地执行微信上传..."
  WECHAT_MINI_APPID="$APPID" \
  WECHAT_MINI_PRIVATE_KEY_PATH="$PRIVATE_KEY_LOCAL" \
  WECHAT_MINI_VERSION="$VERSION" \
  WECHAT_MINI_DESC="$DESC" \
  pnpm --filter @cn-kis/wechat-mini upload:weapp
fi

echo "[6/6] 线上认证链路完整性体检（可选）..."
RUN_AUTH_INTEGRITY_CHECK="${WECHAT_MINI_RUN_AUTH_INTEGRITY_CHECK:-false}"
if [ "$RUN_AUTH_INTEGRITY_CHECK" = "true" ]; then
  if bash "$PROJECT_ROOT/scripts/check_prod_auth_integrity.sh" --quick; then
    echo "  ✓ 线上认证链路体检通过"
  else
    echo "WARN: 线上认证链路体检失败，发布已完成，请后续单独修复"
  fi
else
  echo "  跳过体检（可通过 WECHAT_MINI_RUN_AUTH_INTEGRITY_CHECK=true 开启）"
fi

echo "清理临时文件..."
eval "$SSH_CMD \"$SSH_USER@$SSH_HOST\" \"rm -rf $REMOTE_TMP_BASE && rm -f $REMOTE_PRIVATE_KEY\""
rm -rf /tmp/wechat-mini-upload

NOW="$(date '+%Y-%m-%d %H:%M:%S')"
{
  echo "[$NOW] success appid=$APPID version=$VERSION desc=\"$DESC\" host=$SSH_HOST"
} >> "$LOG_FILE"

echo ""
echo "✅ 部署完成"
echo "日志: $LOG_FILE"
