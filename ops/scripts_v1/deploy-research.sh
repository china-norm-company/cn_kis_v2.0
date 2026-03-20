#!/bin/bash
# =============================================================================
# deploy-research.sh
# 研究台 + Master 绩效台 一键部署脚本
#
# 用法：
#   bash scripts/deploy-research.sh
#
# 可选参数：
#   --skip-build   跳过前端构建（已手动构建时使用）
#   --dry-run      仅检查配置，不实际上传
#
# 前提：
#   1. deploy/secrets.env 中已填写 VOLCENGINE_SSH_HOST / SSH_PASS 或 SSH_KEY
#   2. 当前分支为 workbench/research（不会修改 main）
#   3. pnpm 已安装（npm install -g pnpm）
# =============================================================================
set -eo pipefail

# ── 颜色输出 ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 解析参数 ─────────────────────────────────────────────────────────────────
SKIP_BUILD=false
DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --dry-run)    DRY_RUN=true ;;
    *) warn "未知参数: $arg" ;;
  esac
done

# ── 目录定位 ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"           # cn_kis_v1.0/
WORKSPACE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"        # Clinical Performance/
PERF_STATIC_DIR="$WORKSPACE_DIR/master-perf-static"   # master-perf-static/

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  研究台 + Master 绩效台 一键部署"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 0: 安全检查 ─────────────────────────────────────────────────────────
info "Step 0/5  安全检查..."

cd "$PROJECT_DIR"

# 分支保护：禁止在 main 上部署
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ]; then
  error "当前分支是 main，禁止直接部署！请切换到 workbench/research 分支。"
fi
success "当前分支：$CURRENT_BRANCH（安全）"

# 检查 master-perf-static 目录
if [ ! -f "$PERF_STATIC_DIR/index.html" ]; then
  error "找不到 $PERF_STATIC_DIR/index.html，请确认 master-perf-static 目录存在。"
fi
success "Master 绩效台静态文件检查通过"

# 加载 SSH 凭据
SECRETS_FILE="$PROJECT_DIR/deploy/secrets.env"
if [ ! -f "$SECRETS_FILE" ]; then
  error "找不到 $SECRETS_FILE。\n请执行：cp deploy/secrets.env.example deploy/secrets.env\n然后填写 VOLCENGINE_SSH_HOST 和 VOLCENGINE_SSH_PASS（或 VOLCENGINE_SSH_KEY）"
fi
set -a; source "$SECRETS_FILE"; set +a

SSH_HOST="${VOLCENGINE_SSH_HOST:-118.196.64.48}"
SSH_USER="${VOLCENGINE_SSH_USER:-root}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15 -o ServerAliveInterval=30"

# 构建 SSH / SCP 命令
if [ -n "${VOLCENGINE_SSH_KEY:-}" ] && [ -f "$VOLCENGINE_SSH_KEY" ]; then
  SSH_CMD="ssh -i $VOLCENGINE_SSH_KEY $SSH_OPTS $SSH_USER@$SSH_HOST"
  SCP_CMD="scp -i $VOLCENGINE_SSH_KEY $SSH_OPTS"
  success "SSH 认证方式：密钥"
elif [ -n "${VOLCENGINE_SSH_PASS:-}" ] && command -v sshpass >/dev/null 2>&1; then
  SSH_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' ssh $SSH_OPTS $SSH_USER@$SSH_HOST"
  SCP_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' scp $SSH_OPTS"
  success "SSH 认证方式：密码"
else
  warn "未找到 sshpass，将使用交互式密码输入（可能需要多次输入密码）"
  warn "安装方式：brew install sshpass"
  SSH_CMD="ssh $SSH_OPTS $SSH_USER@$SSH_HOST"
  SCP_CMD="scp $SSH_OPTS"
fi

if [ "$DRY_RUN" = true ]; then
  success "[Dry-run] 配置检查通过，目标服务器：$SSH_HOST"
  success "[Dry-run] 所有检查通过，实际部署请去掉 --dry-run 参数"
  exit 0
fi

# ── Step 1: 构建研究台前端 ───────────────────────────────────────────────────
echo ""
info "Step 1/5  构建研究台前端..."

if [ "$SKIP_BUILD" = true ]; then
  warn "跳过构建（--skip-build）"
  if [ ! -d "$PROJECT_DIR/apps/research/dist" ]; then
    error "apps/research/dist 不存在，请先构建或去掉 --skip-build"
  fi
else
  cd "$PROJECT_DIR"
  which pnpm > /dev/null 2>&1 || { info "安装 pnpm..."; npm install -g pnpm; }
  info "执行 pnpm --filter @cn-kis/research build ..."
  pnpm --filter "@cn-kis/research" build
  success "研究台构建完成 → apps/research/dist/"
fi

# ── 准备临时无空格目录（解决 scp 路径含空格问题）────────────────────────────
STAGING="/tmp/cn-kis-research-deploy"
rm -rf "$STAGING"
mkdir -p "$STAGING/research" "$STAGING/perf-master" "$STAGING/nginx"
cp -r "$PROJECT_DIR/apps/research/dist/." "$STAGING/research/"
cp "$PERF_STATIC_DIR/index.html" "$PERF_STATIC_DIR/login.html" "$PERF_STATIC_DIR/chart.umd.min.js" "$STAGING/perf-master/"
cp "$PROJECT_DIR/deploy/nginx.conf" "$STAGING/nginx/cn-kis.conf"
success "部署包已准备 → $STAGING"

# ── Step 2: 上传研究台到服务器 ───────────────────────────────────────────────
echo ""
info "Step 2/5  上传研究台..."

REMOTE_RESEARCH="/var/www/cn-kis/research"
eval $SSH_CMD "mkdir -p $REMOTE_RESEARCH"
eval $SCP_CMD -r "$STAGING/research/." "$SSH_USER@$SSH_HOST:$REMOTE_RESEARCH/"
success "研究台已上传 → $SSH_HOST:$REMOTE_RESEARCH"

# ── Step 3: 上传 Master 绩效台 ───────────────────────────────────────────────
echo ""
info "Step 3/5  上传 Master 绩效台..."

REMOTE_PERF="/var/www/cn-kis/perf-master"
eval $SSH_CMD "mkdir -p $REMOTE_PERF"
eval $SCP_CMD -r "$STAGING/perf-master/." "$SSH_USER@$SSH_HOST:$REMOTE_PERF/"
success "Master 绩效台已上传 → $SSH_HOST:$REMOTE_PERF"

# ── Step 4: 更新 Nginx 配置并重载 ────────────────────────────────────────────
echo ""
info "Step 4/5  更新 Nginx 配置..."

REMOTE_NGINX_CONF="/etc/nginx/sites-available/cn-kis.conf"
REMOTE_NGINX_ENABLED="/etc/nginx/sites-enabled/cn-kis.conf"

eval $SCP_CMD "$STAGING/nginx/cn-kis.conf" "$SSH_USER@$SSH_HOST:$REMOTE_NGINX_CONF"

# 创建 symlink 并重载 Nginx
eval $SSH_CMD "
  set -e
  # 确保 sites-enabled 软链接存在
  if [ ! -L $REMOTE_NGINX_ENABLED ]; then
    ln -sf $REMOTE_NGINX_CONF $REMOTE_NGINX_ENABLED
    echo '  已创建 Nginx 软链接'
  fi
  # 测试配置
  nginx -t 2>&1
  # 热重载（不中断现有连接）
  systemctl reload nginx
  echo '  Nginx 重载完成'
"
success "Nginx 配置已更新并重载"

# ── Step 5: 验证部署 ─────────────────────────────────────────────────────────
echo ""
info "Step 5/5  验证部署..."

# 检查研究台首页 HTTP 状态
RESEARCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "http://$SSH_HOST/research/" 2>/dev/null || echo "000")

# 检查 Master 绩效台首页 HTTP 状态
PERF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "http://$SSH_HOST/perf-master/" 2>/dev/null || echo "000")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  部署结果"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$RESEARCH_STATUS" = "200" ] || [ "$RESEARCH_STATUS" = "304" ]; then
  success "研究台          http://$SSH_HOST/research/    [$RESEARCH_STATUS]"
else
  warn    "研究台          http://$SSH_HOST/research/    [状态码: $RESEARCH_STATUS]"
fi

if [ "$PERF_STATUS" = "200" ] || [ "$PERF_STATUS" = "304" ]; then
  success "Master 绩效台   http://$SSH_HOST/perf-master/ [$PERF_STATUS]"
else
  warn    "Master 绩效台   http://$SSH_HOST/perf-master/ [状态码: $PERF_STATUS]"
fi

echo ""
success "部署完成！"
echo ""
