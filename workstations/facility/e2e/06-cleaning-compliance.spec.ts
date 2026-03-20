/**
 * 场景 06：清洁管理 — 计划与执行
 *
 * 赵坤元监督测试区域的清洁工作：
 * - 日常清洁（每天早上开工前）
 * - 场次间清洁（每批测量之间）
 * - 深度清洁（每周末）
 * - 特殊清洁（临时需要）
 *
 * 7 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('清洁管理 — 计划与执行', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
    await page.goto('/facility/cleaning')
  })

  test('6.1 清洁统计卡片展示数值', async ({ page }) => {
    await expect(page.locator('[data-stat="month_count"]')).toContainText('12')
    await expect(page.locator('[data-stat="execution_rate"]')).toContainText('100')
    await expect(page.locator('[data-stat="today_pending"]')).toContainText('2')
    await expect(page.locator('[data-stat="deep_pending"]')).toContainText('0')
  })

  test('6.2 清洁记录列表展示关键信息', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expect(firstRow).toContainText('恒温恒湿测试室 A')
    await expect(firstRow).toContainText('日常清洁')
    await expect(firstRow).toContainText('陈清洁')
    await expect(firstRow).toContainText('已验证')
  })

  test('6.3 按清洁类型筛选 — 深度清洁', async ({ page }) => {
    await page.locator('select').filter({ hasText: /类型/ }).selectOption('deep')
    await expect(page.locator('tbody tr').first()).toContainText('深度清洁')
  })

  test('6.4 按场地筛选清洁记录', async ({ page }) => {
    await page.locator('select').filter({ hasText: /场地/ }).selectOption('1')
    await expect(page.locator('tbody tr').first()).toContainText('恒温恒湿测试室 A')
  })

  test('6.5 查看待执行的清洁任务', async ({ page }) => {
    await page.locator('select').filter({ hasText: /状态/ }).selectOption('pending')
    await expect(page.locator('tbody').getByText('待执行').first()).toBeVisible()
  })

  test('6.6 新增清洁记录', async ({ page }) => {
    await page.getByRole('button', { name: '新增清洁记录' }).click()
    const modal = page.locator('.fixed').filter({ hasText: '新增清洁记录' })
    await expect(modal).toBeVisible()

    await modal.getByLabel('场地').selectOption('1')
    await modal.getByLabel('类型').selectOption('daily')
    await modal.getByLabel('清洁人员').fill('陈清洁')
    await modal.getByRole('button', { name: '确定' }).click()
    await expect(page.getByText('清洁记录已创建')).toBeVisible()
  })

  test('6.7 已验证记录有验证标识', async ({ page }) => {
    const verifiedRow = page.locator('tbody tr').filter({ hasText: '已验证' }).first()
    await expect(verifiedRow).toBeVisible()
    await expect(verifiedRow).toContainText('赵坤元')
  })
})
