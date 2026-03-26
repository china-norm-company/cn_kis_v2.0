#!/usr/bin/env bash
# =============================================================================
# CN KIS V2.0 — 开发任务工具
# 用法：./ops/scripts/dev-task.sh <命令> [参数...]
#
# 命令列表：
#   bootstrap                      — 初始化本地开发环境（首次克隆后运行一次）
#   start-task <ws> <issue> <slug> — 从最新 main 创建规范任务分支
#   sync-task                      — 同步远程并把最新 main 合入当前分支
#   push-task                      — 检查并推送当前任务分支
#   status                         — 显示当前任务状态
#   help                           — 显示帮助
#
# 示例：
#   ./ops/scripts/dev-task.sh bootstrap
#   ./ops/scripts/dev-task.sh start-task quality 231 sample-rule-editor
#   ./ops/scripts/dev-task.sh sync-task
#   ./ops/scripts/dev-task.sh push-task
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# ─── 颜色输出 ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# ─── 合法工作台列表 ────────────────────────────────────────────────────────────
VALID_WORKSTATIONS=(
  secretary finance research execution quality hr crm
  recruitment equipment material facility evaluator lab-personnel
  ethics reception control-plane admin digital-workforce data-platform common
)

is_valid_workstation() {
  local ws="$1"
  for valid in "${VALID_WORKSTATIONS[@]}"; do
    [[ "$valid" == "$ws" ]] && return 0
  done
  return 1
}

# ─── 分支命名校验 ──────────────────────────────────────────────────────────────
VALID_WS_PATTERN="secretary|finance|research|execution|quality|hr|crm|recruitment|equipment|material|facility|evaluator|lab-personnel|ethics|reception|control-plane|admin|governance|digital-workforce|data-platform|common"
BRANCH_PATTERN="^(feature|fix|hotfix)/(${VALID_WS_PATTERN})/[0-9]+-[a-z0-9-]+$|^chore/common/[0-9]+-[a-z0-9-]+$|^wave/[0-9]+/[0-9]+-[a-z0-9-]+$"

is_valid_branch() {
  echo "$1" | grep -qE "$BRANCH_PATTERN"
}

# ─── 获取当前分支 ──────────────────────────────────────────────────────────────
current_branch() {
  git branch --show-current
}

# ─── 保护分支检查 ──────────────────────────────────────────────────────────────
assert_not_on_protected() {
  local branch
  branch=$(current_branch)
  if [[ "$branch" == "main" || "$branch" == "staging" ]]; then
    die "当前在受保护分支 '$branch' 上，无法执行此操作。\n请先运行：./ops/scripts/dev-task.sh start-task <工作台> <issue-id> <slug>"
  fi
}

# ─── bootstrap ────────────────────────────────────────────────────────────────
cmd_bootstrap() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   CN KIS V2.0 — 本地环境初始化       ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
  echo ""

  # 1. 检查 Git
  info "检查 Git..."
  if ! command -v git &>/dev/null; then
    die "未找到 git，请先安装 Git: https://git-scm.com"
  fi
  success "Git $(git --version | cut -d' ' -f3)"

  # 2. 检查 SSH 连接
  info "检查 GitHub SSH 连接..."
  if ssh -T git@github.com -o ConnectTimeout=5 2>&1 | grep -q "successfully authenticated"; then
    success "GitHub SSH 连接正常"
  else
    warn "GitHub SSH 未连接或未配置，请按照 docs/CURSOR_COLLABORATION_ONBOARDING.md 第 1 步配置 SSH 密钥"
  fi

  # 3. 检查 Node/pnpm（前端）
  info "检查 Node.js 和 pnpm..."
  if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version)
    success "Node.js $NODE_VERSION"
    if command -v pnpm &>/dev/null; then
      success "pnpm $(pnpm --version)"
    else
      warn "未找到 pnpm，前端工作台需要 pnpm。安装：npm install -g pnpm"
    fi
  else
    warn "未找到 Node.js，前端工作台开发需要 Node.js 18+"
  fi

  # 4. 检查 Python（后端）
  info "检查 Python..."
  if command -v python3 &>/dev/null; then
    PY_VERSION=$(python3 --version)
    success "$PY_VERSION"
  else
    warn "未找到 python3，后端开发需要 Python 3.10+"
  fi

  # 5. 复制 .env 模板
  info "检查环境变量文件..."
  if [[ ! -f "backend/.env" ]]; then
    if [[ -f "backend/.env.example" ]]; then
      cp "backend/.env.example" "backend/.env"
      success "已从 backend/.env.example 创建 backend/.env"
      warn "请打开 backend/.env 填写真实的数据库、Redis、飞书等配置"
    else
      warn "未找到 backend/.env.example，请手动创建 backend/.env"
    fi
  else
    success "backend/.env 已存在"
  fi

  # 6. 安装前端依赖
  if command -v pnpm &>/dev/null && [[ -f "package.json" ]]; then
    info "安装前端依赖..."
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    success "前端依赖安装完成"
  fi

  # 7. 确认当前在 main 分支
  info "同步最新 main 分支..."
  git checkout main 2>/dev/null || true
  git fetch origin
  git merge origin/main --ff-only 2>/dev/null || warn "main 分支无法快进合并，请手动处理"

  echo ""
  echo -e "${GREEN}✅ 本地环境初始化完成！${NC}"
  echo ""
  echo -e "下一步："
  echo -e "  1. 在 GitHub 创建或认领一个 Issue"
  echo -e "  2. 运行：${CYAN}./ops/scripts/dev-task.sh start-task <工作台> <issue-id> <任务简述>${NC}"
  echo -e "  3. 打开 Cursor 开始开发"
  echo ""
}

# ─── start-task ───────────────────────────────────────────────────────────────
cmd_start_task() {
  local branch_type="${1:-feature}"
  local workstation="${2:-}"
  local issue_id="${3:-}"
  local slug="${4:-}"

  # 处理简化调用：start-task <ws> <issue> <slug>（默认 feature）
  if [[ -z "$slug" && -n "$issue_id" ]]; then
    slug="$issue_id"
    issue_id="$workstation"
    workstation="$branch_type"
    branch_type="feature"
  fi

  # 验证参数
  if [[ -z "$workstation" || -z "$issue_id" || -z "$slug" ]]; then
    echo ""
    echo -e "${CYAN}用法：${NC}"
    echo -e "  ./ops/scripts/dev-task.sh start-task <工作台> <issue-id> <任务简述>"
    echo ""
    echo -e "${CYAN}示例：${NC}"
    echo -e "  ./ops/scripts/dev-task.sh start-task quality 231 sample-rule-editor"
    echo -e "  ./ops/scripts/dev-task.sh start-task secretary 245 login-loop"
    echo ""
    echo -e "${CYAN}工作台列表：${NC}"
    echo -e "  ${VALID_WORKSTATIONS[*]}"
    echo ""
    die "缺少参数"
  fi

  # 验证工作台
  if ! is_valid_workstation "$workstation"; then
    die "不合法的工作台 '$workstation'。\n合法值：${VALID_WORKSTATIONS[*]}"
  fi

  # 验证 Issue ID（必须是纯数字）
  if ! [[ "$issue_id" =~ ^[0-9]+$ ]]; then
    die "Issue ID 必须是纯数字，例如 231，收到：$issue_id"
  fi

  # 清理 slug（转小写、替换空格为连字符、去掉非法字符）
  slug=$(echo "$slug" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')

  local branch_name="${branch_type}/${workstation}/${issue_id}-${slug}"

  # 最终格式验证
  if ! is_valid_branch "$branch_name"; then
    die "生成的分支名不合法：$branch_name"
  fi

  # 切换分支前检测脏工作区（防止未完成的改动被带到新分支）
  if ! git diff --quiet || ! git diff --staged --quiet; then
    echo ""
    warn "当前工作区有未提交的改动："
    git status --short
    echo ""
    echo -e "  选项 A（推荐）：先提交当前改动"
    echo -e "    ${CYAN}git add . && git commit -m '你的改动描述'${NC}"
    echo -e "  选项 B：暂存当前改动，切换后可恢复"
    echo -e "    ${CYAN}git stash push -m 'wip: 暂存当前改动'${NC}"
    echo -e "  选项 C：放弃所有改动（不可恢复！）"
    echo -e "    ${CYAN}git checkout . && git clean -fd${NC}"
    echo ""
    die "请先处理未提交的改动，再创建新任务分支"
  fi

  info "同步最新 main..."
  git fetch origin
  git checkout main
  git merge origin/main --ff-only || die "main 分支同步失败，请手动解决冲突后重试"

  info "创建任务分支：$branch_name"
  git checkout -b "$branch_name"

  success "任务分支已创建：$branch_name"
  echo ""
  echo -e "当前分支：${CYAN}$(current_branch)${NC}"
  echo ""
  echo -e "下一步："
  echo -e "  1. 在 Cursor 中打开项目开始开发"
  echo -e "  2. 开发完成后运行：${CYAN}./ops/scripts/dev-task.sh push-task${NC}"
  echo ""
}

# ─── sync-task ────────────────────────────────────────────────────────────────
cmd_sync_task() {
  local branch
  branch=$(current_branch)

  assert_not_on_protected

  if ! is_valid_branch "$branch"; then
    warn "当前分支 '$branch' 不符合命名规范。建议先运行 start-task 创建规范分支。"
    read -p "是否仍然继续同步？[y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 0
  fi

  info "获取远程最新状态..."
  git fetch origin

  # 检查是否有未提交的改动
  if ! git diff --quiet || ! git diff --staged --quiet; then
    warn "工作区有未提交的改动，请先提交或暂存（git stash）再同步"
    git status --short
    die "请先处理未提交改动"
  fi

  info "合并最新 main 到当前分支 ($branch)..."
  if git merge origin/main --no-edit; then
    success "同步完成，当前分支已包含最新 main 的改动"
  else
    echo ""
    error "合并出现冲突！以下文件需要处理："
    git diff --name-only --diff-filter=U | while read -r f; do
      echo -e "  ${YELLOW}冲突${NC}：$f"
    done
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  在 Cursor 中复制以下文字发给 AI：${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "「我在运行 git merge origin/main 后出现了冲突，"
    echo -e " 冲突文件是：$(git diff --name-only --diff-filter=U | tr '\n' ', ')"
    echo -e " 请帮我解决合并冲突。对于业务逻辑冲突，请先告诉我冲突的内容，"
    echo -e " 再由我来决定保留哪一个版本。」"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "或者，如果你确认本地改动优先，运行："
    echo -e "  ${CYAN}git checkout --ours . && git add . && git merge --continue${NC}"
    echo ""
    echo -e "如果放弃本次同步（保持现状）："
    echo -e "  ${CYAN}git merge --abort${NC}"
    exit 1
  fi
}

# ─── push-task ────────────────────────────────────────────────────────────────
cmd_push_task() {
  local branch
  branch=$(current_branch)

  # 1. 禁止在受保护分支推送
  assert_not_on_protected

  # 2. 分支命名验证
  if ! is_valid_branch "$branch"; then
    die "分支名 '$branch' 不符合命名规范。\n请用 start-task 创建规范分支后再推送。\n规范格式：feature/<工作台>/<issue-id>-<slug>"
  fi

  # 3. 检查工作区是否干净
  if ! git diff --quiet || ! git diff --staged --quiet; then
    warn "工作区有未提交的改动："
    git status --short
    echo ""
    read -p "是否先提交全部改动？[y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      read -p "请输入提交说明：" commit_msg
      if [[ -z "$commit_msg" ]]; then
        die "提交说明不能为空"
      fi
      git add .
      git commit -m "$commit_msg"
    else
      die "请先处理未提交的改动再推送"
    fi
  fi

  # 4. 检查是否有敏感文件
  SENSITIVE_PATTERNS=(".env$" "secrets.env" "\.pem$" "\.key$" "id_rsa" "id_ed25519$")
  for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -qE "$pattern" || \
       git show --stat HEAD 2>/dev/null | grep -qE "$pattern"; then
      warn "检测到可能包含敏感信息的文件：$pattern"
      warn "请确认没有提交密钥、.env 或证书文件！"
    fi
  done

  # 5. 推送
  info "推送分支 $branch 到远程..."
  git push -u origin "$branch"

  success "分支已推送：$branch"
  echo ""
  echo -e "下一步 — 创建 Pull Request："
  echo -e "  访问：${CYAN}https://github.com/china-norm-company/cn_kis_v2.0/compare/$branch${NC}"
  echo ""
  echo -e "或在 Cursor 里说：${CYAN}「帮我准备这个 PR 的描述，生成测试步骤、风险点和回滚方案」${NC}"
  echo ""
}

# ─── status ───────────────────────────────────────────────────────────────────
cmd_status() {
  local branch
  branch=$(current_branch)

  echo ""
  echo -e "${CYAN}当前任务状态${NC}"
  echo -e "────────────────────────────"
  echo -e "分支：${CYAN}$branch${NC}"

  if is_valid_branch "$branch"; then
    success "分支命名规范"
  else
    warn "分支命名不符合规范"
  fi

  echo ""
  echo -e "工作区状态："
  git status --short

  echo ""
  echo -e "与远程的差异："
  git fetch origin --quiet 2>/dev/null || true
  local ahead behind
  ahead=$(git rev-list --count "origin/$branch..$branch" 2>/dev/null || echo "?")
  behind=$(git rev-list --count "$branch..origin/$branch" 2>/dev/null || echo "?")
  echo -e "  本地超前远程：${ahead} 个提交"
  echo -e "  本地落后远程：${behind} 个提交"

  echo ""
  local main_behind
  main_behind=$(git rev-list --count "$branch..origin/main" 2>/dev/null || echo "?")
  echo -e "落后 main：${main_behind} 个提交"
  if [[ "$main_behind" != "0" && "$main_behind" != "?" ]]; then
    echo -e "  建议运行：${CYAN}./ops/scripts/dev-task.sh sync-task${NC}"
  fi
  echo ""
}

# ─── help ─────────────────────────────────────────────────────────────────────
cmd_help() {
  echo ""
  echo -e "${CYAN}CN KIS V2.0 开发任务工具${NC}"
  echo ""
  echo -e "${CYAN}用法：${NC}./ops/scripts/dev-task.sh <命令> [参数]"
  echo ""
  echo -e "${CYAN}命令：${NC}"
  echo -e "  ${GREEN}bootstrap${NC}                          初始化本地开发环境（首次运行）"
  echo -e "  ${GREEN}start-task${NC} <ws> <issue-id> <slug>  从最新 main 创建规范任务分支"
  echo -e "  ${GREEN}sync-task${NC}                          同步远程并将最新 main 合入当前分支"
  echo -e "  ${GREEN}push-task${NC}                          检查并推送当前任务分支"
  echo -e "  ${GREEN}status${NC}                             显示当前任务状态"
  echo -e "  ${GREEN}help${NC}                               显示此帮助"
  echo ""
  echo -e "${CYAN}典型工作流：${NC}"
  echo -e "  1. ${CYAN}./ops/scripts/dev-task.sh bootstrap${NC}                          # 首次初始化"
  echo -e "  2. 在 GitHub 创建 Issue（例如 #231）"
  echo -e "  3. ${CYAN}./ops/scripts/dev-task.sh start-task quality 231 rule-editor${NC} # 建分支"
  echo -e "  4. 在 Cursor 里开发"
  echo -e "  5. ${CYAN}./ops/scripts/dev-task.sh sync-task${NC}                          # 同步 main"
  echo -e "  6. ${CYAN}./ops/scripts/dev-task.sh push-task${NC}                          # 推送"
  echo -e "  7. 访问链接创建 PR → 审核通过 → 合并 → 分支自动删除"
  echo ""
  echo -e "${CYAN}合法工作台：${NC}"
  echo -e "  ${VALID_WORKSTATIONS[*]}"
  echo ""
  echo -e "${CYAN}分支格式：${NC}"
  echo -e "  feature/<workstation>/<issue-id>-<slug>"
  echo -e "  fix/<workstation>/<issue-id>-<slug>"
  echo -e "  chore/common/<issue-id>-<slug>"
  echo -e "  hotfix/<workstation>/<issue-id>-<slug>"
  echo -e "  wave/<wave-number>/<issue-id>-<slug>"
  echo ""
}

# ─── 入口 ─────────────────────────────────────────────────────────────────────
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  bootstrap)    cmd_bootstrap ;;
  start-task)   cmd_start_task "$@" ;;
  sync-task)    cmd_sync_task ;;
  push-task)    cmd_push_task ;;
  status)       cmd_status ;;
  help|--help|-h) cmd_help ;;
  *)
    error "未知命令：$COMMAND"
    cmd_help
    exit 1
    ;;
esac
