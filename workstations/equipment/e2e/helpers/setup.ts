/**
 * 设备管理工作台 E2E 测试辅助 — 认证注入 + API 路由拦截
 *
 * 设计思路：
 * - 注入设备管理员身份，跳过飞书 OAuth
 * - 用状态机模拟后端维护工单状态流转（最复杂的业务逻辑）
 * - 所有 API mock 返回贴近真实的业务数据
 */
import { type Page } from '@playwright/test'
import {
  EQUIPMENT_MANAGER_USER, AUTH_TOKEN, authProfileData, authProfileResponse,
  dashboardData, equipmentList, equipmentDetail,
  calibrationPlanData, calibrationList,
  maintenanceList, maintenanceStats,
  usageList, usageStats,
  authorizationList,
  detectionMethodList, detectionMethodDetail,
  equipmentCategories,
} from './mock-data'

/**
 * 注入设备管理员认证信息
 */
export async function injectAuth(page: Page) {
  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token: AUTH_TOKEN, user: EQUIPMENT_MANAGER_USER, profile: authProfileData },
  )
}

// ============================================================================
// 维护工单状态机 — 模拟后端状态流转
// ============================================================================
class MaintenanceStateMachine {
  private orders = maintenanceList.items.map(m => ({ ...m }))
  private nextId = 400

  getOrders() { return this.orders }
  getOrder(id: number) { return this.orders.find(m => m.id === id) }

  create(data: any) {
    const order = {
      id: this.nextId++,
      equipment_id: data.equipment_id,
      equipment_name: equipmentList.items.find(e => e.id === data.equipment_id)?.name ?? '未知设备',
      equipment_code: equipmentList.items.find(e => e.id === data.equipment_id)?.code ?? '',
      title: data.title,
      maintenance_type: data.maintenance_type,
      maintenance_type_display: data.maintenance_type === 'preventive' ? '预防性维护'
        : data.maintenance_type === 'corrective' ? '纠正性维护' : '紧急维修',
      status: 'pending',
      status_display: '待处理',
      maintenance_date: data.maintenance_date || new Date().toISOString().split('T')[0],
      description: data.description,
      performed_by: '',
      cost: null,
      next_maintenance_date: null,
      reported_by_id: 10,
      assigned_to_id: data.assigned_to_id || null,
      completed_at: null,
      result_notes: '',
      requires_recalibration: false,
      create_time: new Date().toISOString(),
    }
    this.orders.unshift(order)
    return order
  }

  assign(id: number, assignedToId: number) {
    const order = this.getOrder(id)
    if (order && order.status === 'pending') {
      order.status = 'in_progress'
      order.status_display = '处理中'
      order.assigned_to_id = assignedToId
    }
    return order
  }

  start(id: number) {
    const order = this.getOrder(id)
    if (order && order.status === 'pending') {
      order.status = 'in_progress'
      order.status_display = '处理中'
    }
    return order
  }

  complete(id: number, data: any) {
    const order = this.getOrder(id)
    if (order && order.status === 'in_progress') {
      order.status = 'completed'
      order.status_display = '已完成'
      order.completed_at = new Date().toISOString()
      order.result_notes = data?.result_notes || ''
      order.requires_recalibration = data?.requires_recalibration || false
      if (data?.cost) order.cost = data.cost
      if (data?.performed_by) order.performed_by = data.performed_by
    }
    return order
  }

  cancel(id: number, reason: string) {
    const order = this.getOrder(id)
    if (order && !['completed', 'cancelled'].includes(order.status)) {
      order.status = 'cancelled'
      order.status_display = '已取消'
      order.result_notes = reason ? `取消原因: ${reason}` : ''
    }
    return order
  }
}

// ============================================================================
// API 路由拦截器
// ============================================================================
export async function setupApiMocks(page: Page) {
  const msm = new MaintenanceStateMachine()

  // Auth profile
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: authProfileResponse })
  })

  // ===== 设备台账 =====

  // Dashboard
  await page.route('**/api/v1/equipment/dashboard**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: dashboardData } })
  })

  // 设备台账（统一处理列表 + 详情 + 操作，用 URL 特征分发）
  await page.route('**/api/v1/equipment/ledger**', async (route) => {
    const url = route.request().url()
    const pathname = new URL(url).pathname

    // 操作端点：create / retire / change-status
    if (url.includes('/create')) {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '设备创建成功', data: { id: 99, code: body?.code || 'EQ-NEW-001' } } })
    } else if (url.includes('/retire')) {
      await route.fulfill({ json: { code: 0, msg: '设备已报废', data: { id: 1, status: 'retired' } } })
    } else if (url.includes('/change-status')) {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '状态已变更', data: { id: 1, old_status: 'active', new_status: body?.status } } })
    } else if (/\/ledger\/\d+/.test(pathname)) {
      // 设备详情（URL 含数字 ID）
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { code: 0, msg: 'ok', data: equipmentDetail } })
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ json: { code: 0, msg: '更新成功', data: { id: 1 } } })
      } else {
        await route.continue()
      }
    } else if (route.request().method() === 'GET') {
      // 设备列表（带筛选/分页查询参数）
      const searchUrl = new URL(url)
      const keyword = searchUrl.searchParams.get('keyword') || ''
      const status = searchUrl.searchParams.get('status') || ''
      const calStatus = searchUrl.searchParams.get('calibration_status') || ''

      let items = [...equipmentList.items]
      if (keyword) items = items.filter(e => e.name.includes(keyword) || e.code.includes(keyword) || e.model_number.includes(keyword))
      if (status) items = items.filter(e => e.status === status)
      if (calStatus === 'overdue') items = items.filter(e => e.calibration_info.status === 'overdue')
      if (calStatus === 'expiring') items = items.filter(e => ['expiring', 'urgent'].includes(e.calibration_info.status))
      if (calStatus === 'valid') items = items.filter(e => e.calibration_info.status === 'valid')

      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 校准管理 =====
  // 注意：Playwright 路由按注册逆序匹配（最后注册的优先级最高）
  // 因此 catch-all 路由必须在前（低优先级），具体路由在后（高优先级）

  // catch-all: 校准详情（注册在前，优先级最低）
  await page.route('**/api/v1/equipment/calibrations/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: calibrationList.items[0] } })
    } else {
      await route.continue()
    }
  })

  await page.route('**/api/v1/equipment/calibrations/plan**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: calibrationPlanData } })
  })

  await page.route('**/api/v1/equipment/calibrations/list**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: calibrationList } })
  })

  await page.route('**/api/v1/equipment/calibrations/create**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: {
        code: 0, msg: '校准记录已添加',
        data: { id: 999, equipment_id: body?.equipment_id, calibration_date: body?.calibration_date, next_due_date: body?.next_due_date, result: body?.result, equipment_status: body?.result === 'fail' ? 'maintenance' : 'active' },
      },
    })
  })

  // ===== 维护工单 =====
  // catch-all 先注册（低优先级），具体路由后注册（高优先级）

  // catch-all: 维护工单操作（assign/start/complete/cancel）和详情
  await page.route('**/api/v1/equipment/maintenance/**', async (route) => {
    const url = route.request().url()
    const idMatch = url.match(/maintenance\/(\d+)/)
    const id = idMatch ? Number(idMatch[1]) : 0

    if (url.includes('/assign')) {
      const body = route.request().postDataJSON()
      const order = msm.assign(id, body?.assigned_to_id)
      await route.fulfill({ json: { code: 0, msg: '已分配', data: order } })
    } else if (url.includes('/start')) {
      const order = msm.start(id)
      await route.fulfill({ json: { code: 0, msg: '维护已开始', data: order } })
    } else if (url.includes('/complete')) {
      const body = route.request().postDataJSON()
      const order = msm.complete(id, body)
      await route.fulfill({ json: { code: 0, msg: '维护已完成', data: order } })
    } else if (url.includes('/cancel')) {
      const body = route.request().postDataJSON()
      const order = msm.cancel(id, body?.reason || '')
      await route.fulfill({ json: { code: 0, msg: '维护已取消', data: order } })
    } else if (route.request().method() === 'GET') {
      const order = msm.getOrder(id)
      await route.fulfill({ json: { code: 0, msg: 'ok', data: order || maintenanceList.items[0] } })
    } else if (route.request().method() === 'PUT') {
      await route.fulfill({ json: { code: 0, msg: '更新成功', data: msm.getOrder(id) } })
    } else {
      await route.continue()
    }
  })

  // 具体路由（后注册，高优先级）
  await page.route('**/api/v1/equipment/maintenance/stats**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: maintenanceStats } })
  })

  await page.route('**/api/v1/equipment/maintenance/list**', async (route) => {
    const url = new URL(route.request().url())
    const status = url.searchParams.get('status') || ''
    const type = url.searchParams.get('maintenance_type') || ''
    let items = msm.getOrders()
    if (status) items = items.filter(m => m.status === status)
    if (type) items = items.filter(m => m.maintenance_type === type)
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
  })

  await page.route('**/api/v1/equipment/maintenance/create**', async (route) => {
    const body = route.request().postDataJSON()
    const order = msm.create(body)
    await route.fulfill({ json: { code: 0, msg: '维护工单已创建', data: order } })
  })

  // ===== 使用记录 =====

  await page.route('**/api/v1/equipment/usage/stats**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: usageStats } })
  })

  await page.route('**/api/v1/equipment/usage/list**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: usageList } })
  })

  await page.route('**/api/v1/equipment/usage/register**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: { code: 0, msg: '使用已登记', data: { id: 999, equipment_id: body?.equipment_id, equipment_name: 'Corneometer CM825 #1', start_time: new Date().toISOString() } },
    })
  })

  await page.route('**/api/v1/equipment/usage/**/end', async (route) => {
    await route.fulfill({
      json: { code: 0, msg: '使用已结束', data: { id: 1, end_time: new Date().toISOString(), duration_minutes: 25 } },
    })
  })

  // ===== 操作授权 =====

  await page.route('**/api/v1/equipment/authorizations/list**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: authorizationList } })
  })

  await page.route('**/api/v1/equipment/authorizations/grant**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: { code: 0, msg: '授权成功', data: { id: 999, equipment_id: body?.equipment_id, operator_id: body?.operator_id, created: true } },
    })
  })

  await page.route('**/api/v1/equipment/authorizations/**/revoke', async (route) => {
    await route.fulfill({ json: { code: 0, msg: '授权已撤销', data: { id: 1, is_active: false } } })
  })

  await page.route('**/api/v1/equipment/authorizations/check**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { authorized: true, reason: '', authorization_id: 501 } } })
  })

  // ===== 检测方法 =====
  // catch-all 先注册（低优先级），具体路由后注册（高优先级）

  await page.route('**/api/v1/equipment/detection-methods/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: detectionMethodDetail } })
    } else if (route.request().method() === 'PUT') {
      await route.fulfill({ json: { code: 0, msg: '更新成功', data: { id: 1 } } })
    } else {
      await route.continue()
    }
  })

  await page.route('**/api/v1/equipment/detection-methods/list**', async (route) => {
    const url = new URL(route.request().url())
    const category = url.searchParams.get('category') || ''
    const keyword = url.searchParams.get('keyword') || ''
    let items = [...detectionMethodList.items]
    if (category) items = items.filter(m => m.category === category)
    if (keyword) items = items.filter(m => m.name.includes(keyword) || m.name_en.toLowerCase().includes(keyword.toLowerCase()) || m.code.includes(keyword))
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
  })

  await page.route('**/api/v1/equipment/detection-methods/create**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({ json: { code: 0, msg: '创建成功', data: { id: 99, code: body?.code, name: body?.name } } })
  })

  await page.route('**/api/v1/equipment/detection-methods/**/resources/add', async (route) => {
    await route.fulfill({ json: { code: 0, msg: '添加成功', data: { id: 99 } } })
  })

  await page.route('**/api/v1/equipment/detection-methods/**/personnel/add', async (route) => {
    await route.fulfill({ json: { code: 0, msg: '添加成功', data: { id: 99 } } })
  })

  // ===== 资源类别（用于新增设备表单） =====

  await page.route('**/api/v1/resource/categories**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: equipmentCategories } })
  })

  return msm
}
