#!/bin/bash
# 测试环境隔离验证脚本 — CN KIS V2.0
# 
# 用法：
#   bash ops/scripts/verify_env_isolation.sh [.env 文件路径]
#   bash ops/scripts/verify_env_isolation.sh backend/.env
#
# 在每次测试环境部署前执行，确认无生产配置泄漏。

set -e

ENV_FILE="${1:-backend/.env}"
ERRORS=0

echo "=== CN KIS V2.0 测试环境隔离验证 ==="
echo "检查文件：$ENV_FILE"
echo ""

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ 文件不存在：$ENV_FILE"
    exit 1
fi

# 1. 生产采集任务必须禁用
if ! grep -q "CELERY_PRODUCTION_TASKS_DISABLED=true" "$ENV_FILE"; then
    echo "❌ CELERY_PRODUCTION_TASKS_DISABLED=true 未配置（测试环境必须禁用生产采集任务）"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ CELERY_PRODUCTION_TASKS_DISABLED=true 已配置"
fi

# 2. 不得使用生产飞书主 App ID
if grep -q "cli_a98b0babd020500e" "$ENV_FILE"; then
    echo "❌ 检测到生产飞书 App ID（cli_a98b0babd020500e）！测试环境禁止使用生产凭证！"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ 未使用生产飞书 App ID"
fi

# 3. 不得连接生产服务器 IP
if grep -q "118.196.64.48" "$ENV_FILE"; then
    echo "❌ 检测到生产服务器 IP（118.196.64.48）！测试环境禁止连接生产数据库！"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ 未配置生产服务器 IP"
fi

# 4. 知识资产写入保护
if grep -q "KNOWLEDGE_WRITE_ENABLED=true" "$ENV_FILE"; then
    echo "⚠️  KNOWLEDGE_WRITE_ENABLED=true（警告：测试环境通常应为 false，确认是否有意为之）"
else
    echo "✅ 知识资产写入未启用（只读保护生效）"
fi

# 5. 数据库不得为空
if ! grep -q "DATABASE_URL=" "$ENV_FILE"; then
    echo "❌ DATABASE_URL 未配置"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ DATABASE_URL 已配置"
fi

# 6. ENVIRONMENT 应为 test
if grep -q "ENVIRONMENT=production" "$ENV_FILE"; then
    echo "❌ ENVIRONMENT=production 不应在测试环境出现"
    ERRORS=$((ERRORS + 1))
elif grep -q "ENVIRONMENT=test" "$ENV_FILE" || ! grep -q "ENVIRONMENT=" "$ENV_FILE"; then
    echo "✅ ENVIRONMENT 不是 production"
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✅ 测试环境隔离验证通过（$ERRORS 个问题）"
    exit 0
else
    echo "❌ 发现 $ERRORS 个问题，请修复后再部署！"
    exit 1
fi
