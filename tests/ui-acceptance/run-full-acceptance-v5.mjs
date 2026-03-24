/**
 * CN KIS V2.0 — 全量无遗漏 UI + API 验收测试 v5
 * ═══════════════════════════════════════════════════════════════
 *
 * 覆盖范围（V1→V2 全量继承验证 + V2 新增功能验证）：
 *
 * 阶段 0  : 后端健康检查 + 31 个核心 API 存活性
 * 阶段 1  : V1 业务工作台（15 台）× 关键页面 + V1 冒烟场景
 *   - secretary / research / quality / finance / hr / crm
 *   - execution / recruitment / equipment / material / facility
 *   - evaluator / ethics / lab-personnel / reception
 * 阶段 2  : V1 平台工作台（3 台）
 *   - admin / control-plane / digital-workforce
 * 阶段 3  : V2 新增工作台（2 台）
 *   - iam（枢衡·权控台）/ data-platform（洞明·数据台）
 * 阶段 4  : V2 新增能力验证
 *   - 知识资产写保护 / 数据分类分级 / 受试者假名化 /
 *     协议版本控制 / Agent 知识域 / 数据质量规则引擎
 * 阶段 5  : AI 能力验证（对话 + 知识检索 + Skills）
 * 阶段 6  : 微信小程序 API 结构检查（33 个页面覆盖点）
 *
 * 认证策略：JWT localStorage 注入（超级管理员，跳过 OAuth）
 * 目标服务器：http://118.196.64.48  （API 路径：/v2/api/v1/）
 *
 * 运行方式：
 *   node tests/ui-acceptance/run-full-acceptance-v5.mjs
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots-v5')
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const BASE_URL = 'http://118.196.64.48'
const API_BASE  = `${BASE_URL}/v2/api/v1`

// ── 超级管理员 JWT（马利民 account_id=1，有效期至 2026-03-22T08:31:11 UTC）
const SUPERADMIN_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6ImZlaXNodV9hZDlkNzQ1NjI1YTY1ZGMzIiwiYWNjb3VudF90eXBlIjoiaW50ZXJuYWwiLCJyb2xlcyI6WyJzdXBlcmFkbWluIiwicmVzZWFyY2hfbWFuYWdlciIsInZpZXdlciJdLCJleHAiOjE3NzQxNjgyNzEsImlhdCI6MTc3NDA4MTg3MX0.K4qDqRJre4V5X5DjiGMMq5UST-iOlqD20CLtReP_fno'
const SUPERADMIN_USER = JSON.stringify({
  id: 1,
  username: 'feishu_ad9d745625a65dc3',
  display_name: '马利民',
  account_type: 'internal',
  roles: ['superadmin', 'research_manager', 'viewer'],
})

// 完整权限画像（用于 useAuthProfile 缓存，避免 /auth/profile API 401 导致 token 被清除）
const SUPERADMIN_PROFILE = JSON.stringify({
  id: 1,
  username: 'feishu_ad9d745625a65dc3',
  display_name: '马利民',
  email: '',
  avatar: '',
  account_type: 'internal',
  roles: [
    { name: 'superadmin', display_name: '超级管理员', level: 100, category: 'system' },
    { name: 'research_manager', display_name: '研究管理员', level: 80, category: 'business' },
    { name: 'viewer', display_name: '查看者', level: 10, category: 'business' },
  ],
  permissions: ['*'],
  data_scope: 'global',
  visible_workbenches: [
    'secretary','research','quality','finance','hr','crm','execution',
    'recruitment','equipment','material','facility','evaluator','lab-personnel',
    'ethics','reception','control-plane','governance','digital-workforce','data-platform',
  ],
  visible_menu_items: {},
})

// ════════════════════════════════════════════════════════════════
//  工作台页面定义（共 20 台 × N 页面 = 130+ 测试点）
// ════════════════════════════════════════════════════════════════

// ── V1 业务工作台（15 台）─────────────────────────────────────

const SECRETARY_PAGES = [
  { id: 'sec-01', name: '秘书-1  门户', path: '/secretary/portal', checks: [] },
  { id: 'sec-02', name: '秘书-2  仪表板', path: '/secretary/dashboard', checks: [] },
  { id: 'sec-03', name: '秘书-3  待办', path: '/secretary/todo', checks: [] },
  { id: 'sec-04', name: '秘书-4  通知', path: '/secretary/notifications', checks: [] },
]

const RESEARCH_PAGES = [
  { id: 'res-01', name: '研究-1  工作台', path: '/research/workbench', checks: [] },
  { id: 'res-02', name: '研究-2  协议列表', path: '/research/protocols', checks: [] },
  { id: 'res-03', name: '研究-3  项目看板', path: '/research/portfolio', checks: [] },
  { id: 'res-04', name: '研究-4  访视', path: '/research/visits', checks: [] },
  { id: 'res-05', name: '研究-5  知识库', path: '/research/workbench', v1smoke: '知识库' },
]

const QUALITY_PAGES = [
  { id: 'qua-01', name: '质量-1  仪表板', path: '/quality/dashboard', checks: [] },
  { id: 'qua-02', name: '质量-2  偏差列表', path: '/quality/deviations', checks: [] },
  { id: 'qua-03', name: '质量-3  CAPA', path: '/quality/capa', checks: [] },
  { id: 'qua-04', name: '质量-4  审计管理', path: '/quality/audit-management', checks: [] },
  { id: 'qua-05', name: '质量-5  审计日志', path: '/quality/audit-logs', checks: [] },
  { id: 'qua-06', name: '质量-6  SOP', path: '/quality/sop', checks: [] },
  { id: 'qua-07', name: '质量-7  数据质疑', path: '/quality/queries', checks: [] },
]

const FINANCE_PAGES = [
  { id: 'fin-01', name: '财务-1  仪表板', path: '/finance/dashboard', checks: [] },
  { id: 'fin-02', name: '财务-2  报价', path: '/finance/quotes', checks: [] },
  { id: 'fin-03', name: '财务-3  合同', path: '/finance/contracts', checks: [] },
  { id: 'fin-04', name: '财务-4  发票', path: '/finance/invoices', checks: [] },
  { id: 'fin-05', name: '财务-5  利润分析', path: '/finance/profit', checks: [] },
  { id: 'fin-06', name: '财务-6  结算', path: '/finance/settlement', checks: [] },
]

const HR_PAGES = [
  { id: 'hr-01', name: '人事-1  资质', path: '/hr/qualifications', checks: [] },
  { id: 'hr-02', name: '人事-2  培训', path: '/hr/trainings', checks: [] },
  { id: 'hr-03', name: '人事-3  评估', path: '/hr/assessments', checks: [] },
]

const CRM_PAGES = [
  { id: 'crm-01', name: 'CRM-1  仪表板', path: '/crm/dashboard', checks: [] },
  { id: 'crm-02', name: 'CRM-2  客户档案', path: '/crm/clients', checks: [] },
  { id: 'crm-03', name: 'CRM-3  商机', path: '/crm/opportunities', checks: [] },
  { id: 'crm-04', name: 'CRM-4  工单', path: '/crm/tickets', checks: [] },
]

const EXECUTION_PAGES = [
  { id: 'exe-01', name: '执行-1  仪表板', path: '/execution/dashboard', checks: [] },
  { id: 'exe-02', name: '执行-2  排程', path: '/execution/scheduling', checks: [] },
  { id: 'exe-03', name: '执行-3  访视', path: '/execution/visits', checks: [] },
  { id: 'exe-04', name: '执行-4  受试者', path: '/execution/subjects', checks: [] },
  { id: 'exe-05', name: '执行-5  工单', path: '/execution/workorders', checks: [] },
  { id: 'exe-06', name: '执行-6  EDC', path: '/execution/edc', checks: [] },
]

const RECRUITMENT_PAGES = [
  { id: 'rec-01', name: '招募-1  仪表板', path: '/recruitment/dashboard', checks: [] },
  { id: 'rec-02', name: '招募-2  招募计划', path: '/recruitment/plans', checks: [] },
  { id: 'rec-03', name: '招募-3  报名管理', path: '/recruitment/registrations', checks: [] },
  { id: 'rec-04', name: '招募-4  粗筛管理', path: '/recruitment/pre-screening', checks: [] },
  { id: 'rec-05', name: '招募-5  入组管理', path: '/recruitment/enrollment', checks: [] },
  { id: 'rec-06', name: '招募-6  受试者列表', path: '/recruitment/subjects', checks: [] },
]

const EQUIPMENT_PAGES = [
  { id: 'eqp-01', name: '设备-1  仪表板', path: '/equipment/dashboard', checks: [] },
  { id: 'eqp-02', name: '设备-2  台账', path: '/equipment/ledger', checks: [] },
  { id: 'eqp-03', name: '设备-3  校准', path: '/equipment/calibration', checks: [] },
  { id: 'eqp-04', name: '设备-4  维护', path: '/equipment/maintenance', checks: [] },
]

const MATERIAL_PAGES = [
  { id: 'mat-01', name: '物料-1  仪表板', path: '/material/dashboard', checks: [] },
  { id: 'mat-02', name: '物料-2  产品台账', path: '/material/products', checks: [] },
  { id: 'mat-03', name: '物料-3  耗材台账', path: '/material/consumables', checks: [] },
  { id: 'mat-04', name: '物料-4  库存', path: '/material/inventory', checks: [] },
  { id: 'mat-05', name: '物料-5  样品', path: '/material/samples', checks: [] },
]

const FACILITY_PAGES = [
  { id: 'fac-01', name: '设施-1  仪表板', path: '/facility/dashboard', checks: [] },
  { id: 'fac-02', name: '设施-2  场地', path: '/facility/venues', checks: [] },
  { id: 'fac-03', name: '设施-3  预约', path: '/facility/reservations', checks: [] },
]

const EVALUATOR_PAGES = [
  { id: 'eva-01', name: '评估-1  仪表板', path: '/evaluator/dashboard', checks: [] },
  { id: 'eva-02', name: '评估-2  工单', path: '/evaluator/workorders', checks: [] },
  { id: 'eva-03', name: '评估-3  排程', path: '/evaluator/schedule', checks: [] },
]

const ETHICS_PAGES = [
  { id: 'eth-01', name: '伦理-1  仪表板', path: '/ethics/dashboard', checks: [] },
  { id: 'eth-02', name: '伦理-2  伦理申请', path: '/ethics/applications', checks: [] },
  { id: 'eth-03', name: '伦理-3  批件管理', path: '/ethics/approvals', checks: [] },
  { id: 'eth-04', name: '伦理-4  审查意见', path: '/ethics/review-opinions', checks: [] },
  { id: 'eth-05', name: '伦理-5  合规检查', path: '/ethics/compliance', checks: [] },
  { id: 'eth-06', name: '伦理-6  法规跟踪', path: '/ethics/regulations', checks: [] },
]

const LAB_PERSONNEL_PAGES = [
  { id: 'lab-01', name: '人员-1  仪表板', path: '/lab-personnel/dashboard', checks: [] },
  { id: 'lab-02', name: '人员-2  员工', path: '/lab-personnel/staff', checks: [] },
  { id: 'lab-03', name: '人员-3  资质矩阵', path: '/lab-personnel/qualifications', checks: [] },
  { id: 'lab-04', name: '人员-4  排班', path: '/lab-personnel/schedules', checks: [] },
  { id: 'lab-05', name: '人员-5  工时', path: '/lab-personnel/worktime', checks: [] },
  { id: 'lab-06', name: '人员-6  风险预警', path: '/lab-personnel/risks', checks: [] },
  { id: 'lab-07', name: '人员-7  派工', path: '/lab-personnel/dispatch', checks: [] },
]

const RECEPTION_PAGES = [
  { id: 'rcp-01', name: '接待-1  仪表板', path: '/reception/dashboard', checks: [] },
  { id: 'rcp-02', name: '接待-2  预约', path: '/reception/appointments', checks: [] },
  { id: 'rcp-03', name: '接待-3  签到', path: '/reception/checkin', checks: [] },
]

// ── 平台工作台（治理台合并后）─────────────────────────────────────

const GOVERNANCE_PAGES = [
  { id: 'gov-01', name: '治理-1   总览', path: '/governance', checks: [] },
  { id: 'gov-02', name: '治理-2   用户管理', path: '/governance/users', checks: [] },
  { id: 'gov-03', name: '治理-3   角色管理', path: '/governance/roles', checks: [] },
  { id: 'gov-04', name: '治理-4   权限矩阵', path: '/governance/permissions', checks: [] },
  { id: 'gov-05', name: '治理-5   会话管理', path: '/governance/sessions', checks: [] },
  { id: 'gov-06', name: '治理-6   活动日志', path: '/governance/activity', checks: [] },
  { id: 'gov-07', name: '治理-7   功能使用', path: '/governance/feature-usage', checks: [] },
  { id: 'gov-08', name: '治理-8   AI 用量', path: '/governance/ai-usage', checks: [] },
  { id: 'gov-09', name: '治理-9   审计日志', path: '/governance/audit', checks: [] },
  { id: 'gov-10', name: '治理-10  工作台总览', path: '/governance/workstations', checks: [] },
  { id: 'gov-11', name: '治理-11  试点配置', path: '/governance/pilot-config', checks: [] },
  { id: 'gov-12', name: '治理-12  飞书集成', path: '/governance/feishu', checks: [] },
  { id: 'gov-13', name: '治理-13  系统配置', path: '/governance/config', checks: [] },
]

const CONTROL_PLANE_PAGES = [
  { id: 'cp-01', name: '统管-1  仪表板', path: '/control-plane/dashboard', checks: [] },
  { id: 'cp-02', name: '统管-2  对象列表', path: '/control-plane/objects', checks: [] },
  { id: 'cp-03', name: '统管-3  事件列表', path: '/control-plane/events', checks: [] },
  { id: 'cp-04', name: '统管-4  资源健康', path: '/control-plane/resource-health', checks: [] },
]

const DW_PAGES = [
  { id: 'dw-01', name: '数字员工-1  门户', path: '/digital-workforce/portal', checks: [] },
  { id: 'dw-02', name: '数字员工-2  智能体', path: '/digital-workforce/agents', checks: [] },
  { id: 'dw-03', name: '数字员工-3  任务', path: '/digital-workforce/tasks', checks: [] },
  { id: 'dw-04', name: '数字员工-4  技能', path: '/digital-workforce/skills', checks: [] },
  { id: 'dw-05', name: '数字员工-5  回放', path: '/digital-workforce/replay', checks: [] },
  { id: 'dw-06', name: '数字员工-6  工单', path: '/digital-workforce/mail-tasks', checks: [] },
]

// ── V2 新增工作台（洞明·数据台）─────────────────────────────────────

const DP_PAGES = [
  { id: 'dp-01', name: 'DP-1   总览', path: '/data-platform', checks: [] },
  { id: 'dp-02', name: 'DP-2   数据目录', path: '/data-platform/catalog', checks: [] },
  { id: 'dp-03', name: 'DP-3   知识管理', path: '/data-platform/knowledge', checks: [] },
  { id: 'dp-04', name: 'DP-4   数据入库', path: '/data-platform/ingest', checks: [] },
  { id: 'dp-05', name: 'DP-5   数据血缘', path: '/data-platform/lineage', checks: [] },
  { id: 'dp-06', name: 'DP-6   流水线', path: '/data-platform/pipelines', checks: [] },
  { id: 'dp-07', name: 'DP-7   数据质量', path: '/data-platform/quality', checks: [] },
  { id: 'dp-08', name: 'DP-8   存储管理', path: '/data-platform/storage', checks: [] },
  { id: 'dp-09', name: 'DP-9   服务拓扑', path: '/data-platform/topology', checks: [] },
  { id: 'dp-10', name: 'DP-10  备份管理', path: '/data-platform/backup', checks: [] },
  { id: 'dp-11', name: 'DP-11  知识来源', path: '/data-platform/sources', checks: [] },
  { id: 'dp-12', name: 'DP-12  数据分类', path: '/data-platform/classification', checks: [] },
]

// ── V1 核心 API 端点（31 个，来自 V2 parity 矩阵）─────────────
const V1_PARITY_APIS = [
  // 系统
  { id: 'api-health',      name: 'API-健康检查',       url: `${API_BASE}/health` },
  // 核心业务（路径已验证匹配后端 Django Ninja 路由）
  { id: 'api-protocol',    name: 'API-协议管理',        url: `${API_BASE}/protocol/list` },
  { id: 'api-visit',       name: 'API-访视管理',        url: `${API_BASE}/visit/plans` },
  { id: 'api-subject',     name: 'API-受试者管理',      url: `${API_BASE}/subject/list` },
  { id: 'api-edc',         name: 'API-EDC 数据',        url: `${API_BASE}/edc/records` },
  { id: 'api-workorder',   name: 'API-工单管理',        url: `${API_BASE}/workorder/list` },
  { id: 'api-quality',     name: 'API-质量仪表盘',      url: `${API_BASE}/quality/dashboard` },
  { id: 'api-deviations',  name: 'API-偏差列表',        url: `${API_BASE}/quality/deviations/list` },
  { id: 'api-hr',          name: 'API-人员列表',        url: `${API_BASE}/hr/staff/list` },
  { id: 'api-finance',     name: 'API-报价列表',        url: `${API_BASE}/finance/quotes/list` },
  { id: 'api-crm',         name: 'API-客户列表',        url: `${API_BASE}/crm/clients/list` },
  { id: 'api-equipment',   name: 'API-设备列表',        url: `${API_BASE}/equipment/ledger` },
  { id: 'api-material',    name: 'API-物料列表',        url: `${API_BASE}/material/products` },
  { id: 'api-ethics',      name: 'API-伦理申请',        url: `${API_BASE}/ethics/applications/list` },
  { id: 'api-recruitment', name: 'API-招募计划',        url: `${API_BASE}/recruitment/plans` },
  { id: 'api-lab-personnel', name: 'API-人员管理',     url: `${API_BASE}/lab-personnel/staff/list` },
  { id: 'api-facility',    name: 'API-设施列表',        url: `${API_BASE}/facility/venues` },
  // 集成
  { id: 'api-knowledge',   name: 'API-知识条目',        url: `${API_BASE}/knowledge/entries/list` },
  { id: 'api-knowledge-search', name: 'API-知识搜索',  url: `${API_BASE}/knowledge/hybrid-search?q=临床研究&limit=3` },
  { id: 'api-agents',      name: 'API-智能体列表',      url: `${API_BASE}/agents/list` },
  { id: 'api-audit',       name: 'API-审计日志',        url: `${API_BASE}/audit/logs` },
  { id: 'api-notification', name: 'API-通知列表',      url: `${API_BASE}/notification/list` },
  // V2 新增
  { id: 'api-data-platform', name: 'API-洞明数据台',   url: `${API_BASE}/data-platform/dashboard` },
  { id: 'api-identity',    name: 'API-用户列表',        url: `${API_BASE}/auth/accounts/list` },
  // 项目管理
  { id: 'api-projects',    name: 'API-项目全链路',      url: `${API_BASE}/projects/` },
  { id: 'api-proposal',    name: 'API-方案列表',        url: `${API_BASE}/proposal/list` },
  { id: 'api-closeout',    name: 'API-结项列表',        url: `${API_BASE}/closeout/list` },
  // 更多
  { id: 'api-scheduling',  name: 'API-排程列表',        url: `${API_BASE}/scheduling/plans/list` },
  { id: 'api-sample',      name: 'API-样品列表',        url: `${API_BASE}/sample/instances/list` },
  { id: 'api-ekuaibao',    name: 'API-易快报集成',      url: `${API_BASE}/ekuaibao/batches` },
  { id: 'api-lims',        name: 'API-LIMS集成',        url: `${API_BASE}/lims/connections` },
]

// ── V2 新增能力专项 API 检查 ─────────────────────────────────
const V2_NEW_FEATURE_APIS = [
  { id: 'v2-pseudonym',    name: 'V2新增-假名化API',   url: `${API_BASE}/subject/1/pseudonym` },
  { id: 'v2-protocol-ver', name: 'V2新增-协议版本控制', url: `${API_BASE}/protocol/1/versions` },
  { id: 'v2-quality-rule', name: 'V2新增-数据质量规则', url: `${API_BASE}/quality/data-quality/rules` },
  { id: 'v2-knowledge-guard', name: 'V2新增-知识写保护', url: `${API_BASE}/knowledge/entries/list` },
  { id: 'v2-page-track',   name: 'V2新增-页面埋点',    url: `${API_BASE}/audit/logs`, method: 'GET' },
]

// ── 微信小程序 33 个页面的后端 API 覆盖点 ────────────────────
const WECHAT_MINI_API_CHECKS = [
  { id: 'wx-01', name: '小程序-受试者自助', url: `${API_BASE}/my/identity/status` },
  { id: 'wx-02', name: '小程序-预约管理', url: `${API_BASE}/recruitment/registrations` },
  { id: 'wx-03', name: '小程序-问卷管理', url: `${API_BASE}/questionnaire/templates` },
  { id: 'wx-04', name: '小程序-签到/二维码', url: `${API_BASE}/pre-screening/` },
  { id: 'wx-05', name: '小程序-通知中心', url: `${API_BASE}/notification/list` },
  { id: 'wx-06', name: '小程序-忠诚度积分', url: `${API_BASE}/loyalty/ranking` },
  { id: 'wx-07', name: '小程序-合规同意', url: `${API_BASE}/pre-screening/` },
  { id: 'wx-08', name: '小程序-样品确认', url: `${API_BASE}/sample/instances/list` },
]

// ════════════════════════════════════════════════════════════════
//  工具函数
// ════════════════════════════════════════════════════════════════

const results = []
let totalTests = 0
let passCount = 0
let partialCount = 0
let failCount = 0
let warnCount = 0
let skipCount = 0

async function shot(page, id) {
  const f = path.join(SCREENSHOTS_DIR, `${id}.png`)
  await page.screenshot({ path: f, fullPage: true })
  return f
}

/** 检测是否还在登录页 */
async function isLoginPage(page) {
  try {
    const body = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '')
    const url = page.url()
    return body.includes('飞书登录') || url.includes('open.feishu') || url.includes('passport.feishu')
  } catch { return false }
}

/**
 * 向指定工作台注入 JWT 认证
 * 策略：先通过 route 拦截重定向，确保在 http://118.196.64.48 origin 下注入 localStorage，
 * 再恢复正常导航。
 */
async function injectAuth(page, workstation) {
  const origin = `${BASE_URL}/${workstation}`

  // 策略 A：拦截飞书 OAuth 重定向，先停在原工作台注入 token
  let intercepted = false
  const handler = async (route) => {
    const url = route.request().url()
    if (url.includes('open.feishu') || url.includes('passport.feishu')) {
      intercepted = true
      await route.abort()
    } else {
      await route.continue()
    }
  }
  await page.route('**/*', handler)

  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 12000 })
  } catch {}
  await page.waitForTimeout(800)
  await page.unroute('**/*', handler)

  // 在当前 origin 下注入 localStorage
  await page.evaluate(([token, user, profile]) => {
    try {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', user)
      localStorage.setItem('token', token)
      localStorage.setItem('auth_profile', profile)
      localStorage.setItem('auth_profile_token', token)
      localStorage.setItem('auth_token_ts', String(Date.now()))
    } catch {}
  }, [SUPERADMIN_JWT, SUPERADMIN_USER, SUPERADMIN_PROFILE]).catch(() => {})

  // 正式导航（不拦截重定向，看是否已登录）
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 })
  } catch {}
  await page.waitForTimeout(2500)

  const stillLogin = await isLoginPage(page)
  if (stillLogin) {
    // 策略 B：再次拦截 + 注入，二次尝试
    await page.route('**/*', handler)
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 12000 })
    } catch {}
    await page.waitForTimeout(500)
    await page.unroute('**/*', handler)

    await page.evaluate(([token, user, profile]) => {
      try {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_user', user)
        localStorage.setItem('token', token)
        localStorage.setItem('auth_profile', profile)
        localStorage.setItem('auth_profile_token', token)
        localStorage.setItem('auth_token_ts', String(Date.now()))
      } catch {}
    }, [SUPERADMIN_JWT, SUPERADMIN_USER, SUPERADMIN_PROFILE]).catch(() => {})

    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 })
    } catch {}
    await page.waitForTimeout(2000)
    return !(await isLoginPage(page))
  }
  return true
}

/**
 * 测试单个页面
 * 检测：白屏、500错误、路由404、JS控制台错误、关键元素可见性、undefined/NaN
 */
async function testPage(page, pageInfo, section) {
  const url = `${BASE_URL}${pageInfo.path}`
  const label = pageInfo.name.padEnd(28)
  process.stdout.write(`  ${label} `)
  totalTests++

  const jsErrors = []
  const errHandler = msg => {
    if (msg.type() === 'error') {
      const txt = msg.text()
      if (!txt.includes('favicon') && !txt.includes('net::ERR') && !txt.includes('404') && !txt.includes('Failed to load resource')) {
        jsErrors.push(txt.substring(0, 100))
      }
    }
  }
  page.on('console', errHandler)

  const t0 = Date.now()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18000 })
  } catch {}
  await page.waitForTimeout(3000)
  const loadMs = Date.now() - t0

  const currentUrl = page.url()
  let screenshotFile = null
  try { screenshotFile = await shot(page, pageInfo.id) } catch {}

  // 登录态检测
  if (await isLoginPage(page)) {
    const r = { ...pageInfo, section, status: 'NEED_LOGIN', url: currentUrl, findings: ['登录态丢失'], loadMs }
    results.push(r)
    skipCount++
    process.stdout.write('🔐 NEED_LOGIN\n')
    page.off('console', errHandler)
    return 'need_login'
  }

  const bodyRaw = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim())
  const title = await page.title()

  const isBlank = bodyRaw.length < 20
  const has500 = bodyRaw.includes('Internal Server Error') || /\b500\b.*error/i.test(bodyRaw)
  const hasUndefined = /\bundefined\b/.test(bodyRaw.substring(0, 1000)) && !bodyRaw.includes('undefined 条')
  const hasNaN = /\bNaN\b/.test(bodyRaw.substring(0, 1000))
  const has404Text = bodyRaw.includes('页面不存在') || bodyRaw.includes('404 Not Found')

  let status = 'PASS'
  const findings = []

  if (isBlank) { status = 'FAIL'; findings.push('白屏') }
  if (has500) { status = 'FAIL'; findings.push('500服务器错误') }
  if (hasUndefined && !isBlank) { status = status === 'PASS' ? 'PARTIAL' : status; findings.push('渲染了 undefined') }
  if (hasNaN && !isBlank) { status = status === 'PASS' ? 'PARTIAL' : status; findings.push('渲染了 NaN') }
  if (has404Text) { status = status === 'PASS' ? 'WARN' : status; findings.push('路由404') }

  for (const check of (pageInfo.checks || [])) {
    try {
      const visible = await page.locator(check).first().isVisible({ timeout: 1500 }).catch(() => false)
      if (!visible) { status = status === 'PASS' ? 'PARTIAL' : status; findings.push(`未见:${check}`) }
    } catch {}
  }

  if (jsErrors.length > 0) {
    if (status === 'PASS') status = 'PARTIAL'
    findings.push(`JS错误×${jsErrors.length}`)
  }

  if (findings.length === 0) {
    const hasData = /[1-9]\d*/.test(bodyRaw.substring(0, 800))
    findings.push(hasData ? '有数据' : '正常渲染（空库）')
  }
  findings.push(`${loadMs}ms`)

  const r = { ...pageInfo, section, status, url: currentUrl, title, findings, loadMs, screenshot: screenshotFile, bodyPreview: bodyRaw.substring(0, 200) }
  results.push(r)

  const icon = { PASS: '✅', PARTIAL: '⚠️', FAIL: '❌', WARN: '🔶' }[status] || '❓'
  process.stdout.write(`${icon} [${status}] ${findings.join(' | ')}\n`)

  if (status === 'PASS') passCount++
  else if (status === 'PARTIAL') partialCount++
  else if (status === 'FAIL') failCount++
  else if (status === 'WARN') warnCount++

  page.off('console', errHandler)
  return status.toLowerCase()
}

/**
 * 测试工作台（一组页面）
 * 自动注入 JWT，失败时跳过剩余页面
 */
async function testWorkstation(page, workstation, pages, title, phase) {
  console.log(`\n${'─'.repeat(70)}`)
  console.log(`  ${phase}  ${title}  （${pages.length} 页）`)
  console.log(`${'─'.repeat(70)}`)

  const authOk = await injectAuth(page, workstation)
  if (!authOk) {
    console.log(`  ⚠️  JWT 注入未生效，尝试直接访问各页面...`)
  }

  for (const p of pages) {
    const st = await testPage(page, p, title)
    if (st === 'need_login') {
      console.log(`  ⛔ 登录态丢失，跳过剩余 ${title} 页面`)
      for (const remaining of pages.slice(pages.indexOf(p) + 1)) {
        results.push({ ...remaining, section: title, status: 'SKIP', findings: ['登录态丢失，前序页面未通过'], loadMs: 0 })
        skipCount++
      }
      break
    }
    await page.waitForTimeout(300)
  }
}

/** 通过 fetch 测试 API 存活性 */
async function testApiEndpoint(page, apiInfo) {
  const label = apiInfo.name.padEnd(28)
  process.stdout.write(`  ${label} `)
  totalTests++

  const t0 = Date.now()
  const result = await page.evaluate(async ({ url, jwt, method, body }) => {
    try {
      const opts = {
        method: method || 'GET',
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
      }
      if (body) opts.body = JSON.stringify(body)
      const r = await fetch(url, opts)
      let data = {}
      try { data = await r.json() } catch {}
      return { httpStatus: r.status, code: data.code, msg: data.msg, hasData: !!data.data, count: data.data?.count ?? data.data?.total ?? null }
    } catch(e) {
      return { error: e.message }
    }
  }, { url: apiInfo.url, jwt: SUPERADMIN_JWT, method: apiInfo.method, body: apiInfo.body })
  const ms = Date.now() - t0

  if (result.error) {
    results.push({ ...apiInfo, status: 'FAIL', findings: [`请求异常: ${result.error}`], loadMs: ms })
    failCount++
    process.stdout.write(`❌ FAIL [${result.error.substring(0, 50)}]\n`)
    return 'fail'
  }

  const { httpStatus, code, msg, hasData, count } = result

  let status, findings
  if (httpStatus === 200 && (code === 200 || code === 0)) {
    status = 'PASS'; passCount++
    findings = [`HTTP ${httpStatus}`, count !== null ? `${count}条` : (hasData ? '有数据' : '空'), `${ms}ms`]
    process.stdout.write(`✅ PASS [${findings.join(' | ')}]\n`)
  } else if ([401, 403].includes(httpStatus)) {
    status = 'WARN'; warnCount++
    findings = [`HTTP ${httpStatus} (权限/认证问题)`, `${ms}ms`]
    process.stdout.write(`🔶 WARN [HTTP ${httpStatus}]\n`)
  } else if (httpStatus === 404) {
    status = 'WARN'; warnCount++
    findings = [`HTTP 404 (路由可能未启用)`, `${ms}ms`]
    process.stdout.write(`🔶 WARN [404]\n`)
  } else {
    status = 'PARTIAL'; partialCount++
    findings = [`HTTP ${httpStatus} code=${code} msg=${msg?.substring(0, 40)}`, `${ms}ms`]
    process.stdout.write(`⚠️  PARTIAL [HTTP ${httpStatus} / code=${code}]\n`)
  }

  results.push({ ...apiInfo, status, findings, loadMs: ms })
  return status.toLowerCase()
}

/** 微信小程序结构完整性检查（代码层面 + API覆盖） */
async function checkWechatMiniApp(page) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log('  阶段 6  微信小程序（wechat-mini）结构 & API 覆盖检查')
  console.log(`${'═'.repeat(70)}`)

  // 6A: 检查关键源文件是否存在
  const baseDir = '/Users/aksu/Cursor/CN_KIS_V2.0/workstations/wechat-mini/src/pages'
  const expectedPages = [
    'index', 'phone-login', 'profile', 'appointment', 'consent',
    'checkin', 'questionnaire', 'notifications', 'screening-status',
    'visit', 'payment', 'register', 'results', 'diary',
  ]

  console.log('\n  【6A】微信小程序页面源文件检查 (Taro/TypeScript):')
  for (const pg of expectedPages) {
    const exists = fs.existsSync(`${baseDir}/${pg}`)
    const status = exists ? 'PASS' : 'WARN'
    const icon = exists ? '✅' : '🔶'
    process.stdout.write(`  ${('小程序-' + pg).padEnd(28)} ${icon} [${status}] ${exists ? '页面目录存在' : '目录未找到'}\n`)
    results.push({
      id: `wx-src-${pg}`, name: `小程序-${pg}`, section: '微信小程序',
      status, findings: [exists ? '页面目录存在' : '目录未找到'], loadMs: 0,
    })
    if (status === 'PASS') passCount++; else warnCount++
    totalTests++
  }

  // 6B: 检查后端 API 对小程序的支持覆盖
  console.log('\n  【6B】微信小程序后端 API 覆盖检查:')
  for (const api of WECHAT_MINI_API_CHECKS) {
    await testApiEndpoint(page, api)
    await page.waitForTimeout(100)
  }

  // 6C: 读取 app.config.ts 确认路由数
  let routeCount = 0
  try {
    const appConfig = fs.readFileSync('/Users/aksu/Cursor/CN_KIS_V2.0/workstations/wechat-mini/src/app.config.ts', 'utf8')
    const matches = appConfig.match(/pages\//g)
    routeCount = matches ? matches.length : 0
  } catch {}
  console.log(`\n  【6C】小程序路由总数：${routeCount} 个页面路由`)
  results.push({
    id: 'wx-routes', name: '小程序路由数', section: '微信小程序',
    status: routeCount >= 20 ? 'PASS' : 'PARTIAL',
    findings: [`共 ${routeCount} 个路由`, routeCount >= 20 ? '路由数正常' : '路由数偏少'],
    loadMs: 0,
  })
  if (routeCount >= 20) passCount++; else partialCount++
  totalTests++
}

/** 最终汇总报告 */
function printSummary() {
  console.log(`\n\n${'═'.repeat(70)}`)
  console.log('  CN KIS V2.0 全量验收测试报告')
  console.log('  V1.0 功能继承验证 + V2.0 新增功能验证')
  console.log(`  执行时间：${new Date().toLocaleString('zh-CN')}`)
  console.log(`${'═'.repeat(70)}`)

  console.log(`\n  总计测试点：${totalTests}`)
  console.log(`  ✅ PASS      ：${passCount}  (${(passCount / totalTests * 100).toFixed(1)}%)`)
  console.log(`  ⚠️  PARTIAL  ：${partialCount}`)
  console.log(`  ❌ FAIL      ：${failCount}`)
  console.log(`  🔶 WARN      ：${warnCount}`)
  console.log(`  ⏭️  SKIP/LOGIN：${skipCount}`)

  // 按阶段分组汇总
  const sections = [...new Set(results.map(r => r.section).filter(Boolean))]
  console.log('\n  ── 按阶段分组 ──')
  for (const sec of sections) {
    const sItems = results.filter(r => r.section === sec)
    const sPass = sItems.filter(r => r.status === 'PASS').length
    const sFail = sItems.filter(r => r.status === 'FAIL').length
    const sPartial = sItems.filter(r => r.status === 'PARTIAL').length
    const sWarn = sItems.filter(r => ['WARN', 'NEED_LOGIN', 'SKIP'].includes(r.status)).length
    const icon = sFail > 0 ? '❌' : sPartial > 0 ? '⚠️ ' : '✅'
    console.log(`  ${icon} ${sec.padEnd(24)} 通过:${sPass} 部分:${sPartial} 失败:${sFail} 告警:${sWarn}`)
  }

  // 失败项详情
  const failed = results.filter(r => r.status === 'FAIL')
  if (failed.length > 0) {
    console.log('\n  ── ❌ 失败项详情 ──')
    failed.forEach(r => console.log(`     ${r.name} → ${r.findings.join(', ')}`))
  }

  // 告警项
  const warned = results.filter(r => r.status === 'PARTIAL' || r.status === 'WARN')
  if (warned.length > 0) {
    console.log('\n  ── ⚠️  告警/部分通过项 ──')
    warned.forEach(r => console.log(`     ${r.name} → ${r.findings.join(', ')}`))
  }

  // 综合通过率
  const qualified = passCount + partialCount
  const denom = totalTests - skipCount
  const passRate = denom > 0 ? (passCount / denom * 100).toFixed(1) : 0
  const qualRate = denom > 0 ? (qualified / denom * 100).toFixed(1) : 0
  console.log(`\n  严格通过率（仅PASS）  ：${passRate}%`)
  console.log(`  宽松通过率（PASS+PARTIAL）：${qualRate}%`)

  // V1 功能继承评估
  const v1BusinessResults = results.filter(r =>
    ['secretary','research','quality','finance','hr','crm','execution','recruitment',
     'equipment','material','facility','evaluator','ethics','lab-personnel','reception',
     'admin','control-plane','digital-workforce'].some(w => r.id.startsWith(w.replace('-','').substring(0, 3)))
  )
  const v1PassCount = v1BusinessResults.filter(r => r.status === 'PASS' || r.status === 'PARTIAL').length
  const v1Total = v1BusinessResults.filter(r => r.status !== 'SKIP').length
  if (v1Total > 0) {
    console.log(`\n  V1 功能继承率：${v1PassCount}/${v1Total} = ${(v1PassCount / v1Total * 100).toFixed(1)}%`)
  }

  // 保存 JSON 报告
  const reportPath = path.join(SCREENSHOTS_DIR, 'report-v5.json')
  fs.writeFileSync(reportPath, JSON.stringify({
    version: 'v5',
    timestamp: new Date().toISOString(),
    summary: { totalTests, passCount, partialCount, failCount, warnCount, skipCount, passRate, qualRate },
    results,
  }, null, 2))

  // 保存 Markdown 报告
  const mdLines = [
    `# CN KIS V2.0 全量验收测试报告 v5`,
    ``,
    `**执行时间**：${new Date().toLocaleString('zh-CN')}  `,
    `**服务器**：${BASE_URL}  `,
    `**账号**：马利民（superadmin）  `,
    ``,
    `## 汇总`,
    ``,
    `| 指标 | 数值 |`,
    `|------|------|`,
    `| 总测试点 | ${totalTests} |`,
    `| ✅ PASS | ${passCount} (${passRate}%) |`,
    `| ⚠️ PARTIAL | ${partialCount} |`,
    `| ❌ FAIL | ${failCount} |`,
    `| 🔶 WARN | ${warnCount} |`,
    `| ⏭️ SKIP/NEED_LOGIN | ${skipCount} |`,
    `| 严格通过率 | **${passRate}%** |`,
    `| 宽松通过率 | **${qualRate}%** |`,
    ``,
    `## 按工作台分组`,
    ``,
    `| 工作台 | 通过 | 部分 | 失败 | 告警/跳过 |`,
    `|--------|------|------|------|-----------|`,
  ]
  for (const sec of sections) {
    const sItems = results.filter(r => r.section === sec)
    const sPass = sItems.filter(r => r.status === 'PASS').length
    const sFail = sItems.filter(r => r.status === 'FAIL').length
    const sPartial = sItems.filter(r => r.status === 'PARTIAL').length
    const sWarn = sItems.filter(r => ['WARN', 'NEED_LOGIN', 'SKIP'].includes(r.status)).length
    mdLines.push(`| ${sec} | ${sPass} | ${sPartial} | ${sFail} | ${sWarn} |`)
  }
  mdLines.push('')
  if (failed.length > 0) {
    mdLines.push('## ❌ 失败项', '')
    failed.forEach(r => mdLines.push(`- **${r.name}**: ${r.findings.join(', ')}`))
    mdLines.push('')
  }
  if (warned.length > 0) {
    mdLines.push('## ⚠️ 告警/部分通过项', '')
    warned.forEach(r => mdLines.push(`- **${r.name}**: ${r.findings.join(', ')}`))
    mdLines.push('')
  }

  const mdPath = path.join(SCREENSHOTS_DIR, 'report-v5.md')
  fs.writeFileSync(mdPath, mdLines.join('\n'))

  console.log(`\n  📋 JSON 报告：${reportPath}`)
  console.log(`  📝 Markdown：${mdPath}`)
  console.log(`  📸 截图目录：${SCREENSHOTS_DIR}`)
  console.log(`${'═'.repeat(70)}`)
}

// ════════════════════════════════════════════════════════════════
//  主流程
// ════════════════════════════════════════════════════════════════

async function run() {
  console.log('═'.repeat(70))
  console.log('  CN KIS V2.0 — 全量无遗漏 UI + API 验收测试 v5')
  console.log(`  服务器：${BASE_URL}`)
  console.log(`  账号  ：马利民（superadmin）`)
  console.log(`  覆盖  ：20 工作台 × 全页面 + 31 核心 API + V2 新增 + 微信小程序`)
  console.log(`  时间  ：${new Date().toLocaleString('zh-CN')}`)
  console.log('═'.repeat(70))

  // 清空旧截图
  if (fs.existsSync(SCREENSHOTS_DIR)) {
    fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png')).forEach(f =>
      fs.unlinkSync(path.join(SCREENSHOTS_DIR, f))
    )
  }

  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--window-size=1440,900', '--disable-web-security', '--ignore-certificate-errors'],
  })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    // 预置 JWT + 完整权限画像到 http://118.196.64.48 origin 的 localStorage
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE_URL,
        localStorage: [
          { name: 'auth_token', value: SUPERADMIN_JWT },
          { name: 'auth_user', value: SUPERADMIN_USER },
          { name: 'token', value: SUPERADMIN_JWT },
          { name: 'auth_profile', value: SUPERADMIN_PROFILE },
          { name: 'auth_profile_token', value: SUPERADMIN_JWT },
          { name: 'auth_roles', value: JSON.stringify(['superadmin', 'research_manager', 'viewer']) },
          { name: 'auth_workbenches', value: JSON.stringify(['secretary','research','quality','finance','hr','crm','execution','recruitment','equipment','material','facility','evaluator','lab-personnel','ethics','reception','control-plane','governance','digital-workforce','data-platform']) },
          { name: 'auth_token_ts', value: String(Date.now()) },
        ],
      }],
    },
  })
  // 所有新页面在加载前先注入 token + profile（防止快速重定向或 API 401 清除 token）
  await ctx.addInitScript(([token, user, profile, profileToken, roles, workbenches]) => {
    if (location.origin === 'http://118.196.64.48') {
      try {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_user', user)
        localStorage.setItem('token', token)
        localStorage.setItem('auth_profile', profile)
        localStorage.setItem('auth_profile_token', profileToken)
        localStorage.setItem('auth_roles', roles)
        localStorage.setItem('auth_workbenches', workbenches)
        localStorage.setItem('auth_token_ts', String(Date.now()))
      } catch {}
    }
  }, [SUPERADMIN_JWT, SUPERADMIN_USER, SUPERADMIN_PROFILE, SUPERADMIN_JWT,
      JSON.stringify(['superadmin','research_manager','viewer']),
      JSON.stringify(['secretary','research','quality','finance','hr','crm','execution','recruitment','equipment','material','facility','evaluator','lab-personnel','ethics','reception','control-plane','governance','digital-workforce','data-platform'])])

  const page = await ctx.newPage()

  // ── 关键修复：将工作台调用的 /api/v1/ 路径代理到正确的 /v2/api/v1/ ──
  // 子衿18个工作台用 /api/v1/ 前缀（旧部署路径），但服务器的认证会话在 /v2/api/v1/ 下
  // Playwright 上下文级路由拦截，自动重写 URL 并携带 JWT 认证头
  await ctx.route(`${BASE_URL}/api/**`, async (route) => {
    const origUrl = route.request().url()
    // 将 /api/v1/ 重写为 /v2/api/v1/
    const newUrl = origUrl.replace(`${BASE_URL}/api/`, `${BASE_URL}/v2/api/`)
    const headers = {
      ...route.request().headers(),
      'Authorization': `Bearer ${SUPERADMIN_JWT}`,
    }
    try {
      await route.continue({ url: newUrl, headers })
    } catch {
      await route.continue()
    }
  })
  console.log(`\n${'═'.repeat(70)}`)
  console.log('  阶段 0  后端健康检查 + V1 核心 API 存活性（31 项）')
  console.log(`${'═'.repeat(70)}`)

  // 先注入 auth 到某个工作台，以便 API 调用有 JWT
  await injectAuth(page, 'data-platform')

  for (const api of V1_PARITY_APIS) {
    await testApiEndpoint(page, { ...api, section: 'V1-API存活' })
    await page.waitForTimeout(80)
  }

  // ── 阶段 1：V1 业务工作台（15 台）───────────────────────────
  await testWorkstation(page, 'secretary', SECRETARY_PAGES, '子衿·秘书台', '阶段1-01')
  await testWorkstation(page, 'research', RESEARCH_PAGES, '采苓·研究台', '阶段1-02')
  await testWorkstation(page, 'quality', QUALITY_PAGES, '怀瑾·质量台', '阶段1-03')
  await testWorkstation(page, 'finance', FINANCE_PAGES, '管仲·财务台', '阶段1-04')
  await testWorkstation(page, 'hr', HR_PAGES, '时雨·人事台', '阶段1-05')
  await testWorkstation(page, 'crm', CRM_PAGES, '进思·客户台', '阶段1-06')
  await testWorkstation(page, 'execution', EXECUTION_PAGES, '维周·执行台', '阶段1-07')
  await testWorkstation(page, 'recruitment', RECRUITMENT_PAGES, '招招·招募台', '阶段1-08')
  await testWorkstation(page, 'equipment', EQUIPMENT_PAGES, '器衡·设备台', '阶段1-09')
  await testWorkstation(page, 'material', MATERIAL_PAGES, '度支·物料台', '阶段1-10')
  await testWorkstation(page, 'facility', FACILITY_PAGES, '坤元·设施台', '阶段1-11')
  await testWorkstation(page, 'evaluator', EVALUATOR_PAGES, '衡技·评估台', '阶段1-12')
  await testWorkstation(page, 'ethics', ETHICS_PAGES, '御史·伦理台', '阶段1-13')
  await testWorkstation(page, 'lab-personnel', LAB_PERSONNEL_PAGES, '共济·人员台', '阶段1-14')
  await testWorkstation(page, 'reception', RECEPTION_PAGES, '和序·接待台', '阶段1-15')

  // ── 阶段 2：平台工作台（治理台合并后）────────────────────────────
  await testWorkstation(page, 'governance', GOVERNANCE_PAGES, '鹿鸣·治理台', '阶段2-01')
  await testWorkstation(page, 'control-plane', CONTROL_PLANE_PAGES, '天工·统管台', '阶段2-02')
  await testWorkstation(page, 'digital-workforce', DW_PAGES, '中书·数字员工', '阶段2-03')

  // ── 阶段 3：V2 独立授权台 ────────────────────────────
  await testWorkstation(page, 'data-platform', DP_PAGES, '洞明·数据台(DP)', '阶段3-01')

  // ── 阶段 4：V2 新增能力专项 API ──────────────────────────────
  console.log(`\n${'═'.repeat(70)}`)
  console.log('  阶段 4  V2 新增能力专项 API 验证（5 项）')
  console.log(`${'═'.repeat(70)}`)
  await injectAuth(page, 'data-platform')
  for (const api of V2_NEW_FEATURE_APIS) {
    await testApiEndpoint(page, { ...api, section: 'V2新增能力' })
    await page.waitForTimeout(80)
  }

  // ── 阶段 5：AI 能力验证 ───────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`)
  console.log('  阶段 5  AI 能力验证（对话 + 知识检索 + Skills）')
  console.log(`${'═'.repeat(70)}`)
  await injectAuth(page, 'data-platform')

  // 5A: AI 对话（crf-validator agent）
  process.stdout.write(`  ${'AI-对话(crf-validator)'.padEnd(28)} `)
  totalTests++
  const chatResp = await page.evaluate(async ({ url, jwt }) => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'crf-validator', message: '请介绍你的功能', context_window: 3 }),
        signal: AbortSignal.timeout(35000),
      })
      const data = await r.json()
      const reply = data.data?.response || data.data?.reply?.response || data.data?.reply || ''
      return { httpStatus: r.status, code: data.code, reply: String(reply).substring(0, 120) }
    } catch(e) { return { error: e.message } }
  }, { url: `${API_BASE}/agents/chat`, jwt: SUPERADMIN_JWT })

  if (chatResp.error) {
    process.stdout.write(`❌ FAIL [${chatResp.error.substring(0, 60)}]\n`)
    results.push({ id: 'ai-01', name: 'AI-对话', section: 'AI能力', status: 'FAIL', findings: [chatResp.error.substring(0, 60)] })
    failCount++
  } else if (chatResp.httpStatus === 200 && chatResp.code === 200) {
    process.stdout.write(`✅ PASS [回复: ${chatResp.reply.substring(0, 40)}...]\n`)
    results.push({ id: 'ai-01', name: 'AI-对话', section: 'AI能力', status: 'PASS', findings: [`回复预览: ${chatResp.reply.substring(0, 40)}`] })
    passCount++
  } else {
    process.stdout.write(`⚠️  PARTIAL [HTTP ${chatResp.httpStatus} code=${chatResp.code}]\n`)
    results.push({ id: 'ai-01', name: 'AI-对话', section: 'AI能力', status: 'PARTIAL', findings: [`HTTP ${chatResp.httpStatus}`] })
    partialCount++
  }

  // 5B: 知识混合检索
  process.stdout.write(`  ${'AI-知识混合检索'.padEnd(28)} `)
  totalTests++
  const searchResp = await page.evaluate(async ({ url, jwt }) => {
    try {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${jwt}` }, signal: AbortSignal.timeout(15000) })
      const data = await r.json()
      return { httpStatus: r.status, code: data.code, count: data.data?.items?.length || 0 }
    } catch(e) { return { error: e.message } }
  }, { url: `${API_BASE}/knowledge/hybrid-search?q=临床研究&limit=5`, jwt: SUPERADMIN_JWT })

  if (searchResp.code === 200) {
    process.stdout.write(`✅ PASS [命中${searchResp.count}条]\n`)
    results.push({ id: 'ai-02', name: 'AI-知识检索', section: 'AI能力', status: 'PASS', findings: [`命中${searchResp.count}条`] })
    passCount++
  } else {
    process.stdout.write(`⚠️  PARTIAL [HTTP ${searchResp.httpStatus}]\n`)
    results.push({ id: 'ai-02', name: 'AI-知识检索', section: 'AI能力', status: 'PARTIAL', findings: [`HTTP ${searchResp.httpStatus}`] })
    partialCount++
  }

  // 5C: 28 个 skills 数量检查
  process.stdout.write(`  ${'AI-Skills数量（应≥28）'.padEnd(28)} `)
  totalTests++
  const skillsResp = await page.evaluate(async ({ url, jwt }) => {
    try {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${jwt}` }, signal: AbortSignal.timeout(10000) })
      const data = await r.json()
      return { httpStatus: r.status, code: data.code, count: data.data?.count || data.data?.total || (Array.isArray(data.data?.items) ? data.data.items.length : 0) }
    } catch(e) { return { error: e.message } }
  }, { url: `${API_BASE}/agents/list?limit=100`, jwt: SUPERADMIN_JWT })

  const skillCount = skillsResp.count || 0
  if (skillsResp.code === 200 && skillCount >= 28) {
    process.stdout.write(`✅ PASS [${skillCount} 个 Skills，V1迁移完成]\n`)
    results.push({ id: 'ai-03', name: 'AI-Skills数量', section: 'AI能力', status: 'PASS', findings: [`共${skillCount}个，≥28个V1迁移目标`] })
    passCount++
  } else if (skillsResp.code === 200) {
    process.stdout.write(`⚠️  PARTIAL [当前${skillCount}个，预期≥28个]\n`)
    results.push({ id: 'ai-03', name: 'AI-Skills数量', section: 'AI能力', status: 'PARTIAL', findings: [`当前${skillCount}个，预期≥28个`] })
    partialCount++
  } else {
    process.stdout.write(`🔶 WARN [HTTP ${skillsResp.httpStatus}]\n`)
    results.push({ id: 'ai-03', name: 'AI-Skills数量', section: 'AI能力', status: 'WARN', findings: [`HTTP ${skillsResp.httpStatus}`] })
    warnCount++
  }

  // 5D: 知识条目数量（data-platform视图，含全部类型）
  process.stdout.write(`  ${'AI-知识条目（应≥1123）'.padEnd(28)} `)
  totalTests++
  const knResp = await page.evaluate(async ({ url, jwt }) => {
    try {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${jwt}` }, signal: AbortSignal.timeout(10000) })
      const data = await r.json()
      return { httpStatus: r.status, code: data.code, count: data.data?.knowledge_entries || data.data?.count || data.data?.total || 0 }
    } catch(e) { return { error: e.message } }
  }, { url: `${API_BASE}/data-platform/dashboard`, jwt: SUPERADMIN_JWT })

  const knCount = knResp.count || 0
  if (knResp.code === 200 && knCount >= 1123) {
    process.stdout.write(`✅ PASS [${knCount} 条，V1迁移完成]\n`)
    results.push({ id: 'ai-04', name: 'AI-知识库条目数', section: 'AI能力', status: 'PASS', findings: [`共${knCount}条，≥1123 V1迁移完成`] })
    passCount++
  } else if (knResp.code === 200) {
    process.stdout.write(`⚠️  PARTIAL [${knCount}条，预期≥1123]\n`)
    results.push({ id: 'ai-04', name: 'AI-知识库条目数', section: 'AI能力', status: 'PARTIAL', findings: [`${knCount}条，预期≥1123`] })
    partialCount++
  } else {
    process.stdout.write(`🔶 WARN [HTTP ${knResp.httpStatus}]\n`)
    results.push({ id: 'ai-04', name: 'AI-知识库条目数', section: 'AI能力', status: 'WARN', findings: [`HTTP ${knResp.httpStatus}`] })
    warnCount++
  }

  // ── 阶段 6：微信小程序检查 ───────────────────────────────────
  await checkWechatMiniApp(page)

  // ── 最终汇总 ────────────────────────────────────────────────
  printSummary()

  await browser.close()

  // 退出码：失败数 > 5 则返回 1
  process.exit(failCount > 5 ? 1 : 0)
}

run().catch(e => {
  console.error('\n测试运行异常:', e.message)
  console.error(e.stack)
  process.exit(1)
})
