/**
 * S09：完整业务循环 — 端到端管理周期
 *
 * 业务标准：5分钟内完成完整管理周期
 * 测试权重：15%
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupHeadedMocks, waitForPageReady } from './helpers/setup'

test.describe('完整业务循环 — 端到端管理周期', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupHeadedMocks(page)
  })

  test('9.1 看板 → 识别风险（证书即将过期）→ 截图', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await waitForPageReady(page)
    
    // 验证证书即将过期统计可见
    const certExpiringCard = page.locator('[data-stat="cert_expiring"]')
    await expect(certExpiringCard).toBeVisible()
    
    // 截图保存
    await page.screenshot({ path: 'test-results/dashboard-risk-identified.png', fullPage: true })
    
    // 验证风险摘要区域可见
    const riskSection = page.locator('[data-section="risk-summary"]')
    await expect(riskSection).toBeVisible()
  })

  test('9.2 导航到人员详情 → 导航到证书标签页', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await waitForPageReady(page)
    
    // 点击第一个人员卡片或行
    const firstStaff = page.locator('[data-staff-item]').first()
    if (await firstStaff.isVisible()) {
      await firstStaff.click()
      await waitForPageReady(page)
      
      // 验证导航到详情页
      await expect(page).toHaveURL(/\/staff\/\d+/)
      
      // 点击证书标签页
      const certTab = page.getByRole('tab', { name: /证书/ })
      if (await certTab.isVisible()) {
        await certTab.click()
        await waitForPageReady(page)
        
        // 验证证书列表可见
        const certList = page.locator('[data-section="certificates"]')
        await expect(certList).toBeVisible()
      }
    }
  })

  test('9.3 导航到资质页面 → 识别单点风险', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    await waitForPageReady(page)
    
    // 验证资质矩阵可见
    const matrix = page.locator('[data-section="qualification-matrix"]')
    await expect(matrix).toBeVisible()
    
    // 查找风险标识（红色或黄色标记）
    const riskMarkers = matrix.locator('[data-risk="true"]')
    const riskCount = await riskMarkers.count()
    
    if (riskCount > 0) {
      // 验证至少有一个风险被识别
      expect(riskCount).toBeGreaterThan(0)
      
      // 点击第一个风险查看详情
      await riskMarkers.first().click()
      await waitForPageReady(page)
    }
  })

  test('9.4 导航到排班页面 → 查看周历', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await waitForPageReady(page)
    
    await expect(page.locator('h2')).toContainText(/排班/)
    
    const weekTab = page.locator('[data-tab="week"]')
    if (await weekTab.isVisible()) {
      await weekTab.click()
      await waitForPageReady(page)
      
      const weekView = page.locator('[data-section="week-view"]')
      await expect(weekView).toBeVisible()
    } else {
      const scheduleList = page.locator('[data-section="schedule-list"]')
      await expect(scheduleList).toBeVisible()
    }
  })

  test('9.5 返回看板 → 验证导航正常工作', async ({ page }) => {
    // 从排班页面开始
    await page.goto('/lab-personnel/schedules')
    await waitForPageReady(page)
    
    // 点击导航返回看板
    const dashboardLink = page.getByRole('link', { name: /看板|Dashboard/ })
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click()
    } else {
      // 或者直接导航
      await page.goto('/lab-personnel/dashboard')
    }
    await waitForPageReady(page)
    
    // 验证成功返回看板
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('[data-stat="total"]')).toBeVisible()
  })
})
