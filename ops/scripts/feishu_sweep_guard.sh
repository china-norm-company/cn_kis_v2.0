#!/usr/bin/env bash
# feishu_sweep_guard.sh — OS 级 flock 包装：防止同一类 sweep 任务叠跑
#
# 用法（替换 crontab 中原 python ... 调用）：
#   bash /data/cn-kis-app/ops/feishu_sweep_guard.sh incremental \
#       "manage.py sweep_feishu_incremental --lookback-hours 48"
#
# 参数：
#   $1  任务类型标识（incremental / full_history / weekly_deep / reconcile 等）
#   $2  实际命令（相对于 APP_DIR）
#
# 环境变量（可在 .env 或 crontab 行内设置）：
#   APP_DIR          应用目录（默认 /data/cn-kis-app）
#   VENV_BIN         虚拟环境 bin（默认 $APP_DIR/venv/bin）
#   LOCK_DIR         flock 文件存放目录（默认 /tmp）
#   MAX_LOCK_SECONDS 最长锁持有秒数（超过则视为僵死，watchdog 来 kill；guard 本身不 kill）

set -euo pipefail

TASK_TYPE="${1:-unknown}"
TASK_CMD="${2:-}"

APP_DIR="${APP_DIR:-/data/cn-kis-app}"
VENV_BIN="${VENV_BIN:-$APP_DIR/venv/bin}"
LOCK_DIR="${LOCK_DIR:-/tmp}"
LOCK_FILE="$LOCK_DIR/cn_kis_feishu_sweep_${TASK_TYPE}.lock"
LOG_FILE="${LOG_FILE:-/data/logs/feishu_${TASK_TYPE}.log}"

PYTHON="$VENV_BIN/python3 -u"
export PYTHONUNBUFFERED=1

if [[ -z "$TASK_CMD" ]]; then
    echo "[guard] ERROR: 未指定任务命令 (参数 \$2)" >&2
    exit 1
fi

# ── flock 非阻塞：抢不到锁说明同类任务还在跑，直接退出 ──
(
    flock -n 200 || {
        echo "[guard:$TASK_TYPE] $(date '+%F %T') 已有同类任务在运行（flock 占用），本次跳过" | tee -a "$LOG_FILE"
        exit 0
    }
    echo "[guard:$TASK_TYPE] $(date '+%F %T') 获得锁，开始执行: $TASK_CMD"
    cd "$APP_DIR"
    exec $PYTHON $TASK_CMD
) 200>"$LOCK_FILE"
