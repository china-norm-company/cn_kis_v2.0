/**
 * 场景 05：不合规事件 — 偏差到关闭
 *
 * 当环境参数超出控制范围，赵坤元需要：
 * - 创建不合规事件记录
 * - 评估影响范围（哪些测试受影响）
 * - 进行根因分析
 * - 实施纠正和预防措施
 * - 推动事件关闭
 *
 * 8 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('不合规事件 — 偏差到关闭', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
    await page.goto('/facility/incidents')
  })

  test('5.1 事件统计卡片展示数值', async ({ page }) => {
    await expect(page.locator('[data-stat="open"]')).toContainText('2')
    await expect(page.locator('[data-stat="month_new"]')).toContainText('6')
    await expect(page.locator('[data-stat="avg_response"]')).toContainText('12')
    await expect(page.locator('[data-stat="closure_rate"]')).toContainText('50')
  })

  test('5.2 事件列表展示关键信息', async ({ page }) => {
    const firstRow = page.locator('tbody tr').filter({ hasText: 'INC-2026-001' })
    await expect(firstRow).toBeVisible()
    await expect(firstRow).toContainText('样品存储区温湿度持续超标')
    await expect(firstRow).toContainText('严重')
    await expect(firstRow).toContainText('调查中')
  })

  test('5.3 按严重级别筛选事件', async ({ page }) => {
    await page.locator('select').filter({ hasText: /严重/ }).selectOption('critical')
    await expect(page.locator('tbody tr').filter({ hasText: 'INC-2026-001' })).toBeVisible()
    await expect(page.locator('tbody tr').filter({ hasText: 'INC-2026-005' })).toBeVisible()
  })

  test('5.4 按状态筛选事件 — 待处理', async ({ page }) => {
    await page.locator('select').filter({ hasText: /状态/ }).selectOption('open')
    await expect(page.locator('tbody').getByText('待处理').first()).toBeVisible()
    await expect(page.locator('tbody tr').filter({ hasText: 'INC-2026-005' })).toBeVisible()
  })

  test('5.5 查看事件详情', async ({ page }) => {
    await page.locator('tbody tr').filter({ hasText: 'INC-2026-001' }).click()
    await expect(page.getByText('事件详情')).toBeVisible()
    await expect(page.getByRole('heading', { name: '样品存储区温湿度持续超标' })).toBeVisible()
    await expect(page.getByText('偏离参数')).toBeVisible()
    await expect(page.getByText('温度 25.8°C')).toBeVisible()
  })

  test('5.6 创建新事件', async ({ page }) => {
    await page.getByRole('button', { name: '创建事件' }).click()
    const modal = page.locator('.fixed').filter({ hasText: '创建事件' })
    await expect(modal).toBeVisible()

    await modal.getByLabel('事件名称').fill('清洁准备间温度异常')
    await modal.getByLabel('场地').selectOption('8')
    await modal.getByLabel('严重级别').selectOption('minor')
    await modal.getByLabel('描述').fill('清洁准备间温度达28°C，超出控制范围')
    await modal.getByRole('button', { name: '确定' }).click()
    await expect(page.getByText('事件已创建')).toBeVisible()
  })

  test('5.7 事件状态流转 — 待处理到调查中', async ({ page }) => {
    await page.locator('select').filter({ hasText: /状态/ }).selectOption('open')
    const row = page.locator('tbody tr').filter({ hasText: 'INC-2026-005' })
    await row.getByRole('button', { name: '开始调查' }).click()
    await expect(page.getByText('更新成功')).toBeVisible()
  })

  test('5.8 事件详情展示影响评估', async ({ page }) => {
    await page.locator('tbody tr').filter({ hasText: 'INC-2026-001' }).click()
    await expect(page.getByRole('heading', { name: '影响评估' })).toBeVisible()
    await expect(page.getByText(/屏障修复评价/).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: '纠正措施' })).toBeVisible()
  })
})
