#!/bin/bash
# PostgreSQL 自动备份脚本 — CN KIS V2.0
#
# 功能：
#   1. 每日全量 pg_dump（压缩格式 .dump.gz）
#   2. 自动清理超过 RETAIN_DAYS 天的旧备份
#   3. 将备份状态写入标志文件（供 API 读取）
#
# 部署方式（在服务器以 root 或 postgres 账户执行）：
#
#   chmod +x /opt/cn-kis-v2/ops/scripts/pg_backup.sh
#
#   # 添加 crontab（每日凌晨 2:30 执行）
#   crontab -e
#   30 2 * * * /opt/cn-kis-v2/ops/scripts/pg_backup.sh >> /var/log/cn-kis-pg-backup.log 2>&1
#
# 环境变量（可在 /etc/environment 或 crontab 中设置，有默认值）：
#   PG_HOST        PostgreSQL 主机（默认 localhost）
#   PG_PORT        端口（默认 5432）
#   PG_DB          数据库名（默认 cn_kis_v2）
#   PG_USER        连接用户（默认 postgres）
#   PGPASSWORD     密码（通过环境变量或 .pgpass 传入，不要硬编码）
#   BACKUP_DIR     备份存储目录（默认 /var/backups/cn-kis-pg）
#   RETAIN_DAYS    备份保留天数（默认 14 天）
#   STATUS_FILE    状态文件路径（供 backup/status API 读取）
#
set -euo pipefail

# ── 配置 ─────────────────────────────────────────────────────────────────────
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_DB="${PG_DB:-cn_kis_v2}"
PG_USER="${PG_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cn-kis-pg}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
STATUS_FILE="${STATUS_FILE:-/var/backups/cn-kis-pg/.backup_status.json}"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/${PG_DB}_${TIMESTAMP}.dump.gz"

# ── 初始化目录 ────────────────────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始备份 ${PG_DB}@${PG_HOST}:${PG_PORT}"

# ── 执行备份 ──────────────────────────────────────────────────────────────────
START_TS=$(date +%s)

if pg_dump \
    -h "${PG_HOST}" \
    -p "${PG_PORT}" \
    -U "${PG_USER}" \
    -Fc \
    --no-password \
    "${PG_DB}" \
    | gzip -9 > "${BACKUP_FILE}"; then

    END_TS=$(date +%s)
    ELAPSED=$((END_TS - START_TS))
    SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
    STATUS="ok"
    ERROR=""
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份成功：${BACKUP_FILE}（${SIZE}，耗时 ${ELAPSED}s）"
else
    END_TS=$(date +%s)
    STATUS="error"
    ERROR="pg_dump 失败，退出码 $?"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份失败：${ERROR}" >&2
    rm -f "${BACKUP_FILE}" 2>/dev/null || true
fi

# ── 清理旧备份 ────────────────────────────────────────────────────────────────
DELETED_COUNT=0
if [ "${STATUS}" = "ok" ]; then
    while IFS= read -r -d '' old_file; do
        rm -f "${old_file}"
        DELETED_COUNT=$((DELETED_COUNT + 1))
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 清理旧备份：${old_file}"
    done < <(find "${BACKUP_DIR}" -name "*.dump.gz" -mtime +${RETAIN_DAYS} -print0 2>/dev/null)
fi

# ── 统计当前备份数量 ──────────────────────────────────────────────────────────
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "*.dump.gz" 2>/dev/null | wc -l | tr -d ' ')
LATEST_FILE=$(find "${BACKUP_DIR}" -name "*.dump.gz" 2>/dev/null | sort | tail -1)
LATEST_SIZE=""
if [ -n "${LATEST_FILE}" ]; then
    LATEST_SIZE=$(du -sh "${LATEST_FILE}" 2>/dev/null | cut -f1 || echo "")
fi

# ── 写入状态文件（供 backup/status API 读取）──────────────────────────────────
cat > "${STATUS_FILE}" << EOF
{
  "status": "${STATUS}",
  "last_backup_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "last_backup_file": "${LATEST_FILE}",
  "last_backup_size": "${LATEST_SIZE}",
  "backup_count": ${BACKUP_COUNT},
  "retain_days": ${RETAIN_DAYS},
  "deleted_old": ${DELETED_COUNT},
  "elapsed_seconds": ${ELAPSED:-0},
  "error": "${ERROR}"
}
EOF

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 状态写入 ${STATUS_FILE}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 当前备份总数：${BACKUP_COUNT}"

# 备份失败时返回非零退出码（触发 crontab 邮件告警）
if [ "${STATUS}" != "ok" ]; then
    exit 1
fi
exit 0
