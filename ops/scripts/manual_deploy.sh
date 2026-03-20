#!/usr/bin/env bash
# CN KIS V2.0 - 服务器端手动部署脚本
# 在阿里云服务器上直接运行（通过 SSH 连接后执行）
# 无需 GitHub Actions

set -euo pipefail

REPO_URL="https://github.com/china-norm-company/cn_kis_v2.0.git"
DEPLOY_DIR="/home/wuxianyu/cn_kis_v2"
BRANCH="${1:-main}"

echo "================================================================"
echo "  CN KIS V2.0 手动部署脚本"
echo "  分支: $BRANCH"
echo "  目标: $DEPLOY_DIR"
echo "================================================================"
echo ""

# Step 1: 克隆或更新仓库
echo "📥 Step 1: 同步代码..."
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo "  更新已有仓库..."
    cd "$DEPLOY_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git reset --hard "origin/$BRANCH"
    git pull origin "$BRANCH"
else
    echo "  首次克隆..."
    mkdir -p "$(dirname $DEPLOY_DIR)"
    git clone --branch "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
fi
echo "✅ 代码已同步到 $(git rev-parse --short HEAD)"

# Step 2: 检查 .env 文件
echo ""
echo "🔑 Step 2: 检查 .env..."
if [ ! -f "$DEPLOY_DIR/backend/.env" ]; then
    echo "❌ backend/.env 不存在！"
    echo "   请先创建 .env 文件："
    echo "   参考: $DEPLOY_DIR/backend/.env.test.example"
    echo "   命令: cp $DEPLOY_DIR/backend/.env.test.example $DEPLOY_DIR/backend/.env"
    echo "         nano $DEPLOY_DIR/backend/.env  # 填入实际值"
    exit 1
fi
echo "✅ .env 已存在"

# Step 3: 构建并部署
echo ""
echo "🚀 Step 3: 构建并启动 Docker 容器..."
cd "$DEPLOY_DIR"
chmod +x build_backend_image_only_under_root_path.sh
bash build_backend_image_only_under_root_path.sh

# Step 4: 等待容器就绪后运行 migrate
echo ""
echo "📊 Step 4: 等待容器就绪并运行 migrations..."
sleep 8
CONTAINER_ID=$(docker ps -q --filter "publish=9001" | head -1)
if [ -n "$CONTAINER_ID" ]; then
    echo "  容器 ID: $CONTAINER_ID"
    docker exec "$CONTAINER_ID" python manage.py migrate --noinput
    echo "✅ Migrations 完成"
else
    echo "⚠️  容器未启动，跳过 migration（可稍后手动运行）"
fi

# Step 5: 健康检查
echo ""
echo "🩺 Step 5: 健康检查..."
sleep 3
HEALTH=$(curl -sf http://localhost:9001/api/v1/health 2>/dev/null || echo "FAIL")
if [[ "$HEALTH" == *"healthy"* ]]; then
    echo "✅ 健康检查通过: $HEALTH"
else
    echo "⚠️  健康检查失败，查看日志："
    docker logs "$CONTAINER_ID" --tail 30 2>/dev/null || true
fi

echo ""
echo "================================================================"
echo "  部署完成！"
echo "  健康检查: curl http://test-guide.data-infact.com:9001/api/v1/health"
echo "================================================================"
