#!/usr/bin/env bash
set -euo pipefail

echo "[1/5] 确认目标目录..."
if [ ! -d "/opt/cn-kis/backend" ]; then
  echo "缺少 /opt/cn-kis/backend，请先部署后端。"
  exit 1
fi

echo "[2/5] 安装 systemd 单元..."
cp /opt/cn-kis/deploy/systemd/cn-kis-assistant-scheduler.service /etc/systemd/system/
cp /opt/cn-kis/deploy/systemd/cn-kis-assistant-scheduler.timer /etc/systemd/system/

echo "[3/5] 安装 logrotate..."
cp /opt/cn-kis/deploy/logrotate/cn-kis-assistant-scheduler /etc/logrotate.d/cn-kis-assistant-scheduler

echo "[4/5] 重新加载并启动定时器..."
systemctl daemon-reload
systemctl enable cn-kis-assistant-scheduler.timer
systemctl restart cn-kis-assistant-scheduler.timer

echo "[5/5] 输出状态..."
systemctl status cn-kis-assistant-scheduler.timer --no-pager | head -20 || true
systemctl list-timers --all | grep cn-kis-assistant-scheduler || true

echo "安装完成。可手动触发一次："
echo "  systemctl start cn-kis-assistant-scheduler.service"
