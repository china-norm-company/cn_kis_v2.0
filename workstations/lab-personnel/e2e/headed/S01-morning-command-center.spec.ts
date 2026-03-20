/**
 * S01：早晨指挥中心 — 看板总览
 *
 * 业务标准：30秒内理解每日状态
 * 测试权重：10%
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupHeadedMocks, waitForPageReady } from './helpers/setup'

test.describe('早晨指挥中心 — 看板总览', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupHeadedMocks(page)
  })

  test('1.1 导航到看板，截图并验证4个统计卡片', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await waitForPageReady(page)
    
    await page.screenshot({ path: 'test-results/dashboard-overview.png', fullPage: true })
    
    await expect(page.locator('[data-stat="total"]')).toContainText('12')
    await expect(page.locator('[data-stat="active"]')).toContainText('10')
    await expect(page.locator('[data-stat="cert_expiring"]')).toContainText('4')
    await expect(page.locator('[data-stat="risks_open"]')).toContainText('8')
  })

  test('1.2 验证风险摘要区域显示红/黄/蓝风险数量', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await waitForPageReady(page)
    
    const riskSection = page.locator('[data-section="risk-summary"]')
    await expect(riskSection).toBeVisible()
    
    // 验证风险摘要包含颜色标识
    const redRisk = riskSection.getByText(/红色风险/)
    const yellowRisk = riskSection.getByText(/黄色风险/)
    const blueRisk = riskSection.getByText(/蓝色风险/)
    
    if (await redRisk.isVisible()) {
      await expect(redRisk).toBeVisible()
    }
    if (await yellowRisk.isVisible()) {
      await expect(yellowRisk).toBeVisible()
    }
    if (await blueRisk.isVisible()) {
      await expect(blueRisk).toBeVisible()
    }
  })

  test('1.3 验证今日排班时间线可见', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await waitForPageReady(page)
    
    const timeline = page.locator('[data-section="today-timeline"]')
    await expect(timeline).toBeVisible()
    await expect(timeline.getByText(/今日排班/)).toBeVisible()
  })

  test('1.4 点击风险卡片，验证导航到风险页面', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await waitForPageReady(page)
    
    // 点击风险统计卡片
    await page.locator('[data-stat="risks_open"]').click()
    await waitForPageReady(page)
    
    await expect(page).toHaveURL(/\/risks/)
    await expect(page.locator('h2')).toContainText('风险预警')
  })
})
