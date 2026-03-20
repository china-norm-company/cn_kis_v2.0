#!/bin/bash
# ============================================================================
# CN KIS V1.0 - 火山云 ECS 部署脚本
# 服务器: 118.196.64.48
#
# 工作台列表从 config/workstations.yaml 动态读取（唯一真相源）
# Nginx 配置直接使用 deploy/nginx.conf（唯一真相源）
# ============================================================================
set -e

if [ "${ALLOW_LEGACY_SERVER_DEPLOY:-false}" != "true" ]; then
  echo "BLOCKED: 当前仓库小程序发布默认通道为「微信云托管」。"
  echo "该脚本属于遗留服务器部署链路，默认禁用。"
  echo "如需手动启用，请显式确认:"
  echo "  ALLOW_LEGACY_SERVER_DEPLOY=true bash scripts/deploy_volcengine.sh"
  exit 1
fi

# ---- 项目根目录（按脚本位置计算，兼容 Windows/WSL） ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_DIR="/opt/cn-kis"

# 加载 SSH 凭据（deploy/secrets.env）
if [ -f "$DEPLOY_DIR/deploy/secrets.env" ]; then
  set -a
  source "$DEPLOY_DIR/deploy/secrets.env"
  set +a
fi

SSH_HOST="${VOLCENGINE_SSH_HOST:-118.196.64.48}"
SSH_USER="${VOLCENGINE_SSH_USER:-root}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o TCPKeepAlive=yes -o ConnectTimeout=15"
SSH_TARGET="$SSH_USER@$SSH_HOST"

# 认证：优先密钥，否则密码（需 sshpass）
if [ -n "$VOLCENGINE_SSH_KEY" ] && [ -f "$VOLCENGINE_SSH_KEY" ]; then
  SSH_OPTS="$SSH_OPTS -i $VOLCENGINE_SSH_KEY"
  SSH_CMD="ssh $SSH_OPTS $SSH_TARGET"
  SCP_CMD="scp $SSH_OPTS"
elif [ -n "$VOLCENGINE_SSH_PASS" ] && [ "$VOLCENGINE_SSH_PASS" != "请填入服务器root密码" ]; then
  if command -v sshpass >/dev/null 2>&1; then
    SSH_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' ssh $SSH_OPTS $SSH_TARGET"
    SCP_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' scp $SSH_OPTS"
  else
    echo "FAIL: 已配置 VOLCENGINE_SSH_PASS 但本机未安装 sshpass（macOS: brew install sshpass, Ubuntu: apt install sshpass）"
    exit 1
  fi
else
  echo "FAIL: 请在 deploy/secrets.env 中配置 VOLCENGINE_SSH_PASS 或 VOLCENGINE_SSH_KEY"
  exit 1
fi

cd "$DEPLOY_DIR"

# ---- 从 workstations.yaml 读取工作台列表 ----
# 支持 DEPLOY_WORKSTATIONS=material 或 DEPLOY_WORKSTATIONS=secretary,material 仅部署指定工作台
if [ -n "$DEPLOY_WORKSTATIONS" ]; then
  WORKSTATIONS=$(echo "$DEPLOY_WORKSTATIONS" | tr ',' '\n' | tr -d ' ')
  echo "仅部署工作台: $DEPLOY_WORKSTATIONS"
else
  WORKSTATIONS=$(python3 -c "
import yaml
with open('config/workstations.yaml') as f:
    data = yaml.safe_load(f)
for ws in data['workstations']:
    print(ws['key'])
")
fi
WORKSTATION_COUNT=$(echo "$WORKSTATIONS" | wc -l | tr -d ' ')

echo "========================================"
echo "  CN KIS V1.0 部署到火山云"
echo "  工作台数量: $WORKSTATION_COUNT"
echo "========================================"

# ---- Step 0: 部署前健康检查 ----
echo ""
echo "[0/7] 部署前健康检查..."
if [ -n "$DEPLOY_WORKSTATIONS" ]; then
  ONLY_ARG="--only=$DEPLOY_WORKSTATIONS"
  python3 scripts/workstation_health_check.py $ONLY_ARG || { echo "健康检查未通过，终止部署"; exit 1; }
else
  python3 scripts/workstation_health_check.py || { echo "健康检查未通过，终止部署"; exit 1; }
fi

# ---- Step 1: 构建前端 ----
echo ""
echo "[1/7] 构建前端应用..."

which pnpm > /dev/null 2>&1 || npm install -g pnpm

for app in $WORKSTATIONS; do
  echo "  构建 $app..."
  pnpm --filter "@cn-kis/$app" build 2>&1 | tail -3
done

# ---- Step 2: 准备部署包 ----
echo ""
echo "[2/7] 准备部署包..."
STAGING="/tmp/cn-kis-deploy"
rm -rf "$STAGING"
mkdir -p "$STAGING"

# 后端
echo "  复制后端代码..."
mkdir -p "$STAGING/backend"
cp -r backend/apps backend/middleware backend/manage.py backend/settings.py \
      backend/urls.py backend/wsgi.py backend/requirements.txt backend/db_router.py backend/_api_holder.py "$STAGING/backend/"
cp -r backend/apps/*/migrations "$STAGING/backend/" 2>/dev/null || true
# libs 目录
if [ -d "backend/libs" ]; then
  cp -r backend/libs "$STAGING/backend/"
fi

# 前端构建产物
echo "  复制前端构建产物..."
for app in $WORKSTATIONS; do
  mkdir -p "$STAGING/frontend_dist/$app"
  cp -r "apps/$app/dist/"* "$STAGING/frontend_dist/$app/" 2>/dev/null || echo "  ($app 未构建)"
done

# 部署配置
echo "  复制部署配置..."
cp -r deploy "$STAGING/"
mkdir -p "$STAGING/config"
cp -r config/* "$STAGING/config/" 2>/dev/null || true

# ---- Step 3: 上传到服务器 ----
echo ""
echo "[3/7] 上传到服务器..."
ARCHIVE="/tmp/cn-kis-deploy.tar.gz"
rm -f "$ARCHIVE"
tar -czf "$ARCHIVE" -C "$STAGING" .
$SSH_CMD "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR"
$SCP_CMD "$ARCHIVE" "$SSH_USER@$SSH_HOST:/tmp/cn-kis-deploy.tar.gz"
$SSH_CMD "tar -xzf /tmp/cn-kis-deploy.tar.gz -C $REMOTE_DIR && rm -f /tmp/cn-kis-deploy.tar.gz"
rm -f "$ARCHIVE"
echo "  上传完成"

# ---- Step 4: 服务器端设置 ----
echo ""
echo "[4/7] 配置服务器环境..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -e
REMOTE_DIR="/opt/cn-kis"
cd "$REMOTE_DIR/backend"

echo "  创建 Python 虚拟环境..."
python3 -m venv venv
source venv/bin/activate

echo "  安装 Python 依赖..."
pip install --quiet --upgrade pip
# 使用阿里云 PyPI 镜像，避免火山云镜像 404；增加超时应对网络波动
pip install --quiet -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --default-timeout=120

echo "  配置 PostgreSQL..."
sudo -u postgres psql -c "CREATE USER cn_kis WITH PASSWORD 'cn_kis_2026';" 2>/dev/null || echo "  用户已存在"
sudo -u postgres psql -c "CREATE DATABASE cn_kis OWNER cn_kis;" 2>/dev/null || echo "  数据库已存在"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cn_kis TO cn_kis;" 2>/dev/null || true

echo "  创建 .env..."
cat > "$REMOTE_DIR/backend/.env" << 'ENV'
DB_NAME=cn_kis
DB_USER=cn_kis
DB_PASSWORD=cn_kis_2026
DB_HOST=localhost
DB_PORT=5432
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=118.196.64.48,localhost,www.utest.cc,utest.cc,mini.china-norm.com
DJANGO_SECRET_KEY=cn-kis-prod-secret-$(openssl rand -hex 16)
CORS_ORIGINS=http://118.196.64.48
JWT_SECRET=cn-kis-jwt-secret-$(openssl rand -hex 16)
REDIS_URL=redis://127.0.0.1:6379/0
ENV

if [ -f "$REMOTE_DIR/deploy/.env.volcengine.plan-a" ]; then
  grep -E '^FEISHU_|^ARK_|^KIMI_|^VOLCENGINE_|^REDIS_URL=' "$REMOTE_DIR/deploy/.env.volcengine.plan-a" >> "$REMOTE_DIR/backend/.env" 2>/dev/null || true
fi

echo "  执行数据库迁移..."
DJANGO_SETTINGS_MODULE=settings python manage.py migrate --noinput 2>&1 | tail -5

echo "  初始化角色与权限（seed_roles）..."
DJANGO_SETTINGS_MODULE=settings python manage.py seed_roles 2>&1 | tail -5

mkdir -p "$REMOTE_DIR/backend/logs"
mkdir -p "$REMOTE_DIR/backend/media"

echo "  服务器环境配置完成"
REMOTE_SCRIPT

# ---- Step 5: 配置 Nginx（使用本地 deploy/nginx.conf 唯一真相源） ----
echo ""
echo "[5/7] 配置 Nginx..."

# 读取工作台列表传递给远端脚本
WORKSTATION_LIST=$(echo "$WORKSTATIONS" | tr '\n' ' ')

$SSH_CMD "
set -e
REMOTE_DIR='/opt/cn-kis'

# 部署前端静态文件
for app in $WORKSTATION_LIST; do
  mkdir -p /var/www/cn-kis/\$app
  cp -r \$REMOTE_DIR/frontend_dist/\$app/* /var/www/cn-kis/\$app/ 2>/dev/null || true
done

# 使用上传的 nginx.conf（唯一真相源，不再内联生成）
cp \$REMOTE_DIR/deploy/nginx.conf /etc/nginx/sites-available/cn-kis.conf
# 清理历史备份配置，避免同名 server block 冲突
rm -f /etc/nginx/sites-enabled/cn-kis.conf.bak* 2>/dev/null || true
# 添加 server_name 和日志
sed -i 's/server_name localhost;/server_name 118.196.64.48 mini.utest.cc mini.china-norm.com;/' /etc/nginx/sites-available/cn-kis.conf
sed -i '/charset utf-8;/a\    access_log /var/log/nginx/cn-kis-access.log;\n    error_log /var/log/nginx/cn-kis-error.log;' /etc/nginx/sites-available/cn-kis.conf

# 小程序域名 mini.utest.cc 的 HTTPS（443）：仅当证书存在时启用
cp \$REMOTE_DIR/deploy/nginx-mini-ssl.conf /etc/nginx/sites-available/cn-kis-mini-ssl.conf
if [ -f /etc/letsencrypt/live/mini.utest.cc/fullchain.pem ]; then
  ln -sf /etc/nginx/sites-available/cn-kis-mini-ssl.conf /etc/nginx/sites-enabled/cn-kis-mini-ssl.conf
  echo '  mini.utest.cc HTTPS (443) 已启用'
else
  rm -f /etc/nginx/sites-enabled/cn-kis-mini-ssl.conf 2>/dev/null || true
  echo '  跳过 mini.utest.cc HTTPS：未找到证书'
fi

# 小程序 API 域名 www.utest.cc / utest.cc（付费证书）：仅当证书存在时启用
cp \$REMOTE_DIR/deploy/nginx-utest-ssl.conf /etc/nginx/sites-available/cn-kis-utest-ssl.conf
if [ -f /etc/nginx/ssl/utest.cc/fullchain.pem ]; then
  ln -sf /etc/nginx/sites-available/cn-kis-utest-ssl.conf /etc/nginx/sites-enabled/cn-kis-utest-ssl.conf
  echo '  www.utest.cc / utest.cc HTTPS (443) 已启用'
else
  rm -f /etc/nginx/sites-enabled/cn-kis-utest-ssl.conf 2>/dev/null || true
  echo '  跳过 www.utest.cc HTTPS：未找到 /etc/nginx/ssl/utest.cc/fullchain.pem'
fi

# mini.china-norm.com HTTPS（443）：仅当证书存在时启用
if [ -f \$REMOTE_DIR/deploy/nginx-china-norm-ssl.conf ]; then
  cp \$REMOTE_DIR/deploy/nginx-china-norm-ssl.conf /etc/nginx/sites-available/cn-kis-china-norm-ssl.conf
  if [ -f /etc/letsencrypt/live/mini.china-norm.com/fullchain.pem ]; then
    ln -sf /etc/nginx/sites-available/cn-kis-china-norm-ssl.conf /etc/nginx/sites-enabled/cn-kis-china-norm-ssl.conf
    echo '  mini.china-norm.com HTTPS (443) 已启用'
  else
    rm -f /etc/nginx/sites-enabled/cn-kis-china-norm-ssl.conf 2>/dev/null || true
    echo '  跳过 mini.china-norm.com HTTPS：未找到证书'
  fi
fi

ln -sf /etc/nginx/sites-available/cn-kis.conf /etc/nginx/sites-enabled/cn-kis.conf
nginx -t
systemctl reload nginx
echo '  Nginx 配置完成'
"

# ---- Step 6: 配置 systemd 并启动 ----
echo ""
echo "[6/7] 配置并启动服务..."
$SSH_CMD << 'SERVICE_SCRIPT'
set -e
REMOTE_DIR="/opt/cn-kis"

cat > /etc/systemd/system/cn-kis-api.service << SERVICE
[Unit]
Description=CN KIS V1.0 API (Django Ninja)
After=network.target postgresql@16-main.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/cn-kis/backend
Environment="PATH=/opt/cn-kis/backend/venv/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/cn-kis/backend/.env
ExecStart=/opt/cn-kis/backend/venv/bin/gunicorn wsgi:application --bind 0.0.0.0:8001 --workers 2 --timeout 120 --access-logfile /opt/cn-kis/backend/logs/access.log --error-logfile /opt/cn-kis/backend/logs/error.log
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable cn-kis-api
systemctl restart cn-kis-api
sleep 3
test -f /opt/cn-kis/backend/.env
test -x /opt/cn-kis/backend/venv/bin/gunicorn
systemctl is-active --quiet cn-kis-api
curl -sS -o /tmp/cn-kis-internal-health.json -w '%{http_code}' http://127.0.0.1:8001/api/v1/health | grep -q '^200$'
systemctl status cn-kis-api --no-pager | head -10
SERVICE_SCRIPT

# ---- Step 7: 部署后冒烟测试 ----
echo ""
echo "[7/7] 部署后冒烟测试..."
SMOKE_FAIL=0

# API 健康检查：先校验 Gunicorn 直连，再校验经 Nginx 暴露路径
echo "  测试 API 健康检查..."
API_INTERNAL_HTTP_CODE=$($SSH_CMD "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8001/api/v1/health || true")
if [ "$API_INTERNAL_HTTP_CODE" = "200" ]; then
  echo "  ✓ API 内部健康检查: HTTP $API_INTERNAL_HTTP_CODE"
else
  echo "  ✗ API 内部健康检查失败: HTTP $API_INTERNAL_HTTP_CODE"
  SMOKE_FAIL=1
fi

API_HTTP_CODE=$($SSH_CMD "curl -k -s -o /dev/null -w '%{http_code}' -L http://localhost/api/v1/health || true")
if [ "$API_HTTP_CODE" = "200" ] || [ "$API_HTTP_CODE" = "301" ] || [ "$API_HTTP_CODE" = "302" ]; then
  echo "  ✓ API Nginx 健康检查: HTTP $API_HTTP_CODE"
else
  echo "  ✗ API Nginx 健康检查失败: HTTP $API_HTTP_CODE"
  SMOKE_FAIL=1
fi

# 各工作台 HTTP 可达性（200/301/302 均视为可达，Nginx 可能做尾斜杠重定向）
for app in $WORKSTATIONS; do
  HTTP_CODE=$($SSH_CMD "curl -k -s -o /dev/null -w '%{http_code}' -L http://localhost/$app/ || true")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo "  ✓ $app: HTTP $HTTP_CODE"
  else
    echo "  ✗ $app: HTTP $HTTP_CODE"
    SMOKE_FAIL=1
  fi
done

echo ""
echo "========================================"
if [ "$SMOKE_FAIL" -eq 0 ]; then
  echo "  部署成功！所有冒烟测试通过"
else
  echo "  部署完成，但部分冒烟测试失败（请检查以上输出）"
fi
echo ""
for app in $WORKSTATIONS; do
  echo "  http://118.196.64.48/$app/"
done
echo "  API: http://118.196.64.48/api/v1/docs"
echo "========================================"

# ---- Step 8: 线上认证链路完整性体检 ----
echo ""
echo "[8/8] 线上认证链路完整性体检..."
if [ -f "$DEPLOY_DIR/scripts/check_prod_auth_integrity.sh" ] && bash "$DEPLOY_DIR/scripts/check_prod_auth_integrity.sh"; then
  echo "  ✓ 线上认证链路体检通过"
else
  echo "  ✗ 线上认证链路体检失败，请立即排查（本次发布不建议验收）"
  exit 1
fi

rm -rf "$STAGING"
echo ""
echo "部署完成！"
