#!/usr/bin/env bash
# CN KIS V2.0 - 阿里云测试服务器首次初始化脚本
# 在服务器上执行（已克隆仓库后运行，或由 CI 触发）
# 用途：创建 V2 专用 PostgreSQL 数据库、配置 pgvector、运行 migrate
set -euo pipefail

echo "================================================================"
echo "  CN KIS V2.0 - 阿里云测试环境初始化"
echo "================================================================"
echo ""

REPO_DIR="/home/wuxianyu/cn_kis_v2"
BACKEND_DIR="$REPO_DIR/backend"

# ---------------------------------------------------------------------------
# Step 1: 检查 .env 已就绪
# ---------------------------------------------------------------------------
echo "🔍 Step 1: 检查 backend/.env..."
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "❌ $BACKEND_DIR/.env 不存在"
    echo "   请先上传 .env 文件（或运行 CI 流程让它通过 BACKEND_DOT_ENV Secret 注入）"
    exit 1
fi

# 读取 .env 变量
set -a
source "$BACKEND_DIR/.env"
set +a

echo "✅ .env 已加载"
echo "   DB_NAME=$DB_NAME"
echo "   DB_HOST=$DB_HOST"

# ---------------------------------------------------------------------------
# Step 2: 创建 V2 专用数据库（如果不存在）
# ---------------------------------------------------------------------------
echo ""
echo "🗄️  Step 2: 创建 PostgreSQL 数据库 $DB_NAME..."

# 检查数据库是否已存在
DB_EXISTS=$(psql -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" = "1" ]; then
    echo "   ℹ️  数据库 $DB_NAME 已存在，跳过创建"
else
    echo "   Creating database $DB_NAME and user $DB_USER..."
    psql -U postgres -h 127.0.0.1 <<PSQL_EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
PSQL_EOF
    echo "   ✅ 数据库 $DB_NAME 已创建"
fi

# Step 2b: 创建 pgvector 扩展
echo "   Installing pgvector extension in $DB_NAME..."
psql -U postgres -h 127.0.0.1 -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || echo "   ℹ️  pgvector already exists or not available"

# ---------------------------------------------------------------------------
# Step 3: 构建 Docker 镜像（如果没有运行中的 V2 容器）
# ---------------------------------------------------------------------------
echo ""
echo "🐳 Step 3: 构建 V2 后端 Docker 镜像..."
cd "$REPO_DIR"
chmod +x build_backend_image_only_under_root_path.sh
bash build_backend_image_only_under_root_path.sh

# ---------------------------------------------------------------------------
# Step 4: 运行 Django migrations（在新容器中）
# ---------------------------------------------------------------------------
echo ""
echo "📊 Step 4: 运行 Django migrations..."
CONTAINER_ID=$(docker ps -q --filter "publish=9001" | head -1)
if [ -z "$CONTAINER_ID" ]; then
    echo "❌ 找不到运行中的 V2 容器"
    exit 1
fi

docker exec "$CONTAINER_ID" python manage.py migrate --noinput
echo "✅ Migrations 完成"

# ---------------------------------------------------------------------------
# Step 5: 健康检查
# ---------------------------------------------------------------------------
echo ""
echo "🩺 Step 5: 健康检查..."
sleep 3
if curl -sf http://localhost:9001/api/v1/health > /dev/null; then
    HEALTH=$(curl -s http://localhost:9001/api/v1/health)
    echo "✅ 健康检查通过："
    echo "   $HEALTH"
else
    echo "⚠️  健康检查失败，查看容器日志："
    docker logs "$CONTAINER_ID" --tail 40
    exit 1
fi

echo ""
echo "================================================================"
echo "  🎉 V2 测试环境初始化完成！"
echo "  服务地址：http://test-guide.data-infact.com:9001"
echo "  健康检查：http://test-guide.data-infact.com:9001/api/v1/health"
echo "================================================================"
