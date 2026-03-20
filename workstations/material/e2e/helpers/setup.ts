/**
 * 物料管理工作台 E2E 测试辅助 — 认证注入 + API 路由拦截
 *
 * 设计思路：
 * - 注入物料管理员身份，跳过飞书 OAuth
 * - 用状态机模拟样品分发/回收状态流转
 * - 所有 API mock 返回贴近真实的 CRO 物料管理数据
 */
import { type Page } from '@playwright/test'
import {
  MATERIAL_MANAGER_USER, AUTH_TOKEN, authProfileData, authProfileResponse,
  dashboardData,
  productList, productStats, productDetail,
  consumableList, consumableStats,
  sampleList, sampleStats, sampleDetail, traceResult,
  transactionList, transactionStats,
  expiryAlerts,
  inventoryOverview, inventoryList, inventoryCheckRecord, inventoryCheckDetail, inventoryCheckHistory,
  storageLocations, storageTree,
  receiptList,
  batchList,
  kitList,
  dispensingList,
  destructionList,
  temperatureLogs,
  usageRecords,
  retentionRecords,
} from './mock-data'

/**
 * 注入物料管理员认证信息
 */
export async function injectAuth(page: Page) {
  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token: AUTH_TOKEN, user: MATERIAL_MANAGER_USER, profile: authProfileData },
  )
}

// ============================================================================
// 样品状态机 — 模拟样品分发/回收/销毁状态流转
// ============================================================================
class SampleStateMachine {
  private samples = sampleList.items.map(s => ({ ...s }))
  private nextId = 300

  getSamples() { return this.samples }
  getSample(id: number) { return this.samples.find(s => s.id === id) }

  distribute(id: number, holder: string) {
    const s = this.getSample(id)
    if (s && s.status === 'in_stock') {
      s.status = 'distributed'
      s.status_display = '已分发'
      s.current_holder = holder
      s.storage_location = null
    }
    return s
  }

  returnSample(id: number) {
    const s = this.getSample(id)
    if (s && s.status === 'distributed') {
      s.status = 'returned'
      s.status_display = '已回收'
      s.current_holder = null
      s.storage_location = '回收隔离区'
    }
    return s
  }

  destroy(id: number) {
    const s = this.getSample(id)
    if (s && !['destroyed'].includes(s.status)) {
      s.status = 'destroyed'
      s.status_display = '已销毁'
      s.current_holder = null
      s.storage_location = null
    }
    return s
  }
}

// ============================================================================
// API 路由拦截器
//
// 设计：每个 API 模块使用一个 catch-all 路由 + URL 检查分派。
// 避免使用 `?**` 模式（`?` 是 glob 单字符通配符，不匹配字面 `?`）。
// 提示：测试发起盘点时，可先 page.setExtraHTTPHeaders({ 'X-E2E-No-Active-Check': '1' })
// ============================================================================
export async function setupApiMocks(page: Page) {
  const ssm = new SampleStateMachine()

  // Auth profile
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: authProfileResponse })
  })

  // ===== 物料总览仪表盘 =====
  await page.route('**/api/v1/material/dashboard**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: dashboardData } })
  })

  // ===== 产品台账 =====
  await page.route('**/api/v1/material/products**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/products/stats')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: productStats } })
    } else if (url.includes('/products/create')) {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '产品创建成功', data: { id: 99, code: body?.code || 'PRD-NEW-001', name: body?.name } } })
    } else if (/\/products\/\d+/.test(url)) {
      if (method === 'GET') {
        await route.fulfill({ json: { code: 0, msg: 'ok', data: productDetail } })
      } else if (method === 'PUT') {
        await route.fulfill({ json: { code: 0, msg: '更新成功', data: { id: 1 } } })
      } else {
        await route.continue()
      }
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const keyword = parsed.searchParams.get('keyword') || ''
      const productType = parsed.searchParams.get('product_type') || ''
      const storageCondition = parsed.searchParams.get('storage_condition') || ''
      const expiryStatus = parsed.searchParams.get('expiry_status') || ''

      let items = [...productList.items]
      if (keyword) items = items.filter(p => p.name.includes(keyword) || p.code.includes(keyword) || p.batch_number.includes(keyword) || p.sponsor.includes(keyword))
      if (productType) items = items.filter(p => p.product_type === productType)
      if (storageCondition) items = items.filter(p => p.storage_condition.includes(storageCondition))
      if (expiryStatus === 'expired') items = items.filter(p => p.status === 'expired')
      if (expiryStatus === 'active') items = items.filter(p => p.status === 'active')

      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 耗材管理 =====
  await page.route('**/api/v1/material/consumables**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/consumables/stats')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: consumableStats } })
    } else if (url.includes('/consumables/create')) {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '耗材创建成功', data: { id: 199, code: body?.code, name: body?.name } } })
    } else if (url.includes('/issue')) {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '领用成功', data: { id: 1, issued_quantity: body?.quantity } } })
    } else if (/\/consumables\/\d+/.test(url) && method === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: consumableList.items[0] } })
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const category = parsed.searchParams.get('category') || ''
      const status = parsed.searchParams.get('status') || ''
      let items = [...consumableList.items]
      if (category) items = items.filter(c => c.category === category)
      if (status) items = items.filter(c => c.status === status)
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 耗材批次与出入库（ConsumableLedgerPage 入库/退库） =====
  await page.route('**/api/v1/material/consumable-batches**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/consumable-batches/create') && method === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({
        json: {
          code: 0,
          msg: '入库成功',
          data: {
            id: 99,
            consumable_id: body?.consumable_id,
            batch_number: body?.batch_number || 'BAT-NEW',
            inbound_date: body?.inbound_date || new Date().toISOString().slice(0, 10),
            inbound_quantity: body?.inbound_quantity,
            remaining_quantity: body?.inbound_quantity,
            expiry_date: body?.expiry_date || null,
            status: 'normal',
          },
        },
      })
    } else if (method === 'GET') {
      const items = [
        { id: 1, consumable_id: 101, batch_number: 'BAT-CORN-001', inbound_date: '2026-01-10', inbound_quantity: 10, remaining_quantity: 2, expiry_date: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10), status: 'normal' },
      ]
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length } } })
    } else {
      await route.continue()
    }
  })
  await page.route('**/api/v1/material/consumable-transactions**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/inbound') && method === 'POST') {
      await route.fulfill({ json: { code: 0, msg: '入库成功', data: { id: 1 } } })
    } else if (url.includes('/return') && method === 'POST') {
      await route.fulfill({ json: { code: 0, msg: '退库成功', data: { id: 1 } } })
    } else if (method === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [], total: 0 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 样品管理 =====
  await page.route('**/api/v1/material/samples**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/samples/stats')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: sampleStats } })
    } else if (url.includes('/samples/trace')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: traceResult } })
    } else if (/\/samples\/\d+/.test(url)) {
      const idMatch = url.match(/samples\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : 0

      if (url.includes('/distribute')) {
        const body = route.request().postDataJSON()
        const s = ssm.distribute(id, body?.holder || '受试者')
        await route.fulfill({ json: { code: 0, msg: '已分发', data: s } })
      } else if (url.includes('/return')) {
        const s = ssm.returnSample(id)
        await route.fulfill({ json: { code: 0, msg: '已回收', data: s } })
      } else if (url.includes('/destroy')) {
        const s = ssm.destroy(id)
        await route.fulfill({ json: { code: 0, msg: '已销毁', data: s } })
      } else if (method === 'GET') {
        await route.fulfill({ json: { code: 0, msg: 'ok', data: sampleDetail } })
      } else {
        await route.continue()
      }
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const status = parsed.searchParams.get('status') || ''
      const productId = parsed.searchParams.get('product_id') || ''
      const keyword = parsed.searchParams.get('keyword') || ''
      let items = ssm.getSamples()
      if (status) items = items.filter(s => s.status === status)
      if (productId) items = items.filter(s => s.product_id === Number(productId))
      if (keyword) items = items.filter(s => s.unique_code.includes(keyword) || s.product_name.includes(keyword))
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 出入库流水 =====
  await page.route('**/api/v1/material/transactions**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/transactions/stats')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: transactionStats } })
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const txType = parsed.searchParams.get('transaction_type') || ''
      const operator = parsed.searchParams.get('operator') || ''
      let items = [...transactionList.items]
      if (txType) items = items.filter(t => t.transaction_type === txType)
      if (operator) items = items.filter(t => t.operator_name.includes(operator))
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 效期预警 =====
  await page.route('**/api/v1/material/expiry-alerts**', async (route) => {
    const url = route.request().url()

    if (url.includes('/handle')) {
      await route.fulfill({ json: { code: 0, msg: '处置成功', data: { id: 1, status: 'handled' } } })
    } else {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: expiryAlerts } })
    }
  })

  // ===== 库存管理 =====
  await page.route('**/api/v1/material/inventory**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/inventory/overview')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: inventoryOverview } })
    } else if (url.includes('/inventory/checks')) {
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get('page') || 1)
      const pageSize = Number(parsed.searchParams.get('page_size') || 10)
      const start = (page - 1) * pageSize
      const paginated = inventoryCheckHistory.items.slice(start, start + pageSize)
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: paginated, total: inventoryCheckHistory.total } } })
    } else if (url.includes('/inventory/check')) {
      if (method === 'POST') {
        if (url.includes('/submit')) {
          await route.fulfill({ json: { code: 0, msg: '盘点已提交', data: { status: 'pending_review' } } })
        } else if (url.includes('/approve')) {
          await route.fulfill({ json: { code: 0, msg: '盘点已审核通过', data: { status: 'completed' } } })
        } else {
          await route.fulfill({ json: { code: 0, msg: '盘点已发起', data: inventoryCheckDetail } })
        }
      } else {
        const noActive = route.request().headers()['x-e2e-no-active-check'] === '1'
        const data = noActive ? null : inventoryCheckDetail
        await route.fulfill({ json: { code: 0, msg: 'ok', data } })
      }
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const zone = parsed.searchParams.get('zone') || ''
      const status = parsed.searchParams.get('status') || ''
      let items = [...inventoryList.items]
      if (zone) {
        const zoneMap: Record<string, string> = { cold_storage: 'cold', cool_storage: 'cool', room_storage: 'room' }
        const mappedZone = zoneMap[zone] || zone
        items = items.filter(i => i.zone === mappedZone)
      }
      if (status) items = items.filter(i => i.status === status)
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  await page.route('**/api/v1/material/storage-locations**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/storage-locations/create') && method === 'POST') {
      await route.fulfill({ json: { code: 0, msg: '库位创建成功', data: { id: 99, code: 'WH-NEW-01' } } })
    } else if (/\/storage-locations\/\d+/.test(url) && method === 'PUT') {
      await route.fulfill({ json: { code: 0, msg: '库位更新成功', data: { id: 1 } } })
    } else if (url.includes('/storage-locations/tree')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: storageTree } })
    } else if (/\/storage-locations\/\d+/.test(url) && method === 'GET') {
      const idMatch = url.match(/storage-locations\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : 1
      const findNode = (nodes: typeof storageTree): (typeof storageTree)[0] | undefined => {
        for (const n of nodes) {
          if (n.id === id) return n
          const found = n.children?.length ? findNode(n.children as typeof storageTree) : undefined
          if (found) return found
        }
        return undefined
      }
      const node = findNode(storageTree)
      const detail = node ? { ...node, temperature_zone_display: node.temperature_zone === 'room' ? '常温' : node.temperature_zone === 'cold' ? '冷藏' : node.temperature_zone === 'frozen' ? '冷冻' : '阴凉' } : storageTree[0]
      await route.fulfill({ json: { code: 0, msg: 'ok', data: detail } })
    } else {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: storageLocations } })
    }
  })

  // ===== 温度记录 =====
  await page.route('**/api/v1/sample-management/temperature/logs**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: temperatureLogs } })
  })

  // ===== 使用记录 =====
  await page.route('**/api/v1/product-management/usages**', async (route) => {
    const method = route.request().method()
    if (method === 'PATCH' || method === 'PUT') {
      await route.fulfill({ json: { code: 0, msg: '已标记偏差', data: { id: 1 } } })
    } else {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: usageRecords } })
    }
  })

  // ===== 留样管理 =====
  await page.route('**/api/v1/material/retention**', async (route) => {
    const method = route.request().method()
    if (method === 'POST' && route.request().url().includes('/release')) {
      await route.fulfill({ json: { code: 0, msg: '留样已释放', data: { id: 1, status: 'released' } } })
    } else {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: retentionRecords, total: retentionRecords.length } } })
    }
  })

  // ===== 样品接收 =====
  await page.route('**/api/v1/sample-management/receipts**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/receipts/create') && method === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({
        json: {
          code: 0,
          msg: '接收单创建成功',
          data: {
            id: 99,
            receipt_no: `RCV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-0099`,
            product_id: body?.product_id,
            product_name: productList.items.find((p) => p.id === body?.product_id)?.name || '产品',
            supplier: body?.supplier || '',
            courier: body?.courier || '',
            tracking_no: body?.tracking_no || '',
            expected_quantity: body?.expected_quantity || 0,
            received_quantity: 0,
            accepted_quantity: 0,
            rejected_quantity: 0,
            arrival_temperature: null,
            status: 'pending',
            batch_no: body?.batch_no || '',
            expiry_date: body?.expiry_date || null,
            create_time: new Date().toISOString(),
          },
        },
      })
    } else if (/\/receipts\/\d+/.test(url)) {
      const idMatch = url.match(/receipts\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : 0

      if (url.includes('/inspect') && method === 'POST') {
        const body = route.request().postDataJSON()
        const item = receiptList.items.find((r) => r.id === id) || receiptList.items[0]
        await route.fulfill({
          json: {
            code: 0,
            msg: '验收成功',
            data: {
              ...item,
              status: (body?.rejected_quantity ?? 0) > 0 ? 'rejected' : 'accepted',
              accepted_quantity: body?.accepted_quantity ?? 0,
              rejected_quantity: body?.rejected_quantity ?? 0,
              received_quantity: (body?.accepted_quantity ?? 0) + (body?.rejected_quantity ?? 0),
              arrival_temperature: body?.arrival_temperature ?? null,
            },
          },
        })
      } else if (method === 'GET') {
        const item = receiptList.items.find((r) => r.id === id) || receiptList.items[0]
        await route.fulfill({ json: { code: 0, msg: 'ok', data: item } })
      } else {
        await route.continue()
      }
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const keyword = parsed.searchParams.get('keyword') || ''
      const status = parsed.searchParams.get('status') || ''
      const page = Number(parsed.searchParams.get('page') || 1)
      const pageSize = Number(parsed.searchParams.get('page_size') || 20)

      let items = [...receiptList.items]
      if (keyword) {
        items = items.filter(
          (r) =>
            r.receipt_no.includes(keyword) ||
            r.product_name.includes(keyword) ||
            (r.supplier && r.supplier.includes(keyword)),
        )
      }
      if (status) items = items.filter((r) => r.status === status)

      const total = items.length
      const start = (page - 1) * pageSize
      const paginatedItems = items.slice(start, start + pageSize)

      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { items: paginatedItems, total, page, page_size: pageSize } },
      })
    } else {
      await route.continue()
    }
  })

  // ===== 批次管理 =====
  await page.route('**/api/v1/product-management/batches**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/batches/create') && method === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '批次创建成功', data: { id: 99, batch_no: body?.batch_no || 'BAT-NEW-001' } } })
    } else if (url.includes('/release')) {
      await route.fulfill({ json: { code: 0, msg: '批次已放行', data: { id: 1, status: 'released' } } })
    } else if (url.includes('/receive')) {
      await route.fulfill({ json: { code: 0, msg: '批次已入库', data: { id: 1, status: 'received' } } })
    } else if (/\/batches\/\d+/.test(url) && method === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: batchList.items[0] } })
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const status = parsed.searchParams.get('status') || ''
      const keyword = parsed.searchParams.get('keyword') || ''
      let items = [...batchList.items]
      if (status) items = items.filter(b => b.status === status)
      if (keyword) items = items.filter(b => b.batch_no.includes(keyword) || b.product_name.includes(keyword))
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 套件管理 =====
  await page.route('**/api/v1/product-management/kits**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/kits/create') && method === 'POST') {
      await route.fulfill({ json: { code: 0, msg: '套件创建成功', data: { id: 99, kit_number: 'KIT-NEW-001' } } })
    } else if (url.includes('/assign')) {
      await route.fulfill({ json: { code: 0, msg: '分配成功', data: { id: 1, status: 'assigned' } } })
    } else if (url.includes('/distribute')) {
      await route.fulfill({ json: { code: 0, msg: '分发成功', data: { id: 1, status: 'distributed' } } })
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const status = parsed.searchParams.get('status') || ''
      let items = [...kitList.items]
      if (status) items = items.filter((k) => k.status === status)
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 分发记录 =====
  await page.route('**/api/v1/product-management/dispensings**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/dispensings/create') && method === 'POST') {
      await route.fulfill({ json: { code: 0, msg: '分发计划已创建', data: { id: 99 } } })
    } else if (url.includes('/prepare')) {
      await route.fulfill({ json: { code: 0, msg: '已备货', data: { id: 1, status: 'prepared' } } })
    } else if (url.includes('/execute')) {
      await route.fulfill({ json: { code: 0, msg: '已分发', data: { id: 1, status: 'dispensed' } } })
    } else if (url.includes('/confirm')) {
      await route.fulfill({ json: { code: 0, msg: '已确认', data: { id: 1, status: 'confirmed' } } })
    } else if (method === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: dispensingList } })
    } else {
      await route.continue()
    }
  })

  // ===== 销毁审批 =====
  await page.route('**/api/v1/sample-management/destructions**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/destructions/create') && method === 'POST') {
      await route.fulfill({ json: { code: 0, msg: '销毁申请已创建', data: { id: 99, destruction_no: 'DES-NEW-001' } } })
    } else if (url.includes('/approve')) {
      await route.fulfill({ json: { code: 0, msg: '已批准', data: { id: 1, status: 'approved' } } })
    } else if (url.includes('/execute')) {
      await route.fulfill({ json: { code: 0, msg: '已销毁', data: { id: 1, status: 'destroyed' } } })
    } else if (/\/destructions\/\d+/.test(url) && method === 'GET') {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: destructionList.items[0] } })
    } else if (method === 'GET') {
      const parsed = new URL(url)
      const status = parsed.searchParams.get('status') || ''
      let items = [...destructionList.items]
      if (status) items = items.filter((d) => d.status === status)
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } } })
    } else {
      await route.continue()
    }
  })

  // ===== 导出 =====
  await page.route('**/api/v1/material/export/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/evidence-package')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { status: 'generated', filename: 'evidence_20260120.zip', contents: { transactions: 50, temperature_logs: 200, inventory_counts: 3 }, message: '证据包已生成' } } })
    } else {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { status: 'generated', filename: 'transactions_20260120.csv', record_count: 50, message: '已生成 50 条记录' } } })
    }
  })

  // ===== 审计日志 =====
  await page.route('**/api/v1/material/audit/**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [
      { id: 1, action: 'sample_receipt', operator_name: '王度支', target_type: 'SampleReceipt', target_code: 'RCV-001', details: '{}', create_time: '2026-01-20 09:00' },
      { id: 2, action: 'batch_release', operator_name: '王度支', target_type: 'ProductBatch', target_code: 'BAT-001', details: '{}', create_time: '2026-01-20 10:00' },
      { id: 3, action: 'consumable_issue', operator_name: '王度支', target_type: 'ConsumableTransaction', target_code: 'TX-001', details: '{}', create_time: '2026-01-20 11:00' },
    ], total: 3 } } })
  })

  // ===== 电子签名 =====
  await page.route('**/api/v1/material/signature/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/sign')) {
      await route.fulfill({ json: { code: 0, msg: '签名成功', data: { signature_id: 'SIG-TEST-001', status: 'signed', signed_at: '2026-01-20T12:00:00Z' } } })
    } else if (url.includes('/verify')) {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { valid: true, message: '签名验证通过' } } })
    } else {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: [] } })
    }
  })

  return ssm
}
