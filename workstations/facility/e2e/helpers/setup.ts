/**
 * 设施环境管理工作台 E2E 测试辅助 — 认证注入 + API 路由拦截
 *
 * 设计思路：
 * - 注入设施管理员身份，跳过飞书 OAuth
 * - 用状态机模拟不合规事件状态流转
 * - 所有 API mock 返回贴近真实的 CRO 设施管理数据
 */
import { type Page } from '@playwright/test'
import {
  FACILITY_MANAGER_USER, AUTH_TOKEN, authProfileData, authProfileResponse,
  dashboardData,
  venueList, venueStats, venueDetail,
  reservationList, reservationStats, calendarData,
  environmentLogs, environmentCurrent, complianceStats,
  incidentList, incidentStats, incidentDetail,
  cleaningList, cleaningStats,
} from './mock-data'

/**
 * 注入设施管理员认证信息
 */
export async function injectAuth(page: Page) {
  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token: AUTH_TOKEN, user: FACILITY_MANAGER_USER, profile: authProfileData },
  )
}

// ============================================================================
// 不合规事件状态机 — 模拟事件状态流转
// ============================================================================
class IncidentStateMachine {
  private incidents = incidentList.items.map(i => ({ ...i }))

  getIncidents() { return this.incidents }
  getIncident(id: number) { return this.incidents.find(i => i.id === id) }

  investigate(id: number) {
    const i = this.getIncident(id)
    if (i && i.status === 'open') {
      i.status = 'investigating'
      i.status_display = '调查中'
    }
    return i
  }

  correct(id: number) {
    const i = this.getIncident(id)
    if (i && i.status === 'investigating') {
      i.status = 'corrected'
      i.status_display = '已纠正'
    }
    return i
  }

  close(id: number) {
    const i = this.getIncident(id)
    if (i && (i.status === 'corrected' || i.status === 'investigating')) {
      i.status = 'closed'
      i.status_display = '已关闭'
    }
    return i
  }
}

// ============================================================================
// API 路由拦截器
// ============================================================================
export async function setupApiMocks(page: Page) {
  const ism = new IncidentStateMachine()

  // Auth profile
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: authProfileResponse })
  })

  // ===== 设施仪表盘 =====
  await page.route('**/api/v1/facility/dashboard**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: dashboardData } })
  })

  // ===== 场地管理 =====
  await page.route('**/api/v1/facility/venues**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/venues/stats')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: venueStats } })
    } else if (url.includes('/venues/create')) {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '场地创建成功', data: { id: 99, code: body?.code || 'VNU-NEW', name: body?.name } } })
    } else if (/\/venues\/\d+/.test(url)) {
      if (method === 'GET') {
        await route.fulfill({ json: { code: 0, msg: 'ok', data: venueDetail } })
      } else if (method === 'PUT') {
        await route.fulfill({ json: { code: 0, msg: '更新成功', data: { id: 1 } } })
      } else {
        await route.continue()
      }
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const keyword = parsed.searchParams.get('keyword') || ''
      const venueType = parsed.searchParams.get('venue_type') || ''
      const status = parsed.searchParams.get('status') || ''

      let items = [...venueList.items]
      if (keyword) items = items.filter(v => v.name.includes(keyword) || v.code.includes(keyword))
      if (venueType) items = items.filter(v => v.venue_type === venueType)
      if (status) items = items.filter(v => v.status === status)

      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 预约管理 =====
  await page.route('**/api/v1/facility/reservations**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/reservations/stats')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: reservationStats } })
    } else if (url.includes('/reservations/calendar')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: calendarData } })
    } else if (url.includes('/reservations/create')) {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '预约创建成功', data: { id: 99, venue_name: body?.venue_name || '测试室', status: 'pending' } } })
    } else if (url.includes('/confirm')) {
      await route.fulfill({ json: { code: 0, msg: '预约已确认', data: { status: 'confirmed' } } })
    } else if (url.includes('/cancel')) {
      await route.fulfill({ json: { code: 0, msg: '预约已取消', data: { status: 'cancelled' } } })
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const status = parsed.searchParams.get('status') || ''
      const venueId = parsed.searchParams.get('venue_id') || ''

      let items = [...reservationList.items]
      if (status) items = items.filter(r => r.status === status)
      if (venueId) items = items.filter(r => r.venue_id === Number(venueId))

      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 环境监控 =====
  await page.route('**/api/v1/facility/environment**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/environment/current')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: environmentCurrent } })
    } else if (url.includes('/environment/compliance')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: complianceStats } })
    } else if (url.includes('/environment/logs/create')) {
      await route.fulfill({ json: { code: 0, msg: '记录已创建', data: { id: 999 } } })
    } else if (url.includes('/environment/logs')) {
      const parsed = new URL(url)
      const venueId = parsed.searchParams.get('venue_id') || ''
      const compliant = parsed.searchParams.get('is_compliant') || ''

      let items = [...environmentLogs.items]
      if (venueId) items = items.filter(l => l.venue_id === Number(venueId))
      if (compliant === 'true') items = items.filter(l => l.is_compliant)
      if (compliant === 'false') items = items.filter(l => !l.is_compliant)

      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 50 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 不合规事件 =====
  await page.route('**/api/v1/facility/incidents**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/incidents/stats')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: incidentStats } })
    } else if (url.includes('/incidents/create')) {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '事件已创建', data: { id: 99, incident_no: 'INC-2026-099', status: 'open' } } })
    } else if (/\/incidents\/\d+/.test(url)) {
      const idMatch = url.match(/incidents\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : 0

      if (url.includes('/update') && method === 'PUT') {
        const body = route.request().postDataJSON()
        if (body?.status === 'investigating') ism.investigate(id)
        else if (body?.status === 'corrected') ism.correct(id)
        else if (body?.status === 'closed') ism.close(id)
        const updated = ism.getIncident(id)
        await route.fulfill({ json: { code: 0, msg: '更新成功', data: updated } })
      } else if (method === 'GET') {
        await route.fulfill({ json: { code: 0, msg: 'ok', data: incidentDetail } })
      } else {
        await route.continue()
      }
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const severity = parsed.searchParams.get('severity') || ''
      const status = parsed.searchParams.get('status') || ''

      let items = ism.getIncidents()
      if (severity) items = items.filter(i => i.severity === severity)
      if (status) items = items.filter(i => i.status === status)

      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 清洁管理 =====
  await page.route('**/api/v1/facility/cleaning**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/cleaning/stats')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: cleaningStats } })
    } else if (url.includes('/cleaning/create')) {
      await route.fulfill({ json: { code: 0, msg: '清洁记录已创建', data: { id: 99, status: 'completed' } } })
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const cleaningType = parsed.searchParams.get('cleaning_type') || ''
      const venueId = parsed.searchParams.get('venue_id') || ''
      const status = parsed.searchParams.get('status') || ''

      let items = [...cleaningList.items]
      if (cleaningType) items = items.filter(c => c.cleaning_type === cleaningType)
      if (venueId) items = items.filter(c => c.venue_id === Number(venueId))
      if (status) items = items.filter(c => c.status === status)

      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  return ism
}
