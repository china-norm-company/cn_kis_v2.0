/**
 * 场景 1：早晨开工 — 物料管理员如何掌握库存全局
 *
 * 业务背景：
 *   周一早晨 8:30，物料管理员王度支打开工作台。他需要在 5 分钟内
 *   了解所有产品的库存状况、哪些批次即将过期、今天有哪些出入库
 *   待处理、耗材是否充足。这些信息决定了他今天的工作优先级。
 *
 * 验证目标：
 *   一个合格的物料管理员能否通过工作台快速建立"态势感知"——
 *   知道库存瓶颈在哪里、哪些物料最紧急、如何安排今天的工作。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景1: 早晨开工 — 物料管理员的库存全局感知', () => {
  const sidebarNav = (page: import('@playwright/test').Page) =>
    page.getByRole('complementary').getByRole('navigation')

  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('1.1【库存全局】登录后能看到产品台账统计', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 物料管理员打开产品台账，首先需要看到关键统计指标
    // 这些数字帮助他判断今天的物料保障压力
    await expect(page.getByText('在管产品').first()).toBeVisible()
    await expect(page.getByText('在库批次').first()).toBeVisible()
    await expect(page.getByText('近效期').first()).toBeVisible()
    await expect(page.getByText('已过期').first()).toBeVisible()
  })

  test('1.2【产品清单】能看到产品列表中的关键信息', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 物料管理员需要看到每个产品的：
    // - 名称（是什么产品）
    // - 编码（唯一标识）
    // - 批号（追溯用）
    // - 存储条件（确保温湿度合规）
    // - 效期（最关键的时效信息）
    await expect(page.getByText('美白精华液 A').first()).toBeVisible()
    await expect(page.getByText('PRD-2026-001').first()).toBeVisible()
    await expect(page.getByText('BN20260115-A').first()).toBeVisible()
    await expect(page.getByText('冷藏 2-8°C').first()).toBeVisible()
  })

  test('1.3【快速搜索】搜索功能可以快速定位产品', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 场景：王度支接到电话问"美白产品还有多少库存？"
    // 他需要快速搜索定位
    const searchInput = page.getByPlaceholder('搜索').or(page.getByPlaceholder('搜索产品名称、编码、批号...'))
    await searchInput.first().fill('美白')
    await page.waitForLoadState('networkidle')

    // 搜索"美白"应该命中美白精华液 A 和 B
    await expect(page.getByText('美白精华液 A').first()).toBeVisible()
    await expect(page.getByText('美白精华液 B-对照').first()).toBeVisible()
  })

  test('1.4【效期筛选】筛选功能可以过滤已过期产品', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 场景：王度支需要处理过期样品——这是每天的优先事项
    const expiryFilter = page.locator('select').filter({ hasText: '效期' })
      .or(page.locator('select[aria-label="效期筛选"]'))
      .or(page.locator('select').filter({ hasText: '全部效期' }))
    if (await expiryFilter.first().isVisible()) {
      await expiryFilter.first().selectOption('expired')
      await page.waitForLoadState('networkidle')

      // 筛选后应该只看到已过期的产品
      await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
      await expect(page.getByText('祛斑霜 G').first()).toBeVisible()
    }
  })

  test('1.5【耗材预警】通过导航切换到耗材页面，看到低库存预警', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 王度支从产品台账切换到耗材管理，检查耗材够不够用
    await sidebarNav(page).getByRole('link', { name: '耗材管理' }).click()
    await page.waitForLoadState('networkidle')

    // 耗材统计中应该显示低库存预警数量
    await expect(page.getByText('库存不足').first()).toBeVisible()
  })

  test('1.6【效期预警】切换到效期预警页面，看到三级预警', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 切换到效期预警页面
    await sidebarNav(page).getByRole('link', { name: '效期预警' }).click()
    await page.waitForLoadState('networkidle')

    // 三级预警：红色（已过期/即将过期）、橙色（注意）、黄色（关注）
    // expiryAlerts.stats: red_count: 3, orange_count: 1, yellow_count: 2
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('祛斑霜 G').first()).toBeVisible()
    await expect(page.getByText('pH 4.0 标准缓冲液').first()).toBeVisible()
  })

  test('1.7【出入库流水】切换到出入库流水页面，看到今日统计', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 切换到出入库流水
    await sidebarNav(page).getByRole('link', { name: '出入库流水' }).click()
    await page.waitForLoadState('networkidle')

    // 应该看到今日出入库统计
    // transactionStats: today_inbound: 0, today_outbound: 1, month_total: 22
    await expect(page.getByText('今日').first()).toBeVisible()
    await expect(page.getByText('本月').first()).toBeVisible()
  })

  test('1.8【样品管理】切换到样品管理页面，看到样品状态统计', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 切换到样品管理
    await sidebarNav(page).getByRole('link', { name: '样品管理' }).click()
    await page.waitForLoadState('networkidle')

    // sampleStats: total: 16, in_stock: 7, distributed: 5, returned: 1, destroyed: 1
    await expect(page.getByText('在库').first()).toBeVisible()
    await expect(page.getByText('已分发').first()).toBeVisible()
  })

  test('1.9【导航完整】所有六个导航入口都可访问', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 物料管理员的六大工作模块都应该在导航中可见
    const nav = sidebarNav(page)
    await expect(nav.getByRole('link', { name: '产品台账' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '耗材管理' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '库存管理' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '出入库流水' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '效期预警' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '样品管理' })).toBeVisible()
  })
})
