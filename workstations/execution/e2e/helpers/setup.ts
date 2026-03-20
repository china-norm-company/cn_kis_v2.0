/**
 * Playwright E2E 测试辅助 — 认证注入 + API 路由拦截
 *
 * 策略：
 * 1. addInitScript 注入 localStorage → 跳过飞书 OAuth
 * 2. page.route 拦截 /api/v1/** 请求 → 返回预设模拟数据
 *
 * 应用使用 HashRouter，导航路径格式：/execution/#/dashboard
 */
import { type Page } from '@playwright/test'
import {
  AUTH_TOKEN,
  buildAuthProfile,
  CRC_SUPERVISOR_USER,
  CRC_USER,
  SCHEDULER_USER,
  TECHNICIAN_USER,
  crcSupervisorDashboard,
  crcDashboard,
  schedulerDashboard,
  crossProjectOverview,
  projectContext,
  kpiData,
  analyticsSummary,
  workOrderList,
  protocolList,
  protocolDetail,
  crfTemplate,
  crfRecordDraft,
  crfRecordSubmitted,
  crfValidationResult,
  qrCodeResolveResult,
  workOrderChecklists,
  qualityAuditResults,
  workOrderDetailWithCRF,
  progressReport,
  capacityPrediction,
} from './mock-data'

export type RoleType = 'crc_supervisor' | 'crc' | 'scheduler' | 'technician'

const userByRole = {
  crc_supervisor: CRC_SUPERVISOR_USER,
  crc: CRC_USER,
  scheduler: SCHEDULER_USER,
  technician: TECHNICIAN_USER,
}

/** 注入指定角色的登录状态 */
export async function injectAuth(page: Page, role: RoleType) {
  const token = AUTH_TOKEN
  const user = userByRole[role]
  const profile = buildAuthProfile(role)

  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token, user, profile },
  )
}

/** 设置 API 路由拦截 */
export async function setupApiMocks(page: Page, role: RoleType) {
  const profile = buildAuthProfile(role)

  // ---------- Auth ----------
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: profile } })
  })

  // ---------- CRC 主管仪表盘 ----------
  await page.route('**/api/v1/workorder/crc-dashboard**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: crcSupervisorDashboard } })
  })

  // ---------- CRC 协调员仪表盘 ----------
  await page.route('**/api/v1/workorder/crc-my-dashboard**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: crcDashboard } })
  })

  // ---------- 排程员仪表盘 ----------
  await page.route('**/api/v1/workorder/scheduler-dashboard**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: schedulerDashboard } })
  })

  // ---------- 跨项目排程概览 ----------
  await page.route('**/api/v1/scheduling/cross-project-overview**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: crossProjectOverview } })
  })

  // ---------- 项目执行上下文 ----------
  await page.route('**/api/v1/workorder/project-context/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/decisions')) {
      await route.fulfill({ json: { code: 0, msg: '决策已记录', data: { id: Date.now(), title: 'test' } } })
    } else if (url.includes('/change-responses')) {
      await route.fulfill({ json: { code: 0, msg: '变更响应已记录', data: { id: Date.now(), status: 'pending' } } })
    } else if (route.request().method() === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: projectContext } })
    } else {
      await route.fulfill({ json: { code: 0, msg: '保存成功', data: { id: 1, protocol_id: 1 } } })
    }
  })

  // ---------- 进展报告 ----------
  await page.route('**/api/v1/workorder/progress-report/*/send', async (route) => {
    await route.fulfill({ json: { code: 0, msg: '报告已发送', data: { sent: true } } })
  })
  await page.route('**/api/v1/workorder/progress-report/**', async (route) => {
    await route.fulfill({
      json: {
        code: 0, msg: 'ok',
        data: {
          protocol_id: 1, report_date: new Date().toISOString().split('T')[0],
          generated_at: new Date().toISOString(),
          workorder_summary: { today_total: 12, today_completed: 8, today_in_progress: 3, today_completion_rate: 66.7, overall_total: 120, overall_completed: 90, overall_completion_rate: 75.0, overdue_count: 1 },
          exceptions: [{ id: 1, type: 'subject_no_show', severity: 'medium', description: '受试者S-010未按时到达', status: 'open', work_order_id: 198 }],
          sample_status: { distributed: 45, returned: 42, pending_return: 3 },
          tomorrow_preview: { date: '2026-02-18', total_scheduled: 10, subjects_count: 6 },
          highlights: ['HYD-2026-001完成率达到64%'], issues: ['1个逾期工单'],
        },
      },
    })
  })

  // ---------- KPI 指标 ----------
  await page.route('**/api/v1/workorder/analytics/kpi**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: kpiData } })
  })

  // ---------- 分析概览 ----------
  await page.route('**/api/v1/workorder/analytics/summary**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: analyticsSummary } })
  })

  // ---------- 导出 ----------
  await page.route('**/api/v1/workorder/analytics/export**', async (route) => {
    await route.fulfill({ body: 'csv-data', headers: { 'content-type': 'text/csv' } })
  })

  // ---------- 工单统计 ----------
  await page.route('**/api/v1/workorder/stats**', async (route) => {
    await route.fulfill({
      json: {
        code: 0, msg: 'ok',
        data: { total: 120, pending: 8, assigned: 12, in_progress: 18, completed: 70, review: 4, approved: 6, rejected: 2 },
      },
    })
  })

  // ---------- 今日工单 ----------
  await page.route('**/api/v1/workorder/my-today**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: workOrderList.items } })
  })

  // ---------- 工单列表 ----------
  await page.route('**/api/v1/workorder/list**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: workOrderList } })
  })

  // ---------- 创建工单 ----------
  await page.route('**/api/v1/workorder/create**', async (route) => {
    await route.fulfill({
      json: {
        code: 0, msg: '工单已创建',
        data: { id: 999, title: '手动创建的新工单', status: 'pending', enrollment_id: 101 },
      },
    })
  })

  // ---------- 工单详情（含 crf_template_id） ----------
  await page.route(/\/api\/v1\/workorder\/\d+$/, async (route) => {
    if (route.request().method() === 'GET') {
      const url = route.request().url()
      const idMatch = url.match(/\/workorder\/(\d+)$/)
      const id = idMatch ? Number(idMatch[1]) : 0
      if (id === 202) {
        await route.fulfill({ json: { code: 0, msg: 'ok', data: workOrderDetailWithCRF } })
      } else {
        await route.fulfill({ json: { code: 0, msg: 'ok', data: workOrderList.items[0] } })
      }
    } else {
      await route.continue()
    }
  })

  // ---------- 工单操作（开始/完成/审批） ----------
  await page.route(/\/api\/v1\/workorder\/\d+\/start$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已开始', data: { ...workOrderDetailWithCRF, status: 'in_progress' } } })
  })
  await page.route(/\/api\/v1\/workorder\/\d+\/complete$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已完成', data: { ...workOrderDetailWithCRF, status: 'completed', completed_at: new Date().toISOString() } } })
  })
  await page.route(/\/api\/v1\/workorder\/\d+\/approve$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已批准', data: { ...workOrderDetailWithCRF, status: 'approved' } } })
  })
  await page.route(/\/api\/v1\/workorder\/\d+\/reject$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已拒绝', data: { ...workOrderDetailWithCRF, status: 'rejected' } } })
  })
  await page.route(/\/api\/v1\/workorder\/\d+\/assign$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已分配', data: { id: 202, assigned_to: 2, due_date: null, notified: true } } })
  })
  await page.route(/\/api\/v1\/workorder\/\d+\/review$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已提交审批', data: { ...workOrderDetailWithCRF, status: 'review' } } })
  })

  // ---------- 产能预测 ----------
  await page.route(/\/api\/v1\/scheduling\/plans\/\d+\/predict$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: capacityPrediction } })
  })

  // ---------- 工单检查清单 ----------
  let checklistState = workOrderChecklists.map(c => ({ ...c }))
  await page.route(/\/api\/v1\/workorder\/\d+\/checklists$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: checklistState } })
    } else {
      await route.continue()
    }
  })
  await page.route(/\/api\/v1\/workorder\/\d+\/checklists\/\d+\/toggle$/, async (route) => {
    const url = route.request().url()
    const match = url.match(/checklists\/(\d+)\/toggle/)
    const cid = match ? Number(match[1]) : 0
    const item = checklistState.find(c => c.id === cid)
    if (item) item.is_checked = !item.is_checked
    await route.fulfill({ json: { code: 0, msg: 'ok', data: item || {} } })
  })

  // ---------- 工单质量审计 ----------
  await page.route(/\/api\/v1\/workorder\/\d+\/quality-audits$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: qualityAuditResults } })
  })

  // ---------- CRF 模板详情 ----------
  await page.route(/\/api\/v1\/edc\/templates\/\d+$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: crfTemplate } })
  })

  // ---------- CRF 记录（Playwright 路由匹配为 LIFO，后注册的优先） ----------
  // 先注册通用 fallback
  await page.route(/\/api\/v1\/edc\/records/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [], total: 0 } } })
    } else {
      await route.fallback()
    }
  })
  // 再注册具体路由（后注册 = 优先匹配）
  await page.route(/\/api\/v1\/edc\/records\/\d+$/, async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ json: { code: 0, msg: '已保存', data: crfRecordDraft } })
    } else {
      await route.fallback()
    }
  })
  await page.route(/\/api\/v1\/edc\/records\/\d+\/validate$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: crfValidationResult } })
  })
  await page.route(/\/api\/v1\/edc\/records\/\d+\/submit$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已提交', data: crfRecordSubmitted } })
  })
  await page.route(/\/api\/v1\/edc\/records\/create$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已创建', data: crfRecordDraft } })
  })

  // ---------- QR 码解析 ----------
  await page.route('**/api/v1/qrcode/resolve**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: qrCodeResolveResult } })
  })

  // ---------- 协议列表 ----------
  await page.route('**/api/v1/protocol/list**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: protocolList } })
  })

  // ---------- 协议详情 ----------
  await page.route(/\/api\/v1\/protocol\/\d+$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: protocolDetail } })
  })

  // ---------- 通知告警仪表盘 ----------
  await page.route('**/api/v1/notification/alerts-dashboard**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { total_count: 0 } } })
  })

  // ---------- 资源状态概览 ----------
  await page.route('**/api/v1/resource/status-overview**', async (route) => {
    await route.fulfill({
      json: {
        code: 0, msg: 'ok',
        data: {
          personnel: { total: 8, available: 7, gcp_expiring: 0 },
          equipment: { total: 15, active: 12, calibration_expiring: 1 },
          material: { total: 30, in_stock: 28, expiring_soon: 0 },
          method: { total_sops: 20, effective: 18, under_review: 1 },
          environment: { total_venues: 4, recent_compliance_rate: 98, non_compliant: 0 },
        },
      },
    })
  })

  // ---------- 入组列表（创建工单表单用） ----------
  await page.route('**/api/v1/subject/enrollments**', async (route) => {
    const url = route.request().url()
    if (url.includes('enrollment-stats')) {
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { total: 45, enrolled: 32, screening: 8, completed: 5 } },
      })
    } else {
      await route.fulfill({
        json: {
          code: 0, msg: 'ok',
          data: {
            items: [
              { id: 101, enrollment_no: 'ENR-2026-001', subject_id: 1, protocol_id: 1, status: 'enrolled' },
              { id: 102, enrollment_no: 'ENR-2026-002', subject_id: 2, protocol_id: 1, status: 'enrolled' },
            ],
            total: 2,
          },
        },
      })
    }
  })

  // ---------- 入组统计 ----------
  await page.route('**/api/v1/subject/enrollment-stats**', async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { total: 45, enrolled: 32, screening: 8, completed: 5 } },
    })
  })

  // ---------- 偏差列表 ----------
  await page.route('**/api/v1/quality/deviations**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [], total: 0 } } })
  })

  // ---------- 排程发布（含日历同步计数） ----------
  await page.route(/\/api\/v1\/scheduling\/plans\/\d+\/publish$/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '排程已发布', data: { id: 1, status: 'published', calendar_synced_count: 5 } } })
  })

  // ---------- 工单评论 ----------
  await page.route(/\/api\/v1\/workorder\/\d+\/comments$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: [
        { id: 1, work_order_id: 202, author_id: 1, author_name: '陈主管', content: '请注意受试者皮肤敏感情况', create_time: new Date().toISOString() },
        { id: 2, work_order_id: 202, author_id: 2, author_name: '李协调', content: '已确认，将额外关注', create_time: new Date().toISOString() },
      ] } })
    } else {
      await route.fulfill({ json: { code: 0, msg: '评论已添加', data: { id: 3, work_order_id: 202, author_id: 1, author_name: '陈主管', content: '新评论', create_time: new Date().toISOString() } } })
    }
  })

  // ---------- 告警配置 ----------
  await page.route('**/api/v1/workorder/alert-configs**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: [
        { id: 1, alert_type: 'workorder_overdue', threshold: 2, level: 'warning', is_enabled: true },
        { id: 2, alert_type: 'workload_imbalance', threshold: 8, level: 'info', is_enabled: true },
      ] } })
    } else {
      await route.fulfill({ json: { code: 0, msg: '配置已保存', data: { id: 3 } } })
    }
  })

  // ---------- 自动通报配置 ----------
  await page.route('**/api/v1/workorder/auto-report-config**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { protocol_id: 1, enabled: true } } })
  })

  // ---------- 排程相关通用 fallback ----------
  await page.route('**/api/v1/scheduling/**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [], total: 0 } } })
  })

  // ---------- 异常上报 ----------
  await page.route('**/api/v1/workorder/*/exceptions', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { code: 0, msg: '异常已上报', data: { exception_id: 9001 } } })
    } else {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [], total: 0 } } })
    }
  })
}

/** 组合辅助：注入认证 + 设置API模拟 */
export async function setupForRole(page: Page, role: RoleType) {
  await injectAuth(page, role)
  await setupApiMocks(page, role)
}
