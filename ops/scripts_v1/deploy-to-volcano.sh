#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# 方案检查台 – 一键部署到火山云
# 用法（在 Protocol Check 根目录执行）：
#   bash scripts/deploy-to-volcano.sh
#
# 仅部署方案检查台本身，不涉及 cn_kis_v1.0 main 或其他分支代码。
# ══════════════════════════════════════════════════════════════════

set -e

# ── 配置 ──────────────────────────────────────────────────────────
REMOTE_HOST="118.196.64.48"
REMOTE_USER="root"
REMOTE_DIR="/opt/protocol-check"
REMOTE_PORT=5000
APP_SERVICE="protocol-check"   # systemd service 或 gunicorn pid 标识

# ── 颜色输出 ──────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }

# ── 检查本地依赖 ───────────────────────────────────────────────────
info "检查本地依赖..."
command -v rsync >/dev/null 2>&1 || { echo "需要安装 rsync"; exit 1; }
command -v ssh   >/dev/null 2>&1 || { echo "需要安装 ssh";   exit 1; }
ok "本地依赖检查通过"

# ── 切换到脚本所在仓库根目录 ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"
info "本地根目录：$ROOT_DIR"

# ── rsync 上传（排除敏感文件和数据目录） ──────────────────────────
info "上传代码到 $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR ..."
rsync -avz --progress \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.cursor/skills/deployment-info/' \
  --exclude='instance/' \
  --exclude='uploads/' \
  --exclude='__pycache__/' \
  --exclude='*.py[cod]' \
  --exclude='venv/' \
  --exclude='.venv/' \
  --exclude='.DS_Store' \
  --exclude='.snapshots/' \
  --exclude='test_all.py' \
  --exclude='test_quick.py' \
  --exclude='005 protocol/' \
  --exclude='047 protocol/' \
  --exclude='076 protocol/' \
  --exclude='104 protocol/' \
  --exclude='中文方案/' \
  --exclude='复硕标准方案/' \
  --exclude='复硕词典.xlsx' \
  --exclude='cn_kis_v1.0/' \
  --exclude='cn_kis_protocol_check/' \
  --exclude='research-app/' \
  --exclude='.git/' \
  ./ "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

ok "代码上传完成"

# ── 服务器端：安装依赖 + 重启服务 ────────────────────────────────
info "在服务器上安装依赖并重启服务..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" bash <<REMOTE_SCRIPT
set -e
cd "${REMOTE_DIR}"

# 确保 instance 和 uploads 目录存在且可写
mkdir -p instance uploads
chmod 755 instance uploads

# 若服务器无 .env，从 .env.example 复制（首次部署提示）
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "[warn] 服务器上已从 .env.example 创建 .env，请手动填写 ZHIPU_API_KEY 等必要配置"
  else
    echo "[warn] 服务器上无 .env 文件，请手动创建并填写配置后再重启服务"
  fi
fi

# 安装 Python 依赖（用 pip3）
echo "[deploy] 安装 Python 依赖..."
pip3 install -r requirements.txt --quiet

# 停止旧的 gunicorn 进程（若有）
OLD_PID=\$(pgrep -f "gunicorn.*app:app" || true)
if [ -n "\$OLD_PID" ]; then
  echo "[deploy] 停止旧进程 PID=\$OLD_PID"
  kill "\$OLD_PID" 2>/dev/null || true
  sleep 2
fi

# 启动 gunicorn（后台运行，日志写入 /var/log/protocol-check.log）
echo "[deploy] 启动 gunicorn (port ${REMOTE_PORT}, workers=4)..."
nohup gunicorn -w 4 -b 0.0.0.0:${REMOTE_PORT} --timeout 180 \
  --access-logfile /var/log/protocol-check-access.log \
  --error-logfile  /var/log/protocol-check-error.log \
  app:app > /dev/null 2>&1 &

sleep 3

# 健康检查
HTTP_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${REMOTE_PORT}/ || echo "000")
if [ "\$HTTP_STATUS" = "200" ]; then
  echo "[ok] 方案检查台启动成功！HTTP 200"
  echo "[ok] 访问地址：http://${REMOTE_HOST}:${REMOTE_PORT}/"
else
  echo "[error] 启动后健康检查失败（HTTP \$HTTP_STATUS），请查看日志："
  echo "  tail -50 /var/log/protocol-check-error.log"
  exit 1
fi
REMOTE_SCRIPT

ok "部署完成！"
echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  方案检查台已上线${NC}"
echo -e "${GREEN}  访问地址：http://${REMOTE_HOST}:${REMOTE_PORT}/${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
warn "提醒：若服务器 .env 是首次创建，请登录服务器补填 ZHIPU_API_KEY："
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST}"
echo "  vi ${REMOTE_DIR}/.env"
echo "  # 填好后重启：pkill -f 'gunicorn.*app:app' && 重新执行本脚本"
