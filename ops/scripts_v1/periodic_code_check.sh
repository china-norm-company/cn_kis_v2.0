#!/bin/bash
# CN_KIS 定期代码检查：废弃代码、重复代码、重复功能
# 建议每迭代/每季度执行，或大版本发布前执行
#
# 用法: ./scripts/periodic_code_check.sh [--json]
# --json  输出 JSON 格式报告（便于 CI 解析）

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUTPUT_JSON=0
for arg in "$@"; do
  case "$arg" in
    --json) OUTPUT_JSON=1 ;;
  esac
done

# 检查范围：monorepo apps、packages、backend、scripts、config
CHECK_DIRS="apps packages scripts config"
[ -d "backend" ] && CHECK_DIRS="$CHECK_DIRS backend"

echo "=== CN_KIS V1.0 定期代码检查 ==="
echo ""
echo "检查范围: $CHECK_DIRS"
echo ""

# 1. 废弃代码检查（排除 node_modules、dist、migrations）
echo "【1】废弃代码检查（deprecated / @deprecated / 废弃）"
echo "----------------------------------------"
if command -v rg &>/dev/null; then
  if rg -n "deprecated|@deprecated|废弃" \
    --glob '!node_modules' --glob '!*.d.ts' --glob '!dist' \
    --glob '!**/migrations/*.py' \
    $CHECK_DIRS 2>/dev/null; then
    echo ""
    echo "上述位置含废弃标记，请人工复核是否需清理。"
  else
    echo "未发现本仓库源码中的废弃标记。"
  fi
else
  echo "提示: 安装 ripgrep (rg) 可自动检测，当前跳过。"
  echo "人工检查: 搜索 'deprecated'、'@deprecated'、'废弃'。"
fi
echo ""

# 2. 重复代码检查（可选：需 jscpd）
echo "【2】重复代码检查"
echo "----------------------------------------"
if command -v npx &>/dev/null; then
  JSCPD_DIRS=""
  for app in secretary research quality finance hr crm; do
    [ -d "apps/$app/src" ] && JSCPD_DIRS="$JSCPD_DIRS apps/$app/src"
  done
  for pkg in ui-kit api-client feishu-sdk; do
    [ -d "packages/$pkg/src" ] && JSCPD_DIRS="$JSCPD_DIRS packages/$pkg/src"
  done

  if [ -n "$JSCPD_DIRS" ]; then
    npx jscpd $JSCPD_DIRS --min-lines 10 --min-tokens 50 --reporters console 2>/dev/null || {
      echo "提示: 执行 npx jscpd <dirs> --min-lines 10 可检测重复代码。"
      echo "人工检查: 审查相似函数、组件、工具函数。"
    }
  fi

  if [ -d "backend" ]; then
    echo ""
    echo "后端重复检查:"
    npx jscpd backend/apps --min-lines 10 --min-tokens 50 --reporters console 2>/dev/null || {
      echo "提示: 后端 Python 代码可手动审查重复 API/Service 模式。"
    }
  fi
else
  echo "提示: 安装 npx 后执行 npx jscpd 可检测重复代码。"
  echo "人工检查: 审查相似函数、组件、工具函数。"
fi
echo ""

# 3. DEMO 数据残留检查
echo "【3】DEMO 数据残留检查"
echo "----------------------------------------"
if command -v rg &>/dev/null; then
  if rg -n "DEMO_DATA|mock_data|placeholder.*data|临时数据" \
    --glob '!node_modules' --glob '!*.d.ts' --glob '!dist' \
    apps packages 2>/dev/null; then
    echo ""
    echo "⚠ 上述位置可能含有 DEMO/Mock 数据，请确认是否需要替换为真实 API 调用。"
  else
    echo "✓ 未发现 DEMO 数据残留。"
  fi
fi
echo ""

# 4. 未使用导出/导入
echo "【4】重复功能与死代码提示"
echo "----------------------------------------"
echo "- 重复功能: 需人工审查多个 API/页面是否实现相同业务，建议对照需求文档。"
echo "- 死代码: 未被引用的导出、未使用的函数，可用 IDE 或 eslint 的 no-unused-vars 辅助。"
echo ""

# 5. 汇总
echo "=== 检查完成 ==="
echo ""
echo "下一步:"
echo "  1. 人工复核上述结果，制定清理清单"
echo "  2. 逐项清理，每次提交聚焦单一项"
echo "  3. 执行 ./scripts/quality_gate.sh 确保通过"
echo "  4. 在 CHANGELOG 或提交信息中记录清理内容"
