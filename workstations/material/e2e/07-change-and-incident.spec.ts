/**
 * 场景 7：变更与意外管理 — 物料管理中的非正常态处理
 *
 * 业务背景：
 *   物料管理的日常工作大部分按计划执行，但变更和意外才是真正考验
 *   管理员能力的时刻。化妆品 CRO 环境下的典型场景：
 *
 *   变更场景：
 *   - 产品批次过期 → 需要替代新批次 + 旧批次处置
 *   - 过期样品销毁 → 需要审批、记录、样品状态更新
 *   - 出入库流水完整记录所有操作
 *
 *   意外场景：
 *   - 效期预警发现过期物料 → 紧急处理
 *   - 库存不足 → 影响试验进度
 *   - 样品回收后需要正确更新状态
 *   - 多个预警同时出现 → 需要跨页面导航判断优先级
 *
 * 验证目标：
 *   工作台在非正常态下是否依然能支撑管理员的工作，提供必要的
 *   操作入口和信息展示，确保变更可追溯。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景7A: 变更管理 — 当计划需要调整时', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('7A.1【过期产品可查】产品台账支持查看已过期产品', async ({ page }) => {
    // 场景：抗皱精华 F 和祛斑霜 G 已过期
    // 王度支需要在产品台账中看到这些过期产品，以便安排处置
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 过期产品应在列表中可见
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('祛斑霜 G').first()).toBeVisible()

    // 过期状态标识
    const expiredBadge = page.getByText('已过期')
      .or(page.getByText('expired'))
    await expect(expiredBadge.first()).toBeVisible()
  })

  test('7A.2【新增替代产品】可以新增产品替代过期批次', async ({ page }) => {
    // 场景：逆龄生物寄来了抗皱精华 F 的新批次
    // 王度支需要在产品台账中新增这个替代批次
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 新增产品入口（页面按钮名称是"登记产品"）
    const addBtn = page.getByRole('button', { name: '登记产品' })
      .or(page.getByRole('button', { name: '新增产品' }))
      .or(page.getByRole('button', { name: '新增' }))
    await addBtn.first().click()
    await page.waitForTimeout(500)

    // 新增产品表单标题（Modal 标题是"登记产品"）
    await expect(
      page.getByRole('heading', { name: '登记产品' })
        .or(page.getByRole('heading', { name: '新增产品' })),
    ).toBeVisible()
  })

  test('7A.3【已销毁样品】在样品管理中看到已销毁样品', async ({ page }) => {
    // 场景：抗皱精华 F 的一个样品已因过期被销毁
    // 样品管理中应该能查看已销毁的样品记录
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 已销毁的样品（SP-2025-0601-F001）
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('抗皱精华 F').first()).toBeVisible()

    // 销毁状态标识（限定到 tbody 避免匹配到 <option> 元素）
    const destroyedBadge = tbody.getByText('已销毁')
    await expect(destroyedBadge.first()).toBeVisible()
  })

  test('7A.4【销毁流水记录】出入库流水记录销毁操作', async ({ page }) => {
    // 场景：所有物料操作都必须有流水记录
    // 抗皱精华 F 的销毁也应有完整的出入库流水
    await page.goto('/material/transactions')
    await page.waitForLoadState('networkidle')

    // 销毁操作流水（限定到 tbody 避免匹配到 <option> 元素）
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('样品销毁').first()).toBeVisible()
    await expect(tbody.getByText('抗皱精华 F').first()).toBeVisible()

    // 销毁审批单号
    await expect(tbody.getByText('DST-2026-001').first()).toBeVisible()
  })
})

test.describe('场景7B: 意外管理 — 当出了问题时', () => {
  const sidebarNav = (page: import('@playwright/test').Page) =>
    page.getByRole('complementary').getByRole('navigation')

  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('7B.1【效期预警发现】效期预警面板能及时发现过期物料', async ({ page }) => {
    // 场景：周一早上王度支打开工作台，第一件事就是检查效期预警
    // 红色预警最紧急：2 个已过期 + 1 个 5 天内到期
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // 红色预警可见
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('祛斑霜 G').first()).toBeVisible()

    // 已锁定标识（过期物料自动锁定）
    await expect(page.getByText('已锁定').first()).toBeVisible()
  })

  test('7B.2【低库存标识】库存管理中低库存物料标识明显', async ({ page }) => {
    // 场景：探头保护膜只剩 2 盒（安全库存 5），酒精棉球只剩 1 桶（安全库存 3）
    // 如果不及时补货，可能影响明天的检测任务
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')

    // 低库存物料列表
    await expect(page.getByText('Corneometer 探头保护膜').first()).toBeVisible()
    await expect(page.getByText('75%酒精棉球').first()).toBeVisible()

    // 低库存警告标识（限定到 tbody 避免匹配到 <option> 元素）
    const tbody = page.locator('tbody')
    const lowStockBadge = tbody.getByText('库存不足')
      .or(tbody.getByText('低库存'))
    await expect(lowStockBadge.first()).toBeVisible()
  })

  test('7B.3【样品回收状态】样品回收后状态正确更新', async ({ page }) => {
    // 场景：修复面霜 C 的一个样品（SP-2026-0201-C001）已回收
    // 回收后状态应更新为"已回收"，存放在回收隔离区
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 已回收样品
    const returnedBadge = page.getByText('已回收')
    await expect(returnedBadge.first()).toBeVisible()
  })

  test('7B.4【多预警导航】多个预警同时出现时的信息呈现', async ({ page }) => {
    // 场景：王度支发现同时有：
    // - 效期预警：3 个红色 + 1 个橙色 + 2 个黄色
    // - 库存预警：2 个低库存
    // - 过期产品：2 个
    // 需要跨页面导航收集信息并判断优先级

    // Step 1: 效期预警（最紧急）
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('已锁定').first()).toBeVisible()

    // Step 2: 切换到库存管理查看低库存
    await sidebarNav(page).getByRole('link', { name: '库存管理' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Corneometer 探头保护膜').first()).toBeVisible()

    // Step 3: 切换到产品台账查看过期产品
    await sidebarNav(page).getByRole('link', { name: '产品台账' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
  })
})
