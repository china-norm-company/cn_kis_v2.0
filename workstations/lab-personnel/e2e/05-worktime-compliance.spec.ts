/**
 * 场景 05：工时合规 — 工时统计与利用率分析
 *
 * 钱子衿需要审查实验室人员的工时记录、利用率统计、产能预测，
 * 确保人员工时合规，避免过度疲劳，并提前识别产能缺口。
 *
 * 8 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('工时合规 — 工时统计与利用率分析', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('5.1 打开工时统计页面，看到页面标题和统计卡片', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await expect(page.locator('main h2')).toContainText('工时统计')
    await expect(page.locator('[data-stat="total_logs"]')).toBeVisible()
    await expect(page.locator('[data-stat="avg_util"]')).toBeVisible()
    await expect(page.locator('[data-stat="overloaded"]')).toBeVisible()
    await expect(page.locator('[data-stat="forecasts"]')).toBeVisible()
  })

  test('5.2 工时记录表格展示条目（人员/日期/工时/来源）', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    const table = page.locator('[data-section="logs"] table')
    await expect(table).toBeVisible()
    await expect(table.locator('tr').filter({ hasText: '王皮测' }).first()).toBeVisible()
    await expect(table.locator('tr').filter({ hasText: '李医评' }).first()).toBeVisible()
    await expect(table.locator('tr').filter({ hasText: '张仪操' }).first()).toBeVisible()
    await expect(table.getByText('工单').first()).toBeVisible()
    await expect(table.getByText('培训').first()).toBeVisible()
  })

  test('5.3 看到王皮测 8h 工单记录', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    const table = page.locator('[data-section="logs"] table')
    const row = table.locator('tr').filter({ hasText: '王皮测' }).first()
    await expect(row).toContainText('8')
    await expect(row).toContainText('工单')
    await expect(row).toContainText('Corneometer')
  })

  test('5.4 点击"周汇总"标签页，显示汇总表格和利用率', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await page.locator('button[data-tab="summary"]').click()
    await expect(page.locator('[data-section="summary"]')).toBeVisible()
    const summaryTable = page.locator('[data-section="summary"] table')
    await expect(summaryTable).toBeVisible()
    await expect(summaryTable.getByText('王皮测')).toBeVisible()
    await expect(summaryTable.getByText('利用率')).toBeVisible()
  })

  test('5.5 周汇总显示王皮测 95% 利用率（高负荷）', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await page.locator('button[data-tab="summary"]').click()
    const row = page.locator('[data-section="summary"] table tr').filter({ hasText: '王皮测' }).first()
    await expect(row).toContainText('95%')
    await expect(row).toContainText('38')
  })

  test('5.6 点击"利用率"标签页，显示各人员进度条', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await page.locator('button[data-tab="utilization"]').click()
    await expect(page.locator('[data-section="utilization"]')).toBeVisible()
    await expect(page.locator('[data-section="utilization"]').getByText('王皮测')).toBeVisible()
    await expect(page.locator('[data-section="utilization"]').getByText('李医评')).toBeVisible()
    await expect(page.locator('[data-section="utilization"]').locator('[title^="利用率 "]').first()).toBeVisible()
  })

  test('5.7 点击"产能预测"标签页，显示周预测和缺口', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await page.locator('button[data-tab="forecast"]').click()
    await expect(page.locator('[data-section="forecast"]')).toBeVisible()
    await expect(page.locator('[data-section="forecast"]').getByText(/缺口 60h/)).toBeVisible()
    await expect(page.locator('[data-section="forecast"]').getByText(/缺口 50h/)).toBeVisible()
  })

  test('5.8 点击"录入工时"按钮，打开录入模态框（日期/时间/工时输入）', async ({ page }) => {
    await page.goto('/lab-personnel/worktime')
    await page.getByRole('button', { name: /录入工时/ }).click()
    await expect(page.getByRole('heading', { name: '录入工时' })).toBeVisible()
    await expect(page.locator('input[aria-label="工作日期"]')).toBeVisible()
    await expect(page.locator('input[aria-label="开始时间"]')).toBeVisible()
    await expect(page.locator('input[aria-label="实际工时"]')).toBeVisible()
  })
})
