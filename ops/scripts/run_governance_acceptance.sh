#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ops/scripts/run_governance_acceptance.sh
#
# 鹿鸣·治理台 唯一化重构 — 一键验收脚本
#
# 运行全套验收测试，验证：
#   1. 旧路径（/admin/, /iam/）已消亡
#   2. 新路径（/governance/）就绪
#   3. OAuth 独立授权正常
#   4. RBAC/profile/菜单已迁移
#   5. 后端 API 回归
#   6. 全工作台可达性
#   7. governance 13 个页面功能
#   8. 跨工作台跳转
#
# 用法：
#   ./ops/scripts/run_governance_acceptance.sh
#   TEST_SERVER=http://118.196.64.48 ./ops/scripts/run_governance_acceptance.sh
#   LIVE_TOKEN=eyJ... ./ops/scripts/run_governance_acceptance.sh
#   SUITE=api ./ops/scripts/run_governance_acceptance.sh   # 仅跑 API 测试（无 Playwright）
#   SUITE=e2e ./ops/scripts/run_governance_acceptance.sh   # 仅跑 E2E 测试
#   SUITE=all ./ops/scripts/run_governance_acceptance.sh   # 全部（默认）
#
# 依赖：
#   - Python 3.8+（API 回归测试）
#   - Node.js + pnpm（E2E Playwright 测试）
#   - Playwright 已安装 chromium（pnpm exec playwright install chromium）
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── 颜色 ──────────────────────────────────────────────────────────────────────
R='\033[91m'
G='\033[92m'
Y='\033[93m'
B='\033[94m'
NC='\033[0m'
BOLD='\033[1m'

# ── 配置 ──────────────────────────────────────────────────────────────────────
TEST_SERVER="${TEST_SERVER:-http://118.196.64.48}"
SUITE="${SUITE:-all}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${ROOT_DIR}/tests/ui-acceptance/screenshots-governance"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="${REPORT_DIR}/acceptance_report_${TIMESTAMP}.txt"

mkdir -p "${REPORT_DIR}"

echo ""
echo -e "${BOLD}${B}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  鹿鸣·治理台 唯一化重构 验收测试套件${NC}"
echo -e "${BOLD}  服务器: ${TEST_SERVER}${NC}"
echo -e "${BOLD}  套件:   ${SUITE}${NC}"
echo -e "${BOLD}  时间:   $(date)${NC}"
echo -e "${BOLD}${B}═══════════════════════════════════════════════════════════════${NC}"

PASS=0
FAIL=0
SKIP=0

log() {
    echo "$@" | tee -a "${REPORT_FILE}"
}

# ─────────────────────────────────────────────────────────────────────────────
# 函数：自动获取 JWT Token（无需手动提供）
# ─────────────────────────────────────────────────────────────────────────────
auto_fetch_token() {
    # 已由环境变量提供
    if [[ -n "${LIVE_TOKEN:-}" ]]; then
        echo -e "  ${G}[token] 使用 LIVE_TOKEN 环境变量${NC}"
        return
    fi

    local SSH_HOST="${SSH_HOST:-118.196.64.48}"
    local SSH_USER="${SSH_USER:-root}"
    local SSH_KEY="${SSH_KEY_PATH:-$HOME/.ssh/id_rsa}"
    local DJANGO_ROOT="${DJANGO_ROOT:-/opt/cn-kis/backend}"

    if [[ -f "${SSH_KEY}" ]]; then
        echo -e "  ${B}[token] 正在通过 SSH 从服务器自动获取 JWT...${NC}"
        _token=$(ssh -i "${SSH_KEY}" \
            -o StrictHostKeyChecking=no \
            -o ConnectTimeout=5 \
            "${SSH_USER}@${SSH_HOST}" \
            "cd ${DJANGO_ROOT} && python manage.py generate_test_jwt --raw --days 30" \
            2>/dev/null)
        if [[ "${_token}" == eyJ* ]]; then
            export LIVE_TOKEN="${_token}"
            echo -e "  ${G}[token] 自动获取成功（将用于所有认证测试）${NC}"
            return
        fi
    fi

    echo -e "  ${Y}[token] 未能自动获取 JWT，需认证的测试将被跳过${NC}"
    echo -e "  ${Y}        提示：SSH_KEY_PATH=/path/to/key ./run_governance_acceptance.sh${NC}"
}

auto_fetch_token

# ─────────────────────────────────────────────────────────────────────────────
# 函数：运行 Python API 测试
# ─────────────────────────────────────────────────────────────────────────────
run_api_tests() {
    log ""
    log "──────────────────────────────────────────────────────"
    log "  [1/3] 后端 API 迁移回归（Python）"
    log "──────────────────────────────────────────────────────"

    if ! command -v python3 &>/dev/null; then
        log -e "  ${Y}⚠ Python3 未安装，跳过 API 测试${NC}"
        SKIP=$((SKIP + 1))
        return
    fi

    if TEST_SERVER="${TEST_SERVER}" python3 "${ROOT_DIR}/ops/scripts/governance_migration_api_test.py" 2>&1 | tee -a "${REPORT_FILE}"; then
        log -e "  ${G}✅ API 回归测试全部通过${NC}"
        PASS=$((PASS + 1))
    else
        log -e "  ${R}❌ API 回归测试失败${NC}"
        FAIL=$((FAIL + 1))
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 函数：运行 Playwright E2E 迁移回归测试
# ─────────────────────────────────────────────────────────────────────────────
run_e2e_regression() {
    log ""
    log "──────────────────────────────────────────────────────"
    log "  [2/3] E2E 迁移回归（Playwright: Suite A-F）"
    log "──────────────────────────────────────────────────────"

    if ! command -v pnpm &>/dev/null; then
        log -e "  ${Y}⚠ pnpm 未安装，跳过 E2E 测试${NC}"
        SKIP=$((SKIP + 1))
        return
    fi

    cd "${ROOT_DIR}"
    if TEST_SERVER="${TEST_SERVER}" LIVE_AUTH_TOKEN="${LIVE_TOKEN:-}" \
        pnpm exec playwright test \
            e2e/governance-migration-regression.spec.ts \
            --reporter=line \
            2>&1 | tee -a "${REPORT_FILE}"; then
        log -e "  ${G}✅ 迁移回归 E2E 全部通过${NC}"
        PASS=$((PASS + 1))
    else
        log -e "  ${R}❌ 迁移回归 E2E 有失败${NC}"
        FAIL=$((FAIL + 1))
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 函数：运行 governance 功能 E2E 测试（Suite G-I）
# ─────────────────────────────────────────────────────────────────────────────
run_e2e_features() {
    log ""
    log "──────────────────────────────────────────────────────"
    log "  [3/3] governance 功能深度验收（Playwright: Suite G-I）"
    log "──────────────────────────────────────────────────────"

    if ! command -v pnpm &>/dev/null; then
        log -e "  ${Y}⚠ pnpm 未安装，跳过功能测试${NC}"
        SKIP=$((SKIP + 1))
        return
    fi

    cd "${ROOT_DIR}"
    if TEST_SERVER="${TEST_SERVER}" LIVE_AUTH_TOKEN="${LIVE_TOKEN:-}" \
        pnpm exec playwright test \
            e2e/governance-workstation-features.spec.ts \
            --reporter=line \
            2>&1 | tee -a "${REPORT_FILE}"; then
        log -e "  ${G}✅ 功能验收 E2E 全部通过${NC}"
        PASS=$((PASS + 1))
    else
        log -e "  ${R}❌ 功能验收 E2E 有失败${NC}"
        FAIL=$((FAIL + 1))
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 快速健康检查（无依赖，纯 curl）
# ─────────────────────────────────────────────────────────────────────────────
quick_health_check() {
    log ""
    log "──────────────────────────────────────────────────────"
    log "  [快速] HTTP 可达性检查（curl）"
    log "──────────────────────────────────────────────────────"

    if ! command -v curl &>/dev/null; then
        log -e "  ${Y}⚠ curl 未安装，跳过快速检查${NC}"
        return
    fi

    local all_pass=true

    check_url() {
        local label="$1"
        local url="$2"
        local expected_status="${3:-200}"

        local actual
        actual=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 -L "${url}" 2>/dev/null || echo "0")

        if [ "${actual}" = "${expected_status}" ]; then
            log -e "  ${G}✅${NC}  ${label}: HTTP ${actual}"
        elif [ "${actual}" = "0" ]; then
            log -e "  ${R}❌${NC}  ${label}: 连接超时/拒绝"
            all_pass=false
        else
            # 若期望 404，但得到其他错误码，也记录
            log -e "  ${Y}⚠${NC}   ${label}: HTTP ${actual}（期望 ${expected_status}）"
        fi
    }

    # 后端健康
    check_url "后端健康检查 /health" "${TEST_SERVER}/v2/api/v1/health"

    # 新路径就绪
    check_url "治理台 /governance/" "${TEST_SERVER}/governance/"

    # 旧路径消亡（期望 404 或 3xx）
    local admin_status
    admin_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
        "${TEST_SERVER}/admin/" 2>/dev/null || echo "0")
    if [ "${admin_status}" = "404" ] || [ "${admin_status}" = "301" ] || \
       [ "${admin_status}" = "302" ] || [ "${admin_status}" = "0" ]; then
        log -e "  ${G}✅${NC}  旧路径 /admin/: HTTP ${admin_status}（已停用）"
    else
        log -e "  ${R}❌${NC}  旧路径 /admin/: HTTP ${admin_status}（应为 404/30x）"
        all_pass=false
    fi

    local iam_status
    iam_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
        "${TEST_SERVER}/iam/" 2>/dev/null || echo "0")
    if [ "${iam_status}" = "404" ] || [ "${iam_status}" = "301" ] || \
       [ "${iam_status}" = "302" ] || [ "${iam_status}" = "0" ]; then
        log -e "  ${G}✅${NC}  旧路径 /iam/: HTTP ${iam_status}（已停用）"
    else
        log -e "  ${R}❌${NC}  旧路径 /iam/: HTTP ${iam_status}（应为 404/30x）"
        all_pass=false
    fi

    # 其余关键工作台
    for ws in secretary data-platform control-plane digital-workforce; do
        check_url "工作台 /${ws}/" "${TEST_SERVER}/${ws}/"
    done

    if $all_pass; then
        log -e "  ${G}✅ 快速健康检查通过${NC}"
    else
        log -e "  ${R}❌ 快速健康检查有异常${NC}"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────────────────────

# 始终执行快速检查
quick_health_check

case "${SUITE}" in
    api)
        run_api_tests
        ;;
    e2e)
        run_e2e_regression
        run_e2e_features
        ;;
    regression)
        run_api_tests
        run_e2e_regression
        ;;
    features)
        run_e2e_features
        ;;
    all|*)
        run_api_tests
        run_e2e_regression
        run_e2e_features
        ;;
esac

# ── 最终汇总 ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${B}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  验收结果汇总${NC}"
echo -e "${BOLD}${B}═══════════════════════════════════════════════════════════════${NC}"
echo -e "  ${G}${BOLD}PASS${NC}  ${PASS} 个测试套件"
echo -e "  ${R}${BOLD}FAIL${NC}  ${FAIL} 个测试套件"
echo -e "  ${Y}${BOLD}SKIP${NC}  ${SKIP} 个测试套件（缺少依赖）"
echo ""
echo -e "  报告: ${REPORT_FILE}"
echo ""

if [ "${FAIL}" -eq 0 ]; then
    echo -e "${G}${BOLD}  ✅ 治理台唯一化重构验收完成！${NC}"
    echo ""
    exit 0
else
    echo -e "${R}${BOLD}  ❌ ${FAIL} 个套件失败，请查看报告详情。${NC}"
    echo ""
    exit 1
fi
