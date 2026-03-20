/**
 * S08：工时分析能力 — 图表、利用率、预测、录入
 *
 * 业务标准：1分钟内完成工时分析
 * 测试权重：8%
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupHeadedMocks, waitForPageReady } from './helpers/setup'

test.describe('工时分析能力 — 图表、利用率、预测、录入', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupHeadedMocks(page)
  })

  test('8.1 导航到工时页面，验证图表已渲染', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await waitForPageReady(page)
    
    // 验证工时柱状图存在
    const worktimeBarChart = page.locator('[data-chart="worktime-bar"]')
    await expect(worktimeBarChart).toBeVisible()
    
    // 验证产能对比图存在
    const capacityCompareChart = page.locator('[data-chart="capacity-compare"]')
    await expect(capacityCompareChart).toBeVisible()
  })

  test('8.2 切换到利用率标签页，验证进度条和颜色编码', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await waitForPageReady(page)
    
    // 切换到利用率标签页
    const utilizationTab = page.locator('[data-tab="utilization"]')
    await expect(utilizationTab).toBeVisible()
    await utilizationTab.click()
    await waitForPageReady(page)
    
    // 验证利用率区域可见
    const utilizationSection = page.locator('[data-section="utilization"]')
    await expect(utilizationSection).toBeVisible()
    
    // 验证进度条存在
    const progressBars = utilizationSection.locator('[title^="利用率 "]')
    const barCount = await progressBars.count()
    expect(barCount).toBeGreaterThan(0)
    
    // 验证进度条有颜色编码（红色=超负荷，绿色=正常，蓝色=低负荷）
    if (barCount > 0) {
      const firstBar = progressBars.first()
      const barClass = await firstBar.getAttribute('class')
      expect(barClass || '').toMatch(/bg-(red|green|blue)-/)
    }
    
    // 验证利用率百分比显示
    const utilizationRate = utilizationSection.getByText(/\d+%/)
    await expect(utilizationRate.first()).toBeVisible()
  })

  test('8.3 切换到产能预测标签页，验证未来4周数据', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await waitForPageReady(page)
    
    // 切换到产能预测标签页
    const forecastTab = page.locator('[data-tab="forecast"]')
    await expect(forecastTab).toBeVisible()
    await forecastTab.click()
    await waitForPageReady(page)
    
    // 验证预测区域可见
    const forecastSection = page.locator('[data-section="forecast"]')
    await expect(forecastSection).toBeVisible()
    
    // 验证至少显示未来4周的数据
    const weekCards = forecastSection.locator('.bg-white.rounded-xl')
    const weekCount = await weekCards.count()
    expect(weekCount).toBeGreaterThanOrEqual(4)
    
    // 验证每周数据包含可用工时和预估需求
    if (weekCount > 0) {
      const firstWeek = weekCards.first()
      await expect(firstWeek.getByText(/可用工时|预估需求/).first()).toBeVisible()
    }
  })

  test('8.4 点击"录入工时"，填写表单并保存', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await waitForPageReady(page)
    
    // 点击录入工时按钮
    const createButton = page.getByText('录入工时')
    await expect(createButton).toBeVisible()
    await createButton.click()
    await waitForPageReady(page)
    
    // 填写表单
    const today = new Date().toISOString().split('T')[0]
    await page.fill('input[aria-label="工作日期"]', today)
    await page.fill('input[aria-label="开始时间"]', '09:00')
    await page.fill('input[aria-label="结束时间"]', '18:00')
    await page.fill('input[aria-label="实际工时"]', '8')
    await page.fill('input[aria-label="描述"]', 'E2E测试工时录入')
    
    // 点击确定按钮
    const confirmButton = page.getByText('确定').last()
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()
    await waitForPageReady(page)
    
    // 验证成功消息或表单关闭
    const successMessage = page.getByText(/工时记录已创建|创建成功/)
    await expect(successMessage.first()).toBeVisible({ timeout: 3000 })
  })

  test('8.5 验证业务标准：1分钟内完成工时分析', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await waitForPageReady(page)
    
    const startTime = Date.now()
    
    // 验证关键统计卡片快速可见
    const statCards = ['total_logs', 'avg_util', 'overloaded', 'forecasts']
    for (const stat of statCards) {
      const card = page.locator(`[data-stat="${stat}"]`)
      await expect(card).toBeVisible()
    }
    
    // 验证图表快速加载
    await expect(page.locator('[data-chart="worktime-bar"]')).toBeVisible()
    await expect(page.locator('[data-chart="capacity-compare"]')).toBeVisible()
    
    // 切换到利用率标签页
    await page.locator('[data-tab="utilization"]').click()
    await waitForPageReady(page)
    await expect(page.locator('[data-section="utilization"]')).toBeVisible()
    
    // 切换到预测标签页
    await page.locator('[data-tab="forecast"]').click()
    await waitForPageReady(page)
    await expect(page.locator('[data-section="forecast"]')).toBeVisible()
    
    const totalTime = Date.now() - startTime
    expect(totalTime).toBeLessThan(60000) // 1分钟内完成所有操作
  })
})
