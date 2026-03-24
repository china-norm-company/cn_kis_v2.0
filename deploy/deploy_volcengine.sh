#!/bin/bash
# ============================================================================
# CN KIS V2.0 - 火山云 ECS 部署脚本
# 服务器默认: 118.196.64.48（可通过 deploy/secrets.env 覆盖）
#
# 工作台列表从 backend/configs/workstations.yaml 读取
# Nginx 使用 deploy/nginx.conf
#
# 方案检查台（Flask）：本仓库无根目录 app.py 时，请设置环境变量
#   PROTOCOL_QC_SOURCE_DIR=/path/to/cn_kis_v1.0
# ============================================================================
set -e

if [ "${ALLOW_LEGACY_SERVER_DEPLOY:-false}" != "true" ]; then
  echo "BLOCKED: 当前仓库小程序发布默认通道为「微信云托管」。"
  echo "该脚本属于遗留服务器部署链路，默认禁用。"
  echo "如需手动启用，请显式确认:"
  echo "  ALLOW_LEGACY_SERVER_DEPLOY=true bash deploy/deploy_volcengine.sh"
  exit 1
fi

# ---- 项目根目录：脚本位于 deploy/ 时，上级为仓库根 ----
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
if [ -n "$DEPLOY_WORKSTATIONS" ]; then
  WORKSTATIONS=$(echo "$DEPLOY_WORKSTATIONS" | tr ',' '\n' | tr -d ' ')
  echo "仅部署工作台: $DEPLOY_WORKSTATIONS"
else
  WORKSTATIONS=$(python3 -c "
import yaml
with open('backend/configs/workstations.yaml') as f:
    data = yaml.safe_load(f)
for ws in data['workstations']:
    print(ws['key'])
")
fi
WORKSTATION_COUNT=$(echo "$WORKSTATIONS" | wc -l | tr -d ' ')

echo "========================================"
echo "  CN KIS V2.0 部署到火山云"
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
if [ -f backend/celery_app.py ]; then
  cp backend/celery_app.py "$STAGING/backend/"
fi
if ls backend/urls_*.py >/dev/null 2>&1; then
  cp backend/urls_*.py "$STAGING/backend/"
fi
cp -r backend/apps/*/migrations "$STAGING/backend/" 2>/dev/null || true
if [ -d "backend/libs" ]; then
  cp -r backend/libs "$STAGING/backend/"
fi
if [ -d "backend/config" ]; then
  cp -r backend/config "$STAGING/backend/"
fi
if [ -d "backend/configs" ]; then
  cp -r backend/configs "$STAGING/backend/"
fi

# 前端构建产物（V2：workstations/<key>/dist）
echo "  复制前端构建产物..."
for app in $WORKSTATIONS; do
  mkdir -p "$STAGING/frontend_dist/$app"
  cp -r "workstations/$app/dist/"* "$STAGING/frontend_dist/$app/" 2>/dev/null || echo "  ($app 未构建)"
done

# 绩效台（若存在）
if [ -f "workstations/perf-master/index.html" ]; then
  mkdir -p "$STAGING/frontend_dist/perf-master"
  cp workstations/perf-master/index.html workstations/perf-master/login.html workstations/perf-master/chart.umd.min.js "$STAGING/frontend_dist/perf-master/" 2>/dev/null || true
  echo "  已包含 perf-master（绩效结算）"
elif [ -f "apps/perf-master/index.html" ]; then
  mkdir -p "$STAGING/frontend_dist/perf-master"
  cp apps/perf-master/index.html apps/perf-master/login.html apps/perf-master/chart.umd.min.js "$STAGING/frontend_dist/perf-master/" 2>/dev/null || true
  echo "  已包含 perf-master（绩效结算，来自 apps/）"
fi

# 方案质量检查台：PROTOCOL_QC_SOURCE_DIR 指向含 app.py 的目录（通常为 cn_kis_v1.0 根），或本仓库根目录自带 app.py
_pack_protocol_check_from_dir() {
  local SRC="$1"
  if [ ! -f "$SRC/app.py" ] || [ ! -f "$SRC/qc_engine.py" ]; then
    return 1
  fi
  mkdir -p "$STAGING/protocol_check"
  cp "$SRC/app.py" "$SRC/qc_engine.py" "$SRC/pdf_parser.py" "$SRC/feedback_db.py" "$SRC/requirements.txt" "$STAGING/protocol_check/"
  cp -r "$SRC/templates" "$STAGING/protocol_check/"
  mkdir -p "$STAGING/protocol_check/.cursor/skills"
  if [ -d "$SRC/.cursor/skills" ]; then
    cp -r "$SRC/.cursor/skills/复硕词典" "$SRC/.cursor/skills/005-protocol-qc" "$SRC/.cursor/skills/047-protocol-qc" "$SRC/.cursor/skills/076-protocol-qc" "$SRC/.cursor/skills/104-protocol-qc" "$SRC/.cursor/skills/common-protocol-qc" "$SRC/.cursor/skills/fushu-std-protocol-qc" "$STAGING/protocol_check/.cursor/skills/" 2>/dev/null || true
  fi
  [ -f "$SRC/.env.example" ] && cp "$SRC/.env.example" "$STAGING/protocol_check/"
  echo "  已包含 protocol-check（方案质量检查台，来源: $SRC）"
  return 0
}

if [ -n "${PROTOCOL_QC_SOURCE_DIR:-}" ] && _pack_protocol_check_from_dir "${PROTOCOL_QC_SOURCE_DIR}"; then
  :
elif _pack_protocol_check_from_dir "$DEPLOY_DIR"; then
  :
else
  echo ""
  echo "  ⚠ 未打包方案检查台：请设置 PROTOCOL_QC_SOURCE_DIR 为 cn_kis_v1.0 仓库根目录（含 app.py、qc_engine.py、templates、.cursor/skills），"
  echo "    或在 V2 仓库根放置完整方案检查台文件。部署后 /protocol-qc/ 将不可用，直至手动部署该服务。"
  echo ""
fi

# 部署配置
echo "  复制部署配置..."
cp -r deploy "$STAGING/"

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
DJANGO_ALLOWED_HOSTS=118.196.64.48,localhost,www.utest.cc,utest.cc,.china-norm.com
DJANGO_SECRET_KEY=cn-kis-prod-secret-$(openssl rand -hex 16)
CORS_ORIGINS=http://118.196.64.48
JWT_SECRET=cn-kis-jwt-secret-$(openssl rand -hex 16)
REDIS_URL=redis://127.0.0.1:6379/0
WECHAT_APPID=wxf4ed2ed0eb687e31
WECHAT_SECRET=88b03ef9b4e96725cf57b5591fb855f1
ENV

if [ -f "$REMOTE_DIR/deploy/.env.volcengine.plan-a" ]; then
  # 飞书 / 模型 / Redis 等从 plan-a 追加（微信见上方 heredoc，不依赖 plan-a）
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

# ---- Step 5: 配置 Nginx ----
echo ""
echo "[5/7] 配置 Nginx..."

WORKSTATION_LIST=$(echo "$WORKSTATIONS" | tr '\n' ' ')

$SSH_CMD "
set -e
REMOTE_DIR='/opt/cn-kis'

for app in $WORKSTATION_LIST; do
  mkdir -p /var/www/cn-kis/\$app
  cp -r \$REMOTE_DIR/frontend_dist/\$app/* /var/www/cn-kis/\$app/ 2>/dev/null || true
done
if [ -d \$REMOTE_DIR/frontend_dist/perf-master ]; then
  mkdir -p /var/www/cn-kis/perf-master
  cp -r \$REMOTE_DIR/frontend_dist/perf-master/* /var/www/cn-kis/perf-master/ 2>/dev/null || true
  echo '  perf-master 已部署'
fi

cp \$REMOTE_DIR/deploy/nginx.conf /etc/nginx/sites-available/cn-kis.conf
rm -f /etc/nginx/sites-enabled/cn-kis.conf.bak* 2>/dev/null || true
sed -i 's/server_name localhost;/server_name 118.196.64.48 mini.utest.cc mini.china-norm.com;/' /etc/nginx/sites-available/cn-kis.conf
sed -i '/charset utf-8;/a\    access_log /var/log/nginx/cn-kis-access.log;\n    error_log /var/log/nginx/cn-kis-error.log;' /etc/nginx/sites-available/cn-kis.conf

cp \$REMOTE_DIR/deploy/nginx-mini-ssl.conf /etc/nginx/sites-available/cn-kis-mini-ssl.conf
if [ -f /etc/letsencrypt/live/mini.utest.cc/fullchain.pem ]; then
  ln -sf /etc/nginx/sites-available/cn-kis-mini-ssl.conf /etc/nginx/sites-enabled/cn-kis-mini-ssl.conf
  echo '  mini.utest.cc HTTPS (443) 已启用'
else
  rm -f /etc/nginx/sites-enabled/cn-kis-mini-ssl.conf 2>/dev/null || true
  echo '  跳过 mini.utest.cc HTTPS：未找到证书'
fi

cp \$REMOTE_DIR/deploy/nginx-utest-ssl.conf /etc/nginx/sites-available/cn-kis-utest-ssl.conf
if [ -f /etc/nginx/ssl/utest.cc/fullchain.pem ]; then
  ln -sf /etc/nginx/sites-available/cn-kis-utest-ssl.conf /etc/nginx/sites-enabled/cn-kis-utest-ssl.conf
  echo '  www.utest.cc / utest.cc HTTPS (443) 已启用'
else
  rm -f /etc/nginx/sites-enabled/cn-kis-utest-ssl.conf 2>/dev/null || true
  echo '  跳过 www.utest.cc HTTPS：未找到 /etc/nginx/ssl/utest.cc/fullchain.pem'
fi

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

# ---- Step 6: systemd ----
echo ""
echo "[6/7] 配置并启动服务..."
$SSH_CMD << 'SERVICE_SCRIPT'
set -e
REMOTE_DIR="/opt/cn-kis"

cat > /etc/systemd/system/cn-kis-api.service << SERVICE
[Unit]
Description=CN KIS V2.0 API (Django Ninja)
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

if [ -d "$REMOTE_DIR/protocol_check" ]; then
  PROTOCOL_CHECK_DIR="/opt/protocol-check"
  mkdir -p "$PROTOCOL_CHECK_DIR"
  cp -r "$REMOTE_DIR/protocol_check"/* "$PROTOCOL_CHECK_DIR/" 2>/dev/null || true
  if [ -f "$PROTOCOL_CHECK_DIR/.env" ]; then
    :
  elif [ -f "$PROTOCOL_CHECK_DIR/.env.example" ]; then
    cp "$PROTOCOL_CHECK_DIR/.env.example" "$PROTOCOL_CHECK_DIR/.env"
    echo "RESEARCH_BACKEND_URL=http://127.0.0.1:8001" >> "$PROTOCOL_CHECK_DIR/.env"
    echo "PROTOCOL_QC_REQUIRE_AUTH=1" >> "$PROTOCOL_CHECK_DIR/.env"
  fi
  mkdir -p "$PROTOCOL_CHECK_DIR/instance" "$PROTOCOL_CHECK_DIR/uploads"
  cd "$PROTOCOL_CHECK_DIR"
  python3 -m venv venv 2>/dev/null || true
  source venv/bin/activate
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --default-timeout=120
  cat > /etc/systemd/system/protocol-check.service << PROTOCOL_SVC
[Unit]
Description=Protocol Quality Check - Flask on port 5000
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROTOCOL_CHECK_DIR
Environment="PATH=$PROTOCOL_CHECK_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=$PROTOCOL_CHECK_DIR/.env
ExecStart=$PROTOCOL_CHECK_DIR/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 --timeout 180 app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
PROTOCOL_SVC
  systemctl daemon-reload
  systemctl enable protocol-check
  systemctl restart protocol-check
  sleep 2
  HTTP_QC=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/ || echo "000")
  if [ "$HTTP_QC" = "200" ]; then
    echo '  protocol-check 已启动 HTTP 200'
  else
    echo "  protocol-check 启动后 HTTP $HTTP_QC，请检查 journalctl -u protocol-check -f"
  fi
fi
SERVICE_SCRIPT

# ---- Step 7: 冒烟 ----
echo ""
echo "[7/7] 部署后冒烟测试..."
SMOKE_FAIL=0

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

HAS_QC=$($SSH_CMD "test -d /opt/cn-kis/protocol_check && echo 1 || echo 0")
if [ "$HAS_QC" = "1" ]; then
  QC_HTTP=$($SSH_CMD "curl -k -s -o /dev/null -w '%{http_code}' -L http://localhost/protocol-qc/ || true")
  if [ "$QC_HTTP" = "200" ] || [ "$QC_HTTP" = "301" ] || [ "$QC_HTTP" = "302" ]; then
    echo "  ✓ protocol-qc（方案质量检查）: HTTP $QC_HTTP"
  else
    echo "  ✗ protocol-qc（方案质量检查）: HTTP $QC_HTTP — 若 502 请检查 protocol-check 服务"
    SMOKE_FAIL=1
  fi
else
  echo "  ⚠ 跳过 protocol-qc HTTP 检查（本次未打包 protocol_check）"
fi

HAS_PERF=$($SSH_CMD "test -d /var/www/cn-kis/perf-master && echo 1 || echo 0")
if [ "$HAS_PERF" = "1" ]; then
  PERF_HTTP=$($SSH_CMD "curl -k -s -o /dev/null -w '%{http_code}' -L http://localhost/perf-master/ || true")
  PERF_BODY=$($SSH_CMD "curl -k -s -L http://localhost/perf-master/ 2>/dev/null | head -c 2000 || true")
  if [ "$PERF_HTTP" = "200" ] || [ "$PERF_HTTP" = "301" ] || [ "$PERF_HTTP" = "302" ]; then
    if echo "$PERF_BODY" | grep -q "研究绩效计算平台"; then
      echo "  ✓ perf-master（绩效结算）: HTTP $PERF_HTTP，内容正确"
    else
      echo "  ⚠ perf-master: HTTP $PERF_HTTP 但页面可能非绩效台，请人工确认"
      SMOKE_FAIL=1
    fi
  else
    echo "  ✗ perf-master（绩效结算）: HTTP $PERF_HTTP"
    SMOKE_FAIL=1
  fi
else
  echo "  ⚠ 跳过 perf-master 检查（本次未部署 perf-master 静态资源）"
fi

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
echo "  API:      http://118.196.64.48/api/v1/docs"
echo "  方案质量检查: http://118.196.64.48/protocol-qc/"
echo "  绩效结算:     http://118.196.64.48/perf-master/"
echo "========================================"

# ---- Step 8: 线上认证体检 ----
echo ""
echo "[8/8] 线上认证链路完整性体检..."
AUTH_SCRIPT="$DEPLOY_DIR/ops/scripts_v1/check_prod_auth_integrity.sh"
if [ -f "$AUTH_SCRIPT" ]; then
  if bash "$AUTH_SCRIPT"; then
    echo "  ✓ 线上认证链路体检通过"
  else
    echo "  ✗ 线上认证链路体检失败，请立即排查（可通过 SSH_KEY / SSH_HOST / BASE_URL 环境变量配置）"
    exit 1
  fi
else
  echo "  ⚠ 跳过：未找到 ops/scripts_v1/check_prod_auth_integrity.sh"
fi

rm -rf "$STAGING"
echo ""
echo "部署完成！"
