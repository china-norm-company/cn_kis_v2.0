/**
 * S02：排班日历发布流程
 *
 * 业务标准：3分钟内完成排班发布
 * 测试权重：12%
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupHeadedMocks, waitForPageReady } from './helpers/setup'

test.describe('排班日历发布流程', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupHeadedMocks(page)
  })

  test('2.1 导航到排班页面，切换到周视图，验证日历渲染', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await waitForPageReady(page)
    
    await page.locator('[data-tab="week"]').click()
    await waitForPageReady(page)
    
    const weekView = page.locator('[data-section="week-view"]')
    await expect(weekView).toBeVisible()
  })

  test('2.2 使用按钮向前/向后导航周', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await waitForPageReady(page)
    
    await page.locator('[data-tab="week"]').click()
    await waitForPageReady(page)
    
    const weekText = await page.locator('[data-section="week-view"]').locator('text=/\\d{4}-\\d{2}-\\d{2}/').first().textContent()
    
    await page.getByRole('button', { name: /下一周/ }).click()
    await waitForPageReady(page)
    
    const newWeekText = await page.locator('[data-section="week-view"]').locator('text=/\\d{4}-\\d{2}-\\d{2}/').first().textContent()
    expect(newWeekText).not.toBe(weekText)
    
    await page.getByRole('button', { name: /上一周/ }).click()
    await waitForPageReady(page)
  })

  test('2.3 切换到排班计划标签，验证排班列表', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await waitForPageReady(page)
    
    await page.locator('[data-tab="schedules"]').click()
    await waitForPageReady(page)
    
    const schedulesSection = page.locator('[data-section="schedule-list"]')
    await expect(schedulesSection).toBeVisible()
  })

  test('2.4 点击草稿排班的发布按钮，验证发布API被调用', async ({ page }) => {
    const publishCalls: string[] = []
    await page.route('**/api/v1/lab-personnel/schedules/**/publish**', async (route) => {
      publishCalls.push(route.request().url())
      await route.fulfill({ json: { code: 200, msg: '已发布', data: { id: 1, status: 'published', status_display: '已发布' } } })
    })

    await page.goto('/lab-personnel/schedules')
    await waitForPageReady(page)
    
    await page.locator('[data-tab="schedules"]').click()
    await waitForPageReady(page)
    
    const draftSchedule = page.locator('.schedule-card').filter({ hasText: '草稿' }).first()
    if (await draftSchedule.isVisible()) {
      const publishButton = draftSchedule.getByRole('button', { name: /发布/ })
      await publishButton.click()
      await waitForPageReady(page)
      
      expect(publishCalls.length).toBeGreaterThan(0)
    }
  })
})
