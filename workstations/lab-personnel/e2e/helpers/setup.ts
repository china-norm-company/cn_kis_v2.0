/**
 * 实验室人员管理工作台 E2E 测试辅助 — 认证注入 + API 路由拦截
 *
 * 设计思路：
 * - 注入实验室人事主管身份，跳过飞书 OAuth
 * - 所有 API mock 返回贴近真实的化妆品 CRO 实验室人员管理数据
 * - 风险状态机：模拟风险确认与解决流转
 */
import { type Page } from '@playwright/test'
import {
  PERSONNEL_MANAGER_USER, AUTH_TOKEN, authProfileData, authProfileResponse,
  dashboardData, staffList, certificateList, expiryAlerts,
  qualificationMatrix, methodQualList, gapAnalysis,
  scheduleList, slotList, conflictList,
  worktimeLogs, worktimeSummary, utilizationAnalysis, capacityForecast,
  dispatchMonitor, dispatchCandidates,
  riskList, riskStats, riskScanResult,
} from './mock-data'

/**
 * 注入实验室人事主管认证信息
 */
export async function injectAuth(page: Page) {
  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token: AUTH_TOKEN, user: PERSONNEL_MANAGER_USER, profile: authProfileData },
  )
}

// ============================================================================
// 风险状态机
// ============================================================================
class RiskStateMachine {
  private risks = riskList.items.map(r => ({ ...r }))

  getRisks() { return this.risks }
  getRisk(id: number) { return this.risks.find(r => r.id === id) }

  acknowledge(id: number) {
    const r = this.getRisk(id)
    if (r && r.status === 'open') {
      r.status = 'acknowledged'
      r.status_display = '已确认'
    }
    return r
  }

  resolve(id: number, action: string) {
    const r = this.getRisk(id)
    if (r && (r.status === 'open' || r.status === 'acknowledged')) {
      r.status = 'resolved'
      r.status_display = '已解决'
      r.action_taken = action
      r.resolved_at = new Date().toISOString()
    }
    return r
  }
}

// ============================================================================
// API 路由拦截器
// ============================================================================
export async function setupApiMocks(page: Page) {
  const rsm = new RiskStateMachine()

  // Auth profile
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: authProfileResponse })
  })

  // ===== 仪表盘 =====
  await page.route('**/api/v1/lab-personnel/dashboard**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: dashboardData } })
  })

  // ===== 人员档案 =====
  await page.route('**/api/v1/lab-personnel/staff/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/staff/qualification-matrix')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: qualificationMatrix } })
    } else if (url.includes('/staff/list')) {
      const parsed = new URL(url)
      const search = parsed.searchParams.get('search') || ''
      const labRole = parsed.searchParams.get('lab_role') || ''
      const level = parsed.searchParams.get('competency_level') || ''

      let items = [...staffList.items]
      if (search) items = items.filter(s => s.staff_name.includes(search) || s.employee_no.includes(search))
      if (labRole) items = items.filter(s => s.lab_role === labRole)
      if (level) items = items.filter(s => s.competency_level === level)

      await route.fulfill({ json: { code: 200, msg: 'OK', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else if (/\/staff\/\d+\/profile/.test(url) && method === 'POST') {
      await route.fulfill({ json: { code: 200, msg: '档案创建成功', data: staffList.items[0] } })
    } else if (/\/staff\/\d+/.test(url) && method === 'GET') {
      const staffItem = staffList.items[0]
      await route.fulfill({
        json: {
          code: 200, msg: 'OK', data: {
            ...staffItem,
            certificates: certificateList.items.filter(c => c.staff_id === staffItem.staff_id),
            method_qualifications: methodQualList.items.filter(m => m.staff_id === staffItem.staff_id),
            recent_schedules: slotList.items.filter(s => s.staff_id === staffItem.staff_id),
            worktime_summary: worktimeSummary.items.find(w => w.staff_id === staffItem.staff_id) || null,
            risk_alerts: riskList.items.filter(r => r.related_staff_id === staffItem.staff_id),
          },
        },
      })
    } else {
      await route.continue()
    }
  })

  // ===== 证书管理 =====
  await page.route('**/api/v1/lab-personnel/certificates/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/certificates/expiry-alerts')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: expiryAlerts } })
    } else if (url.includes('/certificates/create') && method === 'POST') {
      await route.fulfill({ json: { code: 200, msg: '证书创建成功', data: { id: 99 } } })
    } else if (url.includes('/certificates/list')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: certificateList } })
    } else if (/\/certificates\/\d+\/renew/.test(url)) {
      await route.fulfill({ json: { code: 200, msg: '续期成功', data: { id: 1, status: 'valid' } } })
    } else if (/\/certificates\/\d+/.test(url) && method === 'PUT') {
      await route.fulfill({ json: { code: 200, msg: '更新成功', data: { id: 1 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 方法资质 =====
  await page.route('**/api/v1/lab-personnel/method-quals/**', async (route) => {
    const url = route.request().url()

    if (url.includes('/method-quals/gap-analysis')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: gapAnalysis } })
    } else if (url.includes('/method-quals/list')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: methodQualList } })
    } else if (url.includes('/method-quals/create')) {
      await route.fulfill({ json: { code: 200, msg: '资质创建成功', data: { id: 99 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 排班管理 =====
  await page.route('**/api/v1/lab-personnel/schedules/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/schedules/conflicts')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: conflictList } })
    } else if (url.includes('/schedules/swap-requests')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { success: true } } })
    } else if (url.includes('/schedules/slots/create')) {
      await route.fulfill({ json: { code: 200, msg: '时间槽创建成功', data: { success: true, slot: slotList.items[0] } } })
    } else if (url.includes('/schedules/slots')) {
      if (/\/slots\/\d+\/confirm/.test(url)) {
        await route.fulfill({ json: { code: 200, msg: '已确认', data: { success: true, slot: { ...slotList.items[0], confirm_status: 'confirmed' } } } })
      } else if (/\/slots\/\d+\/reject/.test(url)) {
        await route.fulfill({ json: { code: 200, msg: '已拒绝', data: { success: true, slot: { ...slotList.items[0], confirm_status: 'rejected' } } } })
      } else if (/\/slots\/\d+/.test(url) && method === 'PUT') {
        await route.fulfill({ json: { code: 200, msg: '更新成功', data: { success: true, slot: slotList.items[0] } } })
      } else if (/\/slots\/\d+/.test(url) && method === 'DELETE') {
        await route.fulfill({ json: { code: 200, msg: '已删除', data: null } })
      } else {
        await route.fulfill({ json: { code: 200, msg: 'OK', data: slotList } })
      }
    } else if (url.includes('/schedules/create') && method === 'POST') {
      await route.fulfill({ json: { code: 200, msg: '排班创建成功', data: scheduleList.items[1] } })
    } else if (url.includes('/schedules/list')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: scheduleList } })
    } else if (/\/schedules\/\d+\/publish/.test(url)) {
      await route.fulfill({ json: { code: 200, msg: '已发布', data: { ...scheduleList.items[1], status: 'published', status_display: '已发布' } } })
    } else if (/\/schedules\/\d+/.test(url)) {
      const schedule = scheduleList.items[0]
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { ...schedule, slots: slotList.items } } })
    } else {
      await route.continue()
    }
  })

  // ===== 工时统计 =====
  await page.route('**/api/v1/lab-personnel/worktime/**', async (route) => {
    const url = route.request().url()

    if (url.includes('/worktime/capacity-forecast')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: capacityForecast } })
    } else if (url.includes('/worktime/utilization')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: utilizationAnalysis } })
    } else if (url.includes('/worktime/summary')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: worktimeSummary } })
    } else if (url.includes('/worktime/logs/create')) {
      await route.fulfill({ json: { code: 200, msg: '工时记录已创建', data: worktimeLogs.items[0] } })
    } else if (url.includes('/worktime/logs')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: worktimeLogs } })
    } else {
      await route.continue()
    }
  })

  // ===== 工单派发 =====
  await page.route('**/api/v1/lab-personnel/dispatch/**', async (route) => {
    const url = route.request().url()

    if (url.includes('/dispatch/monitor')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: dispatchMonitor } })
    } else if (url.includes('/dispatch/candidates')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: dispatchCandidates } })
    } else if (url.includes('/dispatch/assign')) {
      await route.fulfill({ json: { code: 200, msg: '派工成功', data: { success: true } } })
    } else {
      await route.continue()
    }
  })

  // ===== 风险预警 =====
  await page.route('**/api/v1/lab-personnel/risks/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/risks/scan') && method === 'POST') {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: riskScanResult } })
    } else if (url.includes('/risks/stats')) {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: riskStats } })
    } else if (/\/risks\/\d+\/acknowledge/.test(url)) {
      const idMatch = url.match(/risks\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : 0
      const updated = rsm.acknowledge(id)
      await route.fulfill({ json: { code: 200, msg: 'OK', data: updated } })
    } else if (/\/risks\/\d+\/resolve/.test(url)) {
      const idMatch = url.match(/risks\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : 0
      const body = route.request().postDataJSON()
      const updated = rsm.resolve(id, body?.action_taken || '')
      await route.fulfill({ json: { code: 200, msg: 'OK', data: updated } })
    } else if (url.includes('/risks/list')) {
      const parsed = new URL(url)
      const level = parsed.searchParams.get('level') || ''
      const riskType = parsed.searchParams.get('risk_type') || ''

      let items = rsm.getRisks()
      if (level) items = items.filter(r => r.level === level)
      if (riskType) items = items.filter(r => r.risk_type === riskType)

      await route.fulfill({ json: { code: 200, msg: 'OK', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  return rsm
}
