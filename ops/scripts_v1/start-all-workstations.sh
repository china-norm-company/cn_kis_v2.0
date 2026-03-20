#!/usr/bin/env bash
# 并行启动所有工作台 + 管理后台 + 绩效台 + 方案质量检查台（共 20 个开发服务）
# 用法：在项目根目录执行 ./scripts/start-all-workstations.sh 或 pnpm run dev:all
# 按 Ctrl+C 可结束本脚本；后台进程可能需手动结束（见下方「停止所有」）
# 方案质量检查台依赖：项目根目录执行 pip install -r requirements.txt（Flask/PyPDF2 等）

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[$(date +%H:%M:%S)] $*"; }

# 错峰启动，避免多个 pnpm 同时读 workspace 状态导致 "Unexpected end of JSON input"
_start() { pnpm dev:$1 & sleep 2; }

log "若之前运行过 dev:all，请先结束旧进程: pkill -f 'vite.*--port' 或关闭占用 3001-3019、5000 的终端"
log "正在启动 20 个工作台/管理后台/绩效台/方案质量检查台（每台间隔 2 秒，避免 pnpm 锁冲突）..."
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
_start perf-master
# 方案质量检查台（Flask，端口 5000；研究台「方案准备 → 方案质量检查」iframe 嵌入）
(cd "$ROOT" && python3 app.py) & sleep 2
pnpm dev:digital-workforce &  # 最后一个无需再 sleep

log "已启动。访问地址："
echo "  秘书台     http://localhost:3001/secretary/"
echo "  研究台     http://localhost:3002/research/"
echo "  质量台     http://localhost:3003/quality/"
echo "  财务台     http://localhost:3004/finance/"
echo "  人事台     http://localhost:3005/hr/"
echo "  客户台     http://localhost:3006/crm/"
echo "  执行台     http://localhost:3007/execution/"
echo "  管理后台   http://localhost:3008/   (开发模式为根路径，生产为 /admin/)"
echo "  招募台     http://localhost:3009/recruitment/"
echo "  设备台     http://localhost:3010/equipment/"
echo "  物料台     http://localhost:3011/material/"
echo "  设施台     http://localhost:3012/facility/"
echo "  评估台     http://localhost:3013/evaluator/"
echo "  伦理台     http://localhost:3014/ethics/"
echo "  人员台     http://localhost:3015/lab-personnel/"
echo "  接待台     http://localhost:3016/reception/"
echo "  统管台     http://localhost:3017/control-plane/"
echo "  绩效台     http://localhost:3019/  （研究台「绩效结算」页内嵌）"
echo "  数字员工   http://localhost:3018/digital-workforce/"
echo "  方案质量检查台 http://localhost:5000/  （研究台「方案准备 → 方案质量检查」页内嵌）"
echo ""
log "按 Ctrl+C 结束本脚本。停止所有 Vite 进程: pkill -f 'vite.*--port'；方案检查台: pkill -f 'app.py' 或关闭本终端。"

wait
