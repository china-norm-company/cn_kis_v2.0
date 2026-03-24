#!/usr/bin/env bash
# 并行启动 V2.0 全部工作台（18 个 Vite 开发服务）
# 用法：在项目根目录执行 pnpm run dev:all
# 与 v1 的 dev:all 相比：不包含 master-perf-static（绩效台）、根目录 Flask 方案质量检查（:5000）；若需要可从 cn_kis_v1.0 单独启动。
# 按 Ctrl+C 可结束本脚本；子进程可能仍在后台，见文末「停止」说明
# 错峰启动，避免多个 pnpm 同时读 workspace 状态导致 "Unexpected end of JSON input"

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[$(date +%H:%M:%S)] $*"; }

# 错峰启动，避免多个 pnpm 同时读 workspace 状态导致 "Unexpected end of JSON input"
_start() { pnpm dev:"$1" & sleep 2; }

log "若之前运行过 dev:all，请先结束旧进程: pkill -f 'vite.*--port' 或关闭占用 3001–3018 的终端"
log "正在启动 18 个工作台（每台间隔 2 秒，避免 pnpm 锁冲突）..."
_start secretary
_start research
_start quality
_start finance
_start hr
_start crm
_start execution
_start admin
_start recruitment
_start equipment
_start material
_start facility
_start evaluator
_start ethics
_start lab-personnel
_start reception
_start control-plane
pnpm dev:digital-workforce &

log "已启动。访问地址："
echo "  秘书台     http://localhost:3001/secretary/"
echo "  研究台     http://localhost:3002/research/"
echo "  质量台     http://localhost:3003/quality/"
echo "  财务台     http://localhost:3004/finance/"
echo "  人事台     http://localhost:3005/hr/"
echo "  客户台     http://localhost:3006/crm/"
echo "  执行台     http://localhost:3007/execution/"
echo "  治理台     http://localhost:3008/admin/"
echo "  招募台     http://localhost:3009/recruitment/"
echo "  设备台     http://localhost:3010/equipment/"
echo "  物料台     http://localhost:3011/material/"
echo "  设施台     http://localhost:3012/facility/"
echo "  评估台     http://localhost:3013/evaluator/"
echo "  伦理台     http://localhost:3014/ethics/"
echo "  人员台     http://localhost:3015/lab-personnel/"
echo "  接待台     http://localhost:3016/reception/"
echo "  统管台     http://localhost:3017/control-plane/"
echo "  数字员工   http://localhost:3018/digital-workforce/"
echo ""
log "后端 API 请另开终端: cd backend && python manage.py runserver 0.0.0.0:8001（或你配置的端口）"
log "按 Ctrl+C 结束本脚本。停止所有 Vite: pkill -f 'vite.*--port'"

wait
