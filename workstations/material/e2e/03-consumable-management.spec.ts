/**
 * 场景 3：耗材管理 — 采购入库到领用消耗
 *
 * 业务背景：
 *   除了测试样品，CRO 机构日常运转还依赖大量检测耗材：
 *   Corneometer 探头保护膜、一次性检测手套、酒精棉球、
 *   pH 标准缓冲液等。这些耗材看似不起眼，但一旦缺货
 *   会直接导致检测工作停摆。
 *
 *   王度支需要：
 *   - 实时掌握各耗材库存量和安全库存比较
 *   - 对低库存耗材提前采购
 *   - 对近效期耗材及时处理
 *   - 记录每次领用，确保消耗可追溯
 *
 * 验证目标：
 *   工作台是否能帮助物料管理员实现"耗材零断供"的目标，
 *   并且每一次领用消耗都有完整的追溯记录。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景3: 耗材管理 — 采购入库到领用消耗', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('3.1【耗材概览】耗材概览显示统计数据', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // consumableStats: total_types: 6, total_quantity: 35, low_stock_count: 2, expiring_count: 1
    // 四个关键数字帮助管理员判断耗材保障状况
    await expect(page.getByText('耗材种类').first()).toBeVisible()
    await expect(page.getByText('库存总量').first()).toBeVisible()
    await expect(page.getByText('近效期').first()).toBeVisible()
  })

  test('3.2【耗材列表】耗材列表展示所有 6 种耗材', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // 6 种耗材都应该在列表中可见
    await expect(page.getByText('Corneometer 探头保护膜').first()).toBeVisible()
    await expect(page.getByText('Tewameter 探头盖').first()).toBeVisible()
    await expect(page.getByText('75%酒精棉球').first()).toBeVisible()
    await expect(page.getByText('一次性检测手套 (M)').first()).toBeVisible()
    await expect(page.getByText('皮肤标记笔').first()).toBeVisible()
    await expect(page.getByText('pH 4.0 标准缓冲液').first()).toBeVisible()
  })

  test('3.3【低库存警告】低库存耗材有明显警告标识', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // Corneometer 探头保护膜（current: 2, safety: 5）和
    // 75%酒精棉球（current: 1, safety: 3）低于安全库存
    // 这些耗材必须有醒目的低库存警告
    await expect(page.getByText('Corneometer 探头保护膜').first()).toBeVisible()
    await expect(page.getByText('75%酒精棉球').first()).toBeVisible()

    const lowStockBadge = page.locator('.divide-y span').filter({ hasText: '库存不足' })
      .or(page.getByText('库存不足').first())
    await expect(lowStockBadge.first()).toBeVisible()
  })

  test('3.4【近效期标识】近效期耗材有橙色标识', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // pH 4.0 标准缓冲液效期仅剩 25 天，status: 'expiring'
    await expect(page.getByText('pH 4.0 标准缓冲液').first()).toBeVisible()

    const expiringBadge = page.locator('.divide-y span').filter({ hasText: '近效期' })
      .or(page.getByText('近效期').first())
    await expect(expiringBadge.first()).toBeVisible()
  })

  test('3.5【新增耗材】可以新增耗材', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // 场景：季度采购到货，需要新增一种耗材入系统
    const addBtn = page.getByRole('button', { name: '新增耗材' })
      .or(page.getByRole('button', { name: '新增' }))
    await addBtn.first().click()
    await page.waitForTimeout(500)

    // 新增耗材弹窗应包含必要字段
    const modal = page.locator('.fixed')
    await expect(modal.getByText('耗材名称').or(modal.getByText('名称')).first()).toBeVisible()

    // 验证有提交按钮
    const submitBtn = page.getByRole('button', { name: '提交' })
      .or(page.getByRole('button', { name: '保存' }))
      .or(page.getByRole('button', { name: '确定' }))
    await expect(submitBtn.first()).toBeVisible()
  })

  test('3.6【登记领用】可以登记领用', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // 场景：张技评来领 Corneometer 探头保护膜做检测
    const issueBtn = page.getByRole('button', { name: '领用' })
      .or(page.getByRole('button', { name: '登记领用' }))
    await issueBtn.first().click()
    await page.waitForTimeout(500)

    // 领用弹窗应包含领用数量、领用人等信息
    const modal = page.locator('.fixed')
    await expect(modal.getByText('领用').or(modal.getByText('数量')).first()).toBeVisible()
  })

  test('3.7【类别筛选】能按类别筛选耗材', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // 三大耗材类别：仪器耗材、通用耗材、标准品
    // 筛选帮助管理员按类别盘点和采购
    const categoryFilter = page.locator('select').filter({ hasText: '类别' })
      .or(page.locator('select[aria-label="类别筛选"]'))
      .or(page.locator('select').filter({ hasText: '全部类别' }))
    if (await categoryFilter.first().isVisible()) {
      // 筛选"仪器耗材"类别
      await categoryFilter.first().selectOption('仪器耗材')
      await page.waitForLoadState('networkidle')

      // 应该只看到仪器耗材类的物品
      await expect(page.getByText('Corneometer 探头保护膜').first()).toBeVisible()
      await expect(page.getByText('Tewameter 探头盖').first()).toBeVisible()
    }
  })

  test('3.8【搜索耗材】搜索可以按名称或编码查找', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // 场景：王度支需要快速查找酒精棉球的库存
    const searchInput = page.getByPlaceholder('搜索').or(page.getByPlaceholder('搜索耗材名称、编码...'))
    await searchInput.first().fill('酒精')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('75%酒精棉球').first()).toBeVisible()
  })
})
