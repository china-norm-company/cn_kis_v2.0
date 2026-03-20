#!/bin/bash
# ============================================================================
# CN KIS V1.0 - 试用/审计实例部署（方案 A：同机独立实例）
# 服务器: 118.196.64.48
# 与生产完全隔离：独立目录、独立数据库、独立端口、独立 Redis DB
# 不修改生产配置，不影响现有部署。
#
# 用法:
#   COPY_PROD_DATA=true  bash scripts/deploy_volcengine_audit.sh  # 可选：从生产库复制数据
#   bash scripts/deploy_volcengine_audit.sh                       # 全新库
# ============================================================================
set -e

# 显式确认后执行
if [ "${ALLOW_DEPLOY_AUDIT_INSTANCE:-false}" != "true" ]; then
  echo "试用实例部署需显式确认（与生产同机但完全隔离）："
  echo "  ALLOW_DEPLOY_AUDIT_INSTANCE=true bash scripts/deploy_volcengine_audit.sh"
  echo "可选：从生产库复制数据（账号+已采集邮件）后再跑迁移："
  echo "  COPY_PROD_DATA=true ALLOW_DEPLOY_AUDIT_INSTANCE=true bash scripts/deploy_volcengine_audit.sh"
  exit 1
fi

# ---- 项目根目录 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_DIR="/opt/cn-kis-audit"

# 加载 SSH 凭据
if [ -f "$DEPLOY_DIR/deploy/secrets.env" ]; then
  set -a
  source "$DEPLOY_DIR/deploy/secrets.env"
  set +a
fi

SSH_HOST="${VOLCENGINE_SSH_HOST:-118.196.64.48}"
SSH_USER="${VOLCENGINE_SSH_USER:-root}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o TCPKeepAlive=yes -o ConnectTimeout=15"
SSH_TARGET="$SSH_USER@$SSH_HOST"

if [ -n "$VOLCENGINE_SSH_KEY" ] && [ -f "$VOLCENGINE_SSH_KEY" ]; then
  SSH_OPTS="$SSH_OPTS -i $VOLCENGINE_SSH_KEY"
  SSH_CMD="ssh $SSH_OPTS $SSH_TARGET"
  SCP_CMD="scp $SSH_OPTS"
elif [ -n "$VOLCENGINE_SSH_PASS" ] && [ "$VOLCENGINE_SSH_PASS" != "请填入服务器root密码" ]; then
  if command -v sshpass >/dev/null 2>&1; then
    SSH_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' ssh $SSH_OPTS $SSH_TARGET"
    SCP_CMD="sshpass -p '$VOLCENGINE_SSH_PASS' scp $SSH_OPTS"
  else
    echo "FAIL: 需要 sshpass 或 VOLCENGINE_SSH_KEY"
    exit 1
  fi
else
  echo "FAIL: 请在 deploy/secrets.env 中配置 VOLCENGINE_SSH_PASS 或 VOLCENGINE_SSH_KEY"
  exit 1
fi

cd "$DEPLOY_DIR"

# ---- 工作台列表（与生产一致） ----
if [ -n "$DEPLOY_WORKSTATIONS" ]; then
  WORKSTATIONS=$(echo "$DEPLOY_WORKSTATIONS" | tr ',' '\n' | tr -d ' ')
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
echo "  CN KIS V1.0 试用实例部署（审计/资生堂）"
echo "  目标: $REMOTE_DIR, 端口 8004, DB: cn_kis_audit"
echo "  工作台数量: $WORKSTATION_COUNT"
echo "  复制生产数据: ${COPY_PROD_DATA:-false}"
echo "========================================"

# ---- Step 0: 健康检查（可选，与生产共用检查） ----
echo ""
echo "[0/7] 部署前健康检查..."
python3 scripts/workstation_health_check.py || { echo "健康检查未通过，终止部署"; exit 1; }

# ---- Step 1: 构建前端 ----
echo ""
echo "[1/7] 构建前端应用..."
which pnpm >/dev/null 2>&1 || npm install -g pnpm
for app in $WORKSTATIONS; do
  echo "  构建 $app..."
  pnpm --filter "@cn-kis/$app" build 2>&1 | tail -3
done

# ---- Step 2: 准备部署包 ----
echo ""
echo "[2/7] 准备部署包..."
STAGING="/tmp/cn-kis-audit-deploy"
rm -rf "$STAGING"
mkdir -p "$STAGING"

echo "  复制后端代码..."
mkdir -p "$STAGING/backend"
cp -r backend/apps backend/middleware backend/manage.py backend/settings.py \
      backend/urls.py backend/wsgi.py backend/requirements.txt backend/db_router.py backend/_api_holder.py "$STAGING/backend/"
cp -r backend/apps/*/migrations "$STAGING/backend/" 2>/dev/null || true
[ -d "backend/libs" ] && cp -r backend/libs "$STAGING/backend/"

echo "  复制前端构建产物..."
for app in $WORKSTATIONS; do
  mkdir -p "$STAGING/frontend_dist/$app"
  cp -r "apps/$app/dist/"* "$STAGING/frontend_dist/$app/" 2>/dev/null || echo "  ($app 未构建)"
done

echo "  复制部署配置..."
cp -r deploy "$STAGING/"
mkdir -p "$STAGING/config"
cp -r config/* "$STAGING/config/" 2>/dev/null || true

# ---- Step 3: 上传到服务器 ----
echo ""
echo "[3/7] 上传到服务器..."
ARCHIVE="/tmp/cn-kis-audit-deploy.tar.gz"
rm -f "$ARCHIVE"
tar -czf "$ARCHIVE" -C "$STAGING" .
$SSH_CMD "mkdir -p $REMOTE_DIR"
$SCP_CMD "$ARCHIVE" "$SSH_USER@$SSH_HOST:/tmp/cn-kis-audit-deploy.tar.gz"
$SSH_CMD "tar -xzf /tmp/cn-kis-audit-deploy.tar.gz -C $REMOTE_DIR && rm -f /tmp/cn-kis-audit-deploy.tar.gz"
rm -f "$ARCHIVE"
echo "  上传完成"

# ---- Step 4: 服务器端设置（独立 DB、.env、migrate） ----
echo ""
echo "[4/7] 配置服务器环境（数据库 cn_kis_audit，端口 8004）..."
WORKSTATION_LIST=$(echo "$WORKSTATIONS" | tr '\n' ' ')
$SSH_CMD "COPY_PROD_DATA=${COPY_PROD_DATA:-false} REMOTE_DIR=$REMOTE_DIR bash -s" << 'REMOTE_SCRIPT'
set -e
REMOTE_DIR="${REMOTE_DIR:-/opt/cn-kis-audit}"
cd "$REMOTE_DIR/backend"

echo "  创建 Python 虚拟环境..."
python3 -m venv venv
source venv/bin/activate

echo "  安装 Python 依赖..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --default-timeout=120

echo "  配置 PostgreSQL（cn_kis_audit）..."
sudo -u postgres psql -c "CREATE USER cn_kis WITH PASSWORD 'cn_kis_2026';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE cn_kis_audit OWNER cn_kis;" 2>/dev/null || echo "  数据库 cn_kis_audit 已存在"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cn_kis_audit TO cn_kis;" 2>/dev/null || true

if [ "$COPY_PROD_DATA" = "true" ]; then
  echo "  从生产库复制数据到 cn_kis_audit..."
  ( sudo -u postgres pg_dump -O cn_kis | sudo -u postgres psql -q cn_kis_audit ) 2>/dev/null || echo "  复制失败将使用空库继续"
fi

echo "  创建 .env（DB=cn_kis_audit, Redis DB 2）..."
cat > "$REMOTE_DIR/backend/.env" << 'ENV'
DB_NAME=cn_kis_audit
DB_USER=cn_kis
DB_PASSWORD=cn_kis_2026
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/2
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=118.196.64.48,localhost
DJANGO_SECRET_KEY=cn-kis-audit-secret-REPLACE_ME
CORS_ORIGINS=http://118.196.64.48:8082
JWT_SECRET=cn-kis-audit-jwt-REPLACE_ME
ENV
# 替换随机密钥
SECRET=$(openssl rand -hex 16)
JWT=$(openssl rand -hex 16)
sed -i "s/cn-kis-audit-secret-REPLACE_ME/cn-kis-audit-secret-$SECRET/" "$REMOTE_DIR/backend/.env"
sed -i "s/cn-kis-audit-jwt-REPLACE_ME/cn-kis-audit-jwt-$JWT/" "$REMOTE_DIR/backend/.env"

if [ -f "$REMOTE_DIR/deploy/.env.volcengine.plan-a" ]; then
  grep -E '^FEISHU_|^ARK_|^KIMI_|^VOLCENGINE_|^REDIS_URL=' "$REMOTE_DIR/deploy/.env.volcengine.plan-a" >> "$REMOTE_DIR/backend/.env" 2>/dev/null || true
  # 强制试用实例使用 Redis DB 2
  grep -v '^REDIS_URL=' "$REMOTE_DIR/backend/.env" > "$REMOTE_DIR/backend/.env.tmp" 2>/dev/null || true
  echo "REDIS_URL=redis://127.0.0.1:6379/2" >> "$REMOTE_DIR/backend/.env.tmp"
  mv "$REMOTE_DIR/backend/.env.tmp" "$REMOTE_DIR/backend/.env"
fi

echo "  执行数据库迁移..."
export DJANGO_SETTINGS_MODULE=settings
python manage.py migrate --noinput 2>&1 | tail -15

echo "  初始化角色与权限（seed_roles）..."
python manage.py seed_roles 2>&1 | tail -5

mkdir -p "$REMOTE_DIR/backend/logs" "$REMOTE_DIR/backend/media"
echo "  服务器环境配置完成"
REMOTE_SCRIPT

# ---- Step 5: Nginx 试用实例（端口 8082） ----
echo ""
echo "[5/7] 配置 Nginx（端口 8082，仅试用实例）..."
$SSH_CMD "
set -e
REMOTE_DIR='$REMOTE_DIR'
WORKSTATION_LIST='$WORKSTATION_LIST'

# 静态文件
mkdir -p /var/www/cn-kis-audit
for app in \$WORKSTATION_LIST; do
  mkdir -p /var/www/cn-kis-audit/\$app
  cp -r \$REMOTE_DIR/frontend_dist/\$app/* /var/www/cn-kis-audit/\$app/ 2>/dev/null || true
done

# 试用实例 nginx 配置（独立文件，不改动生产 cn-kis.conf）
cp \$REMOTE_DIR/deploy/nginx-audit.conf /etc/nginx/sites-available/cn-kis-audit.conf
ln -sf /etc/nginx/sites-available/cn-kis-audit.conf /etc/nginx/sites-enabled/cn-kis-audit.conf
nginx -t
systemctl reload nginx
echo '  Nginx 试用实例 (8082) 配置完成'
"

# ---- Step 6: systemd 试用实例服务（8002） ----
echo ""
echo "[6/7] 配置并启动 cn-kis-audit-api (端口 8004)..."
$SSH_CMD << 'SERVICE_SCRIPT'
set -e
cat > /etc/systemd/system/cn-kis-audit-api.service << 'SVC'
[Unit]
Description=CN KIS V1.0 试用实例 API (资生堂审计)
After=network.target postgresql.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/cn-kis-audit/backend
Environment="PATH=/opt/cn-kis-audit/backend/venv/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/cn-kis-audit/backend/.env
ExecStart=/opt/cn-kis-audit/backend/venv/bin/gunicorn wsgi:application --bind 0.0.0.0:8004 --workers 2 --timeout 120 --access-logfile /opt/cn-kis-audit/backend/logs/access.log --error-logfile /opt/cn-kis-audit/backend/logs/error.log
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable cn-kis-audit-api
systemctl restart cn-kis-audit-api
sleep 3
systemctl status cn-kis-audit-api --no-pager | head -10
SERVICE_SCRIPT

# ---- Step 7: 冒烟测试 ----
echo ""
echo "[7/7] 冒烟测试（试用实例 8082）..."
AUDIT_CODE=$($SSH_CMD "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8082/api/v1/health" 2>/dev/null || echo "000")
if [ "$AUDIT_CODE" = "200" ]; then
  echo "  ✓ 试用实例 API 健康检查: HTTP 200"
else
  echo "  ✗ 试用实例 API: HTTP $AUDIT_CODE（请检查 cn-kis-audit-api 与 nginx）"
fi

echo ""
echo "========================================"
echo "  试用实例部署完成（生产未做任何修改）"
echo "  试用入口: http://118.196.64.48:8082/"
echo "  试用 API: http://118.196.64.48:8082/api/v1/docs"
echo "  生产入口: http://118.196.64.48/ （不变）"
echo "========================================"

rm -rf "$STAGING"
echo ""
