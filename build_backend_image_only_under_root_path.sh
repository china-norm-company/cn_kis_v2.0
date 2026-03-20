#!/usr/bin/env bash
# CN KIS V2.0 - Aliyun 测试环境后端部署脚本
# 用法：在服务器根目录 /home/wuxianyu/cn_kis_v2 下执行
# 前提：backend/.env 已由 CI 从 BACKEND_DOT_ENV secret 注入
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/backend"

# .env 由 CI 从 GitHub Secret BACKEND_DOT_ENV 注入
if [ ! -f .env ]; then
    echo "ERROR: backend/.env not found. In CI, ensure BACKEND_DOT_ENV secret is set." >&2
    exit 1
fi
echo "✅ Using .env (from BACKEND_DOT_ENV secret)"

# 验证测试环境安全开关（防止误部署生产配置）
if ! grep -q "CELERY_PRODUCTION_TASKS_DISABLED=true" .env; then
    echo "❌ ERROR: CELERY_PRODUCTION_TASKS_DISABLED=true is missing from .env"
    echo "   This is required for test environment isolation (V2 Migration Charter Redline 4)"
    exit 1
fi
echo "✅ Safety check passed: CELERY_PRODUCTION_TASKS_DISABLED=true"

# 构建 Docker 镜像（带时间戳 tag）
TAG="cn-kis-v2-backend:$(date +%m%d%H%M)"
echo "🔨 Building image $TAG..."
docker build -t "$TAG" .
echo "✅ Built image $TAG"

# 停止旧容器（占用 9001 端口的）
CONTAINER_ID=$(docker ps -q --filter "publish=9001")
if [ -n "$CONTAINER_ID" ]; then
    echo "🛑 Stopping container(s) on port 9001: $CONTAINER_ID"
    docker stop $CONTAINER_ID
    sleep 2
fi

# 启动新容器
CONTAINER_NAME="cn-kis-v2-backend_$(date +%m%d%H%M)"
docker run -d \
    -p 9001:8001 \
    --add-host=host.docker.internal:host-gateway \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    "$TAG"

echo "✅ Started container $CONTAINER_NAME on port 9001"
echo "🔍 Waiting 5s for container to start..."
sleep 5

# 健康检查
echo "🩺 Health check..."
if curl -sf http://localhost:9001/api/v1/health > /dev/null; then
    echo "✅ Health check passed!"
else
    echo "⚠️  Health check failed. Checking logs..."
    docker logs "$CONTAINER_NAME" --tail 50
    exit 1
fi

echo ""
echo "🎉 V2 backend deployed successfully!"
echo "   Container: $CONTAINER_NAME"
echo "   Port: 9001"
echo "   Tag: $TAG"
