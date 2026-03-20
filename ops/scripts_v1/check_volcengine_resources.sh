#!/bin/bash
# 火山云服务器资源监控 — 用于飞书全量采集期间
# 检查 CPU 负载、内存、磁盘、采集进程与 DB 占用；资源不足时退出非 0 并打印告警。
#
# 用法：
#   在服务器上：/opt/cn-kis/scripts/check_volcengine_resources.sh
#   或本机通过 SSH：ssh root@118.196.64.48 /opt/cn-kis/scripts/check_volcengine_resources.sh
#   或本机拉取检查：./scripts/check_volcengine_resources.sh   # 会 source deploy/secrets.env 并 SSH
#
# 退出码：0=正常 1=告警(WARN) 2=严重(CRIT)

set -e

# 阈值（可环境变量覆盖）
LOAD_WARN="${VOLCENGINE_LOAD_WARN:-4}"
LOAD_CRIT="${VOLCENGINE_LOAD_CRIT:-8}"
MEM_AVAIL_WARN_MB="${VOLCENGINE_MEM_WARN_MB:-2048}"
MEM_AVAIL_CRIT_MB="${VOLCENGINE_MEM_CRIT_MB:-1024}"
DISK_PCT_WARN="${VOLCENGINE_DISK_WARN_PCT:-85}"
DISK_PCT_CRIT="${VOLCENGINE_DISK_CRIT_PCT:-95}"
MEDIA_DISK_WARN_PCT="${VOLCENGINE_MEDIA_DISK_WARN_PCT:-90}"

EXIT=0
ALERTS=()

# 在服务器上执行的实际检查逻辑
run_checks() {
  echo "=== 火山云资源检查 $(date -Iseconds) ==="

  local backend_root="${BACKEND_ROOT:-/opt/cn-kis/backend}"
  local backend_env="$backend_root/.env"
  if [ -f "$backend_env" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$backend_env"
    set +a
  fi

  local storage_root="${STORAGE_ROOT:-/data}"
  local media_root="${MEDIA_ROOT:-$storage_root/media}"
  local log_root="${LOG_DIR:-$storage_root/logs}"
  echo "backend_root=${backend_root}"
  echo "media_root=${media_root}"
  echo "log_root=${log_root}"

  # 1) 负载
  local load1 load5 load15
  read -r load1 load5 load15 _ < /proc/loadavg
  local cpus
  cpus=$(nproc 2>/dev/null || echo 2)
  echo "load_avg_1m=${load1} load_avg_5m=${load5} load_avg_15m=${load15} cpus=${cpus}"

  if awk -v l="$load1" -v c="$LOAD_CRIT" 'BEGIN { exit (l >= c) ? 0 : 1 }'; then
    ALERTS+=("CRIT: 负载过高 load1=${load1} >= ${LOAD_CRIT}")
    EXIT=2
  elif awk -v l="$load1" -v w="$LOAD_WARN" 'BEGIN { exit (l >= w) ? 0 : 1 }'; then
    ALERTS+=("WARN: 负载偏高 load1=${load1} >= ${LOAD_WARN}")
    [ "$EXIT" -lt 1 ] && EXIT=1
  fi

  # 2) 内存 (available)
  local mem_avail_kb
  mem_avail_kb=$(awk '/MemAvailable:/ { print $2 }' /proc/meminfo)
  local mem_avail_mb=$((mem_avail_kb / 1024))
  local mem_total_kb
  mem_total_kb=$(awk '/MemTotal:/ { print $2 }' /proc/meminfo)
  local mem_total_mb=$((mem_total_kb / 1024))
  echo "mem_available_mb=${mem_avail_mb} mem_total_mb=${mem_total_mb}"

  if [ "$mem_avail_mb" -lt "$MEM_AVAIL_CRIT_MB" ]; then
    ALERTS+=("CRIT: 可用内存过低 ${mem_avail_mb}MB < ${MEM_AVAIL_CRIT_MB}MB")
    EXIT=2
  elif [ "$mem_avail_mb" -lt "$MEM_AVAIL_WARN_MB" ]; then
    ALERTS+=("WARN: 可用内存偏低 ${mem_avail_mb}MB < ${MEM_AVAIL_WARN_MB}MB")
    [ "$EXIT" -lt 1 ] && EXIT=1
  fi

  # 3a) 系统盘（根分区 /）
  local disk_pct
  disk_pct=$(df -P / | awk 'NR==2 { gsub(/%/,""); print $5 }')
  local disk_avail_gb
  disk_avail_gb=$(df -P / | awk 'NR==2 { print int($4/1024/1024) }')
  echo "disk_system_pct=${disk_pct}% disk_system_avail_gb=${disk_avail_gb}"

  if [ "$disk_pct" -ge "$DISK_PCT_CRIT" ]; then
    ALERTS+=("CRIT: 系统盘(/) ${disk_pct}% >= ${DISK_PCT_CRIT}%")
    EXIT=2
  elif [ "$disk_pct" -ge "$DISK_PCT_WARN" ]; then
    ALERTS+=("WARN: 系统盘(/) ${disk_pct}% >= ${DISK_PCT_WARN}%")
    [ "$EXIT" -lt 1 ] && EXIT=1
  fi

  # 3b) 数据盘（/data — PostgreSQL + media/feishu_files + qdrant 均在此盘）
  if mountpoint -q /data 2>/dev/null; then
    local data_pct
    data_pct=$(df -P /data | awk 'NR==2 { gsub(/%/,""); print $5 }')
    local data_avail_gb
    data_avail_gb=$(df -P /data | awk 'NR==2 { print int($4/1024/1024) }')
    echo "disk_data_pct=${data_pct}% disk_data_avail_gb=${data_avail_gb}"

    if [ "$data_pct" -ge "$DISK_PCT_CRIT" ]; then
      ALERTS+=("CRIT: 数据盘(/data) ${data_pct}% >= ${DISK_PCT_CRIT}% — PG+附件在此盘")
      EXIT=2
    elif [ "$data_pct" -ge "$DISK_PCT_WARN" ]; then
      ALERTS+=("WARN: 数据盘(/data) ${data_pct}% >= ${DISK_PCT_WARN}% — PG+附件在此盘")
      [ "$EXIT" -lt 1 ] && EXIT=1
    fi
  fi

  # 4) 采集进程与附件目录（若存在）
  local sweep_rss_mb=0
  local sweep_count
  sweep_count=$(pgrep -f "sweep_feishu_full_history" 2>/dev/null | wc -l)
  if [ "$sweep_count" -gt 0 ]; then
    # 取 Python 进程（含 venv）的 RSS，排除 bash 包装进程
    for pid in $(pgrep -f "venv/bin/python.*sweep_feishu_full_history" 2>/dev/null); do
      if [ -d "/proc/$pid" ]; then
        local rss
        rss=$(awk '/VmRSS:/ { print int($2/1024) }' "/proc/$pid/status" 2>/dev/null || echo 0)
        [ "${rss:-0}" -gt "$sweep_rss_mb" ] && sweep_rss_mb=$rss
      fi
    done
    [ "$sweep_rss_mb" -eq 0 ] && sweep_rss_mb=$(pgrep -f "sweep_feishu_full_history" | head -1 | xargs -I{} awk '/VmRSS:/ { print int($2/1024) }' /proc/{}/status 2>/dev/null || echo 0)
    echo "sweep_processes=${sweep_count} sweep_rss_mb=${sweep_rss_mb}"
  else
    echo "sweep_processes=0"
  fi

  # 附件与 PG 占用统计
  local media_path="${media_root}/feishu_files"
  if [ -d "$media_path" ]; then
    local media_mb
    media_mb=$(du -sm "$media_path" 2>/dev/null | cut -f1)
    echo "feishu_files_mb=${media_mb}"
  fi
  local pg_data_path="/data/postgresql"
  if [ -d "$pg_data_path" ]; then
    local pg_mb
    pg_mb=$(du -sm "$pg_data_path" 2>/dev/null | cut -f1)
    echo "pg_data_dir_mb=${pg_mb}"
  fi

  # 5) PostgreSQL 占用（可选，需能执行 psql）
  if command -v psql >/dev/null 2>&1; then
    local pg_size_gb
    pg_size_gb=$(sudo -u postgres psql -t -A -c "SELECT round(pg_database_size('cn_kis')/1024.0/1024/1024, 2);" 2>/dev/null || true)
    if [ -n "$pg_size_gb" ]; then
      echo "postgres_cn_kis_gb=${pg_size_gb}"
    fi
  fi

  if [ -d "$media_root" ]; then
    local media_pct
    media_pct=$(df -P "$media_root" | awk 'NR==2 { gsub(/%/,""); print $5 }')
    echo "media_disk_pct=${media_pct}%"
    if [ "$media_pct" -ge "$DISK_PCT_CRIT" ]; then
      ALERTS+=("CRIT: MEDIA_ROOT 所在磁盘 ${media_pct}% >= ${DISK_PCT_CRIT}% path=${media_root}")
      EXIT=2
    elif [ "$media_pct" -ge "$MEDIA_DISK_WARN_PCT" ]; then
      ALERTS+=("WARN: MEDIA_ROOT 所在磁盘 ${media_pct}% >= ${MEDIA_DISK_WARN_PCT}% path=${media_root}")
      [ "$EXIT" -lt 1 ] && EXIT=1
    fi
  fi

  # 输出告警
  if [ ${#ALERTS[@]} -gt 0 ]; then
    echo ""
    echo "--- 告警 ---"
    printf '%s\n' "${ALERTS[@]}"
    echo "---"
  else
    echo "资源正常"
  fi
}

# 若传入 --remote 则从本机 SSH 到服务器执行；否则假定在服务器上直接执行
if [ "${1:-}" = "--remote" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [ -f "$DEPLOY_DIR/deploy/secrets.env" ]; then
    set -a
    # shellcheck source=../deploy/secrets.env
    source "$DEPLOY_DIR/deploy/secrets.env"
    set +a
  fi
  SSH_HOST="${VOLCENGINE_SSH_HOST:-118.196.64.48}"
  SSH_USER="${VOLCENGINE_SSH_USER:-root}"
  SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
  if [ -n "${VOLCENGINE_SSH_KEY:-}" ] && [ -f "${VOLCENGINE_SSH_KEY}" ]; then
    SSH_OPTS="$SSH_OPTS -i $VOLCENGINE_SSH_KEY"
  fi
  REMOTE_SCRIPT="/tmp/check_volcengine_resources.sh"
  scp $SSH_OPTS "$0" "$SSH_USER@$SSH_HOST:$REMOTE_SCRIPT" 2>/dev/null || true
  ssh $SSH_OPTS "$SSH_USER@$SSH_HOST" "bash $REMOTE_SCRIPT"
  exit $?
fi

run_checks
exit $EXIT
