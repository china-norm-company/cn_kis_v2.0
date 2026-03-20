#!/bin/bash
# 真正的 headed E2E：启动招募前端（vite preview），在可见浏览器中运行 Playwright
# 用法: ./scripts/run_e2e_headed.sh
# 依赖: 根目录已 pnpm install（首次请运行 pnpm exec playwright install chromium）

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 确保 Chromium 已安装（首次运行会下载）
pnpm exec playwright install chromium 2>/dev/null || true

PREVIEW_PORT=4173
BASE_URL="http://localhost:${PREVIEW_PORT}"

# 避免端口占用导致 Playwright 连错端口
lsof -ti:${PREVIEW_PORT} | xargs kill -9 2>/dev/null || true
sleep 1

echo "=========================================="
echo "  E2E Headed：前端启动 + 浏览器可见"
echo "=========================================="
echo ""

echo ">>> [1/4] 构建招募工作台 (E2E 模式 base=/)"
E2E=1 pnpm run build:recruitment
echo "  ✓ 构建完成"
echo ""

echo ">>> [2/4] 启动前端 (vite preview :${PREVIEW_PORT})"
cd "$ROOT/apps/recruitment"
E2E=1 pnpm exec vite preview --port "$PREVIEW_PORT" &
PREVIEW_PID=$!
cd "$ROOT"

echo ">>> [3/4] 等待前端就绪..."
sleep 3
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
    echo "  ✓ 前端已就绪 ($BASE_URL/)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    kill $PREVIEW_PID 2>/dev/null || true
    echo "  错误: 前端在 30s 内未就绪 (最后 HTTP $CODE)"
    exit 1
  fi
  sleep 1
done
echo ""

echo ">>> [4/4] Playwright E2E（headed = 浏览器窗口可见）"
export PLAYWRIGHT_BASE_URL="$BASE_URL"
export HEADED=1
pnpm exec playwright test e2e/recruitment.spec.ts
E2E_EXIT=$?

kill $PREVIEW_PID 2>/dev/null || true
echo ""
echo "=========================================="
if [ "$E2E_EXIT" -eq 0 ]; then
  echo "  E2E Headed 执行完成（前端已启动并完成浏览器测试）"
else
  echo "  E2E Headed 失败 (exit $E2E_EXIT)"
fi
echo "=========================================="
exit $E2E_EXIT
