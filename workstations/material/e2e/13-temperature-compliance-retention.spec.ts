/**
 * 场景 13：温湿度监控、依从性管理、留样管理
 *
 * 业务背景：
 *   温湿度监控展示存储位置温度趋势、异常告警；依从性管理追踪产品使用
 *   合规与偏差；留样管理维护留样台账与释放流程。
 *
 * 验证目标：
 *   工作台是否能支持温度概况、图表、异常标记、依从性统计、使用记录、
 *   偏差标记、留样台账及释放操作。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景13: 温湿度监控、依从性管理、留样管理', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('13.1【温度概况】温度监控页面显示摘要卡片', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('当前温度').first()).toBeVisible()
    await expect(page.getByText('异常次数').first()).toBeVisible()
  })

  test('13.2【温度趋势】温度图表区域可见', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('温度趋势').first()).toBeVisible()
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 })
  })

  test('13.3【异常标记】异常记录在日志中显示', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('9.2').or(page.getByText('8.5')).first()).toBeVisible()
  })

  test('13.4【位置选择】可以选择不同存储位置', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')

    const locationSelect = page.locator('select[aria-label="存储位置"]')
    await expect(locationSelect).toBeVisible()
    await locationSelect.selectOption({ index: 1 })
    await page.waitForLoadState('networkidle')
  })

  test('13.5【时间范围】可以切换时间范围', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')

    const rangeSelect = page.locator('select[aria-label="时间范围"]')
    await rangeSelect.selectOption('24h')
    await page.waitForLoadState('networkidle')
    await rangeSelect.selectOption('7d')
    await page.waitForLoadState('networkidle')
    await rangeSelect.selectOption('30d')
    await page.waitForLoadState('networkidle')
  })

  test('13.6【依从性概况】依从性管理页面显示统计', async ({ page }) => {
    await page.goto('/material/compliance')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('依从率').first()).toBeVisible()
    await expect(page.getByText('偏差数').first()).toBeVisible()
  })

  test('13.7【使用记录】展示使用记录列表', async ({ page }) => {
    await page.goto('/material/compliance')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('受试者编号').first()).toBeVisible()
    await expect(page.getByText('产品').first()).toBeVisible()
    await expect(page.getByText('合规状态').first()).toBeVisible()
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('S001').first()).toBeVisible()
  })

  test('13.8【偏差标记】可以标记偏差', async ({ page }) => {
    await page.goto('/material/compliance')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '标记偏差' }).first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('标记偏差').first()).toBeVisible()
  })

  test('13.9【留样列表】留样管理页面展示台账', async ({ page }) => {
    await page.goto('/material/retention')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('留样管理').first()).toBeVisible()
    await expect(page.locator('th').filter({ hasText: '留样编号' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: '产品' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: '状态' })).toBeVisible()
  })

  test('13.10【留样释放】可以释放在库留样', async ({ page }) => {
    await page.goto('/material/retention')
    await page.waitForLoadState('networkidle')

    const releaseBtn = page.locator('button[title="释放"]').first()
    await releaseBtn.click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('释放').first()).toBeVisible()
  })
})
