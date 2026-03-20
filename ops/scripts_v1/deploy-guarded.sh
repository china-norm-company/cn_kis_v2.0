#!/usr/bin/env bash
# deploy-guarded.sh
# 作用：
# 1) 上传并应用 Nginx 配置
# 2) 配置关键字守卫（缺少关键 location 直接失败）
# 3) nginx -t 校验
# 4) 健康检查（research/perf-master）
# 5) 失败自动回滚

set -euo pipefail

# ====== 可配置项 ======
SSH_HOST="${SSH_HOST:-118.196.64.48}"
SSH_USER="${SSH_USER:-root}"
SSH_PASS="${SSH_PASS:-}"                      # 推荐从环境变量注入，不要写死
REMOTE_CONF="${REMOTE_CONF:-/etc/nginx/sites-available/china-norm-https.conf}"
SERVICE_NAME="${SERVICE_NAME:-nginx}"

# 本地待发布配置（你仓库中的唯一真源）
LOCAL_CONF="${LOCAL_CONF:-./deploy/nginx/china-norm-https.conf}"

# 健康检查 URL
CHECK_URLS=(
  "https://china-norm.com/research/"
  "https://china-norm.com/perf-master/"
)

# 页面关键字检查（标题）
EXPECT_RESEARCH_TITLE="采苓·研究台 - CN KIS"
EXPECT_PERF_TITLE="研究绩效计算平台"

# ====== 依赖检查 ======
command -v sshpass >/dev/null 2>&1 || { echo "[ERROR] 需要 sshpass"; exit 1; }
command -v curl    >/dev/null 2>&1 || { echo "[ERROR] 需要 curl";    exit 1; }
[ -n "$SSH_PASS" ] || { echo "[ERROR] 请设置 SSH_PASS 环境变量"; exit 1; }
[ -f "$LOCAL_CONF" ] || { echo "[ERROR] 本地配置不存在: $LOCAL_CONF"; exit 1; }

SSH="sshpass -p $SSH_PASS ssh -o StrictHostKeyChecking=no ${SSH_USER}@${SSH_HOST}"
SCP="sshpass -p $SSH_PASS scp -o StrictHostKeyChecking=no"

# ====== 关键字守卫（本地）======
echo "[INFO] 本地配置关键字校验..."
required_patterns=(
  "location /research"
  "location /perf-master"
  "location ^~ /research/assets/"
  "location /api"
)
for p in "${required_patterns[@]}"; do
  if ! grep -Fq "$p" "$LOCAL_CONF"; then
    echo "[ERROR] 配置缺少关键项: $p"
    exit 1
  fi
done
echo "[OK] 本地关键字校验通过"

# ====== 远端备份 ======
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP="${REMOTE_CONF}.bak_${TS}"
echo "[INFO] 备份远端配置 -> $BACKUP"
$SSH "cp '$REMOTE_CONF' '$BACKUP'"

# ====== 上传配置 ======
echo "[INFO] 上传新配置..."
$SCP "$LOCAL_CONF" "${SSH_USER}@${SSH_HOST}:${REMOTE_CONF}"

# ====== nginx 配置测试 ======
echo "[INFO] 执行 nginx -t..."
if ! $SSH "nginx -t"; then
  echo "[ERROR] nginx -t 失败，回滚配置..."
  $SSH "cp '$BACKUP' '$REMOTE_CONF' && nginx -t && systemctl reload '$SERVICE_NAME'"
  echo "[ROLLBACK] 已回滚到 $BACKUP"
  exit 1
fi

# ====== 重载 ======
echo "[INFO] 重载 nginx..."
$SSH "systemctl reload '$SERVICE_NAME'"

# ====== 健康检查 ======
echo "[INFO] 健康检查..."
for u in "${CHECK_URLS[@]}"; do
  code="$(curl -s -o /dev/null -w "%{http_code}" "$u")"
  if [[ "$code" != "200" ]]; then
    echo "[ERROR] 健康检查失败: $u -> $code"
    echo "[INFO] 执行自动回滚..."
    $SSH "cp '$BACKUP' '$REMOTE_CONF' && nginx -t && systemctl reload '$SERVICE_NAME'"
    echo "[ROLLBACK] 已回滚到 $BACKUP"
    exit 1
  fi
  echo "[OK] $u -> $code"
done

# ====== 内容关键字检查 ======
echo "[INFO] 标题关键字检查..."
research_html="$(curl -s https://china-norm.com/research/)"
perf_html="$(curl -s https://china-norm.com/perf-master/)"

if [[ "$research_html" != *"$EXPECT_RESEARCH_TITLE"* ]]; then
  echo "[ERROR] research 标题不匹配，触发回滚"
  $SSH "cp '$BACKUP' '$REMOTE_CONF' && nginx -t && systemctl reload '$SERVICE_NAME'"
  echo "[ROLLBACK] 已回滚到 $BACKUP"
  exit 1
fi

if [[ "$perf_html" != *"$EXPECT_PERF_TITLE"* ]]; then
  echo "[ERROR] perf-master 标题不匹配，触发回滚"
  $SSH "cp '$BACKUP' '$REMOTE_CONF' && nginx -t && systemctl reload '$SERVICE_NAME'"
  echo "[ROLLBACK] 已回滚到 $BACKUP"
  exit 1
fi

echo "[OK] 发布成功，配置已生效"
echo "[INFO] 备份文件: $BACKUP"
