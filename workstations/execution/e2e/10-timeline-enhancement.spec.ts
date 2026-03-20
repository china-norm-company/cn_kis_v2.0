/**
 * 场景 10：CRC 仪表盘时间线增强
 *
 * 验收项：
 * ✓ AC-7: CRC仪表盘今日任务显示时间段
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景10: 时间线时间段显示', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc')
  })

  test('10.1 CRC 仪表盘应显示今日任务列表', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('今日任务')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('S-001 皮肤水分测试')).toBeVisible()
  })

  test('10.2 今日任务应显示时间段', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    const timeSlots = page.locator('[data-stat="time-slot"]')
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 })
    const count = await timeSlots.count()
    expect(count).toBeGreaterThanOrEqual(4)

    await expect(page.getByText('08:00')).toBeVisible()
    await expect(page.getByText('~ 08:30')).toBeVisible()

    await expect(page.getByText('09:00')).toBeVisible()
    await expect(page.getByText('~ 10:00')).toBeVisible()
  })

  test('10.3 任务项应包含项目信息', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('今日任务')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-module="timeline-item"]').first()).toBeVisible()

    const firstItem = page.locator('[data-module="timeline-item"]').first()
    await expect(firstItem.getByText('HYD-2026-001 保湿功效评价')).toBeVisible()
  })

  test('10.4 点击任务项应跳转到工单详情', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    const timelineItem = page.locator('[data-module="timeline-item"]').first()
    await expect(timelineItem).toBeVisible({ timeout: 10000 })
    await timelineItem.click()

    await page.waitForURL(/\/workorders\//, { timeout: 10000 })
  })

  test('10.5 个人统计应正确展示', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('活跃工单')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('今日排程')).toBeVisible()
    await expect(page.getByText('今日完成')).toBeVisible()
    await expect(page.getByText('本周完成')).toBeVisible()
  })
})
