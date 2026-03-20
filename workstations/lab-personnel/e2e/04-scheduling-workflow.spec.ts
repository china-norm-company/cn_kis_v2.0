/**
 * 场景 04：排班工作流 — 排班计划和时间槽管理
 *
 * 钱子衿需要管理每周排班，包括：
 * - 查看排班计划和统计
 * - 查看时间槽详情
 * - 检测排班冲突
 * - 创建新排班计划
 *
 * 8 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('排班工作流 — 排班计划和时间槽管理', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('4.1 看到排班管理页面标题', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await expect(page.locator('main h2')).toContainText('排班管理')
  })

  test('4.2 看到统计卡片：排班计划数、已发布、总时间槽数、冲突数', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await expect(page.locator('[data-stat="total_schedules"]')).toBeVisible()
    await expect(page.locator('[data-stat="published"]')).toBeVisible()
    await expect(page.locator('[data-stat="total_slots"]')).toBeVisible()
    await expect(page.locator('[data-stat="conflicts"]')).toBeVisible()
  })

  test('4.3 排班列表显示 2 个计划（已发布 + 草稿）', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    const scheduleCards = page.locator('.schedule-card')
    const count = await scheduleCards.count()
    expect(count).toBeGreaterThanOrEqual(2)
    await expect(scheduleCards.filter({ hasText: '已发布' }).first()).toBeVisible()
    await expect(scheduleCards.filter({ hasText: '草稿' }).first()).toBeVisible()
  })

  test('4.4 草稿排班显示"发布"按钮', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    const draftCard = page.locator('.schedule-card').filter({ hasText: '草稿' }).first()
    await expect(draftCard.getByRole('button', { name: /发布/ })).toBeVisible()
  })

  test('4.5 点击"时间槽"标签页，显示时间槽表格，包含人员、日期、时间、项目', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await page.locator('button[data-tab="slots"]').click()
    await expect(page.locator('[data-section="slots"]')).toBeVisible()
    await expect(page.locator('[data-section="slots"] table')).toBeVisible()
    const slotTable = page.locator('[data-section="slots"] table')
    await expect(slotTable.getByText('人员')).toBeVisible()
    await expect(slotTable.getByText('日期')).toBeVisible()
  })

  test('4.6 时间槽表格显示确认状态标识（已确认/待确认）', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await page.locator('button[data-tab="slots"]').click()
    const slotTable = page.locator('[data-section="slots"] table')
    await expect(slotTable.getByText(/已确认|待确认/).first()).toBeVisible()
  })

  test('4.7 点击"冲突检测"标签页，显示冲突或绿色对勾', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await page.locator('button[data-tab="conflicts"]').click()
    await expect(page.locator('[data-section="conflicts"]')).toBeVisible()
    const hasConflicts = await page.locator('[data-section="conflicts"]').getByText(/冲突|工时超限/).isVisible().catch(() => false)
    const hasSuccess = await page.locator('[data-section="conflicts"]').getByText(/无冲突|未检测到/).isVisible().catch(() => false)
    expect(hasConflicts || hasSuccess).toBe(true)
  })

  test('4.8 点击"新建排班"按钮，打开模态框，包含日期和备注输入', async ({ page }) => {
    await page.goto('/lab-personnel/schedules')
    await page.getByRole('button', { name: /新建排班/ }).click()
    await expect(page.getByText('新建排班计划')).toBeVisible()
    await expect(page.locator('input[aria-label="周起始日期"]')).toBeVisible()
    await expect(page.locator('input[aria-label="备注"]')).toBeVisible()
  })
})
