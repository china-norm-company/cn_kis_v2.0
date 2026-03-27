#!/usr/bin/env bash
# ============================================================
# 创建工作台上线波次 GitHub Labels
# 用法：bash ops/scripts/create-wave-labels.sh
# 需要：gh auth login 已完成
# ============================================================
set -euo pipefail
REPO="china-norm-company/cn_kis_v2.0"

echo "▶ 创建工作台上线波次标签..."

labels=(
  "wave-A|#0075ca|Wave A — 可推广工作台的改进任务"
  "wave-B|#e4e669|Wave B — 试点陪跑工作台的开发任务"
  "wave-C|#d93f0b|Wave C — 继续建设工作台的基础任务"
  "上线阻塞|#b60205|阻塞工作台上线的紧急问题"
  "数据缺口|#ffa500|需要补充数据/知识的任务"
  "角色价值|#0e8a16|直接提升用户可感知价值的任务"
  "hub-联动|#6f42c1|涉及4个中枢台(secretary/admin/dw/cp)联动的任务"
)

for entry in "${labels[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  color="${rest%%|*}"
  desc="${rest#*|}"

  if gh label list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null | grep -qx "$name"; then
    echo "  ✓ 已存在：$name"
  else
    gh label create "$name" --repo "$REPO" --color "${color#\#}" --description "$desc" && \
      echo "  ✅ 创建：$name" || echo "  ⚠ 创建失败：$name"
  fi
done

echo "▶ 工作台分组标签..."
workstations=(
  "ws/secretary|#c5def5|工作台：秘书台"
  "ws/research|#c5def5|工作台：研究台"
  "ws/recruitment|#c5def5|工作台：招募台"
  "ws/quality|#c5def5|工作台：质量台"
  "ws/execution|#c5def5|工作台：执行台"
  "ws/finance|#c5def5|工作台：财务台"
  "ws/admin|#f9d0c4|工作台：治理台"
  "ws/digital-workforce|#f9d0c4|工作台：智能台"
)

for entry in "${workstations[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  color="${rest%%|*}"
  desc="${rest#*|}"
  if gh label list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null | grep -qx "$name"; then
    echo "  ✓ 已存在：$name"
  else
    gh label create "$name" --repo "$REPO" --color "${color#\#}" --description "$desc" && \
      echo "  ✅ 创建：$name" || echo "  ⚠ 创建失败：$name"
  fi
done

echo ""
echo "✅ 完成！Labels 已创建，请在 GitHub 的 Issues 页面查看效果。"
echo "   → https://github.com/$REPO/labels"
