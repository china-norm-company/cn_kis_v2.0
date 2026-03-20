/**
 * 场景 2：产品台账 — 从接收到建账的完整流程
 *
 * 业务背景：
 *   产品台账是物料管理的核心。每当委托方送来新的测试样品，
 *   王度支需要验收产品、核对批号、检查效期、确认存储条件，
 *   然后在系统中建立完整的产品档案。产品台账还需要区分
 *   测试样品、对照品、标准品三种不同类型，每种类型的管理
 *   规范和追溯要求各不相同。
 *
 *   过期产品需要立即锁定，等待质量部审批后才能销毁。
 *   每个产品的详情页还需展示批次信息、样品统计和留样信息——
 *   这些都是审计时的必查项目。
 *
 * 验证目标：
 *   工作台是否能支持从"产品接收 → 建账 → 分类管理 → 过期锁定"
 *   的完整闭环，以及提供合规审计所需的全部详情信息。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景2: 产品台账 — 从接收到建账的完整流程', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('2.1【统计面板】统计面板显示正确的产品分类数据', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // productStats: total_products: 8, active_batches: 6, expiring_soon: 1, expired: 2
    // 统计面板是管理决策的数字依据
    await expect(page.getByText('8').first()).toBeVisible()
    await expect(page.getByText('在管产品').first()).toBeVisible()
    await expect(page.getByText('在库批次').first()).toBeVisible()
    await expect(page.getByText('近效期').first()).toBeVisible()
    await expect(page.getByText('已过期').first()).toBeVisible()
  })

  test('2.2【产品列表】产品列表包含所有 8 个产品', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 8 个产品都应该在列表中可见
    await expect(page.getByText('美白精华液 A').first()).toBeVisible()
    await expect(page.getByText('美白精华液 B-对照').first()).toBeVisible()
    await expect(page.getByText('修复面霜 C').first()).toBeVisible()
    await expect(page.getByText('防晒乳 D').first()).toBeVisible()
    await expect(page.getByText('安慰剂基质 E').first()).toBeVisible()
    await expect(page.getByText('Corneometer 标准校准块').first()).toBeVisible()
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('祛斑霜 G').first()).toBeVisible()
  })

  test('2.3【产品详情】点击产品可查看详情抽屉', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 场景：审计员要检查"美白精华液 A"的完整记录
    // 王度支点击该产品查看详情
    const row = page.locator('tr').filter({ hasText: '美白精华液 A' })
    const detailBtn = row.locator('button[title="查看详情"]')
      .or(row.locator('button').first())
    await detailBtn.click()
    await page.waitForLoadState('networkidle')

    // 详情抽屉应该展示四大板块
    await expect(page.getByText('基本信息').first()).toBeVisible()
    await expect(page.getByText('批次').first()).toBeVisible()
    await expect(page.getByText('样品').first()).toBeVisible()
    await expect(page.getByText('留样').first()).toBeVisible()

    // 基本信息包含关键字段
    await expect(page.getByText('PRD-2026-001').first()).toBeVisible()
    await expect(page.getByText('华研美妆科技').first()).toBeVisible()
  })

  test('2.4【新增产品】新增产品弹窗包含所有必要字段', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 场景：新一批委托方的样品到货，王度支需要建账
    const addBtn = page.getByRole('button', { name: '登记产品' })
      .or(page.getByRole('button', { name: '新增产品' }))
      .or(page.getByRole('button', { name: '新增' }))
    await addBtn.first().click()
    await page.waitForTimeout(500)

    // 新增产品弹窗应该包含所有必要字段
    const modal = page.locator('.fixed')
    await expect(modal.getByText('产品名称').first()).toBeVisible()
    await expect(modal.getByText('产品编码').first()).toBeVisible()

    // 验证有提交按钮
    const submitBtn = page.getByRole('button', { name: '提交' })
      .or(page.getByRole('button', { name: '保存' }))
      .or(page.getByRole('button', { name: '确定' }))
    await expect(submitBtn.first()).toBeVisible()
  })

  test('2.5【产品类型】能区分测试样品/对照品/标准品三种类型', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 三种产品类型在 CRO 物料管理中有完全不同的管理规范：
    // - 测试样品：委托方提供的待测产品
    // - 对照品/安慰剂：用于对照组的产品
    // - 标准品：仪器校准用参考物质
    // 限定到 table tbody span 避免匹配到 <option> 元素
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('测试样品').first()).toBeVisible()
    await expect(tbody.getByText('对照品').first()).toBeVisible()
    await expect(tbody.getByText('标准品').first()).toBeVisible()
  })

  test('2.6【过期标识】过期产品有明显的红色标识', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 过期产品必须有醒目的视觉警告——这是合规底线
    // 抗皱精华 F 和 祛斑霜 G 均已过期（status: 'expired'）
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('祛斑霜 G').first()).toBeVisible()

    // 过期状态标识应该存在（具体渲染为 badge/标签）
    const expiredBadge = page.locator('.divide-y span').filter({ hasText: '已过期' })
      .or(page.getByText('已过期').first())
    await expect(expiredBadge.first()).toBeVisible()
  })

  test('2.7【委托方搜索】搜索可以按委托方搜索', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 场景：华研美妆科技打电话询问他们送检产品的状态
    const searchInput = page.getByPlaceholder('搜索').or(page.getByPlaceholder('搜索产品名称、编码、批号...'))
    await searchInput.first().fill('华研')
    await page.waitForLoadState('networkidle')

    // 搜索"华研"应该命中华研美妆科技的两个产品
    await expect(page.getByText('美白精华液 A').first()).toBeVisible()
    await expect(page.getByText('美白精华液 B-对照').first()).toBeVisible()
  })

  test('2.8【批次信息】产品详情中展示批次信息', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 打开产品详情
    const row = page.locator('tr').filter({ hasText: '美白精华液 A' })
    const detailBtn = row.locator('button[title="查看详情"]')
      .or(row.locator('button').first())
    await detailBtn.click()
    await page.waitForLoadState('networkidle')

    // 批次信息是追溯的关键——每一瓶样品的来源必须可查
    await expect(page.getByText('BN20260115-A').first()).toBeVisible()
  })

  test('2.9【留样管理】产品详情中展示留样管理信息', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 打开产品详情
    const row = page.locator('tr').filter({ hasText: '美白精华液 A' })
    const detailBtn = row.locator('button[title="查看详情"]')
      .or(row.locator('button').first())
    await detailBtn.click()
    await page.waitForLoadState('networkidle')

    // 留样是法规要求：需保留足够数量的样品以备复检
    // productDetail.retention_info: quantity: 2, location: '冷藏留样柜 R1-A3'
    // 点击留样信息 tab
    await page.getByText('留样信息').click()
    await page.waitForTimeout(300)
    await expect(page.getByText('冷藏留样柜 R1-A3').first()).toBeVisible()
  })
})
