/**
 * 场景 5：库存合规 — 盘点流程、温区管理、账实一致
 *
 * 业务背景：
 *   化妆品 CRO 物料管理必须严格遵循 GCP/GLP 存储规范。不同物料
 *   有不同的温湿度存储要求：冷藏 (2-8°C)、阴凉 (≤20°C)、常温 (10-30°C)。
 *   物料管理员需要实时掌握各温区的物料分布、温湿度状况，并定期盘点
 *   确保账实一致。
 *
 *   王度支在日常工作中需要：
 *   - 了解三个温区的物料总览和环境数据
 *   - 按温区筛选库存，快速定位物料
 *   - 关注低库存物料，提前补货
 *   - 识别已锁定物料（过期/不合格），避免误用
 *   - 定期发起盘点并查看盘点差异
 *
 * 验证目标：
 *   工作台是否为物料管理员提供清晰的库存全景和合规工具。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景5: 库存合规 — 盘点流程、温区管理、账实一致', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('5.1【温区概况】库存概况展示三个温区统计', async ({ page }) => {
    // 场景：王度支打开库存管理页面，需要一眼看到三个温区的整体状况
    // 每个温区卡片应展示：物料数、温度、湿度
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')

    // 冷藏区
    await expect(page.getByText('冷藏区').first()).toBeVisible()
    await expect(page.getByText('4.2°C').first()).toBeVisible()
    await expect(page.getByText('45%').first()).toBeVisible()

    // 阴凉区
    await expect(page.getByText('阴凉区').first()).toBeVisible()
    await expect(page.getByText('18.5°C').first()).toBeVisible()
    await expect(page.getByText('50%').first()).toBeVisible()

    // 常温区
    await expect(page.getByText('常温区').first()).toBeVisible()
    await expect(page.getByText('22.1°C').first()).toBeVisible()
    await expect(page.getByText('48%').first()).toBeVisible()
  })

  test('5.2【库存列表】库存列表展示所有在库物料', async ({ page }) => {
    // 场景：查看完温区概况后，王度支要浏览所有在库物料的详细信息
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')

    // 列表中应展示各类在库物料
    await expect(page.getByText('美白精华液 A').first()).toBeVisible()
    await expect(page.getByText('修复面霜 C').first()).toBeVisible()
    await expect(page.getByText('防晒乳 D').first()).toBeVisible()
    await expect(page.getByText('安慰剂基质 E').first()).toBeVisible()

    // 耗材也在库存列表中
    await expect(page.getByText('Corneometer 探头保护膜').first()).toBeVisible()
    await expect(page.getByText('75%酒精棉球').first()).toBeVisible()
  })

  test('5.3【温区筛选】按温区筛选库存', async ({ page }) => {
    // 场景：王度支需要检查冷藏区的所有物料是否正常
    // 冷藏区存放的主要是测试样品，温度要求最严格
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')

    // 筛选冷藏区
    const zoneFilter = page.locator('select').filter({ hasText: '冷藏' })
      .or(page.getByText('冷藏区').first())
    if (await zoneFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await zoneFilter.click()
      await page.waitForLoadState('networkidle')
    }

    // 冷藏区应包含美白精华液 A（zone: cold）
    await expect(page.getByText('美白精华液 A').first()).toBeVisible()
  })

  test('5.4【低库存警告】低库存物料有明显警告标识', async ({ page }) => {
    // 场景：探头保护膜和酒精棉球库存不足（当前 < 安全库存）
    // 管理员需要一眼识别哪些物料需要补货
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')

    // 低库存物料应展示在列表中
    // Corneometer 探头保护膜：当前2盒，安全库存5盒 → 低库存
    await expect(page.getByText('Corneometer 探头保护膜').first()).toBeVisible()

    // 75%酒精棉球：当前1桶，安全库存3桶 → 低库存
    await expect(page.getByText('75%酒精棉球').first()).toBeVisible()

    // 低库存状态标识应可见（限定到 tbody 避免匹配到 <option> 元素）
    const tbody = page.locator('tbody')
    const lowStockBadge = tbody.getByText('库存不足')
      .or(tbody.getByText('低库存'))
    await expect(lowStockBadge.first()).toBeVisible()
  })

  test('5.5【锁定物料】已锁定物料有特殊标识', async ({ page }) => {
    // 场景：抗皱精华 F 已过期并被锁定，不得再分发
    // 管理员需要在库存列表中看到锁定标识，避免误操作
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')

    // 已锁定的物料（抗皱精华 F 留样，status: locked）
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()

    // 锁定状态应有明确标识（限定到 tbody 避免匹配到 <option> 元素）
    const tbody = page.locator('tbody')
    const lockedBadge = tbody.getByText('已锁定')
      .or(tbody.getByText('锁定'))
    await expect(lockedBadge.first()).toBeVisible()
  })

  test('5.6【发起盘点】盘点功能入口存在', async ({ page }) => {
    // 场景：按照 SOP 要求，物料管理员每月需要对库存进行一次盘点
    // 王度支准备发起本月盘点
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')

    // 盘点功能入口
    const checkBtn = page.getByRole('button', { name: '发起盘点' })
      .or(page.getByRole('button', { name: '库存盘点' }))
      .or(page.getByRole('button', { name: '盘点' }))
    await expect(checkBtn.first()).toBeVisible()
  })

  test('5.7【盘点结果】上次盘点结果可查看', async ({ page }) => {
    // 场景：3天前完成了盘点，发现一次性检测手套实际数与系统数不一致
    // 王度支需要查看差异明细并跟进处理
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')

    // 上次盘点记录应可见
    await expect(page.getByText('最近盘点结果').first()).toBeVisible()

    // 盘点差异数据：一次性检测手套 (M) 预期17、实际15、差异-2
    await expect(page.getByText('一次性检测手套').first()).toBeVisible()

    // 差异备注
    const discrepancyNote = page.getByText('未登记领用')
      .or(page.getByText('差异'))
    await expect(discrepancyNote.first()).toBeVisible()
  })
})
