/**
 * 场景 03：预约管理 — 资源调度
 *
 * 赵坤元负责协调各项目对测试室的使用需求：
 * - 查看今日和本周预约排程
 * - 审核新预约申请（冲突检测）
 * - 确认/取消预约
 * - 按状态筛选查看预约历史
 *
 * 8 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('预约管理 — 资源调度', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
    await page.goto('/facility/reservations')
  })

  test('3.1 预约统计卡片展示正确数值', async ({ page }) => {
    await expect(page.locator('[data-stat="today"]')).toContainText('5')
    await expect(page.locator('[data-stat="week"]')).toContainText('15')
    await expect(page.locator('[data-stat="pending"]')).toContainText('3')
    await expect(page.locator('[data-stat="utilization"]')).toContainText('72.5')
  })

  test('3.2 预约列表展示关键信息', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expect(firstRow).toContainText('保湿美白功效评价')
    await expect(firstRow).toContainText('恒温恒湿测试室 A')
    await expect(firstRow).toContainText('张技评')
    await expect(firstRow).toContainText('已确认')
  })

  test('3.3 按状态筛选预约 — 待确认', async ({ page }) => {
    await page.locator('select').filter({ hasText: /状态/ }).selectOption('pending')
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('待确认').first()).toBeVisible()
    await expect(tbody.getByText('抗皱功效评价 — 终点检测')).toBeVisible()
  })

  test('3.4 按场地筛选预约', async ({ page }) => {
    await page.locator('select').filter({ hasText: /场地/ }).selectOption('1')
    await expect(page.locator('tbody tr').first()).toContainText('恒温恒湿测试室 A')
  })

  test('3.5 新建预约 — 打开表单并填写', async ({ page }) => {
    await page.getByRole('button', { name: '新建预约' }).click()
    const modal = page.locator('.fixed').filter({ hasText: '新建预约' })
    await expect(modal).toBeVisible()

    await modal.getByLabel('场地').selectOption('1')
    await modal.getByLabel('用途').fill('抗衰老评价 — 基线检测')
    await modal.getByLabel('项目').fill('抗衰老功效评价')
    await modal.getByRole('button', { name: '确定' }).click()
    await expect(page.getByText('预约创建成功').first()).toBeVisible()
  })

  test('3.6 确认待审批预约', async ({ page }) => {
    await page.locator('select').filter({ hasText: /状态/ }).selectOption('pending')
    const row = page.locator('tbody tr').first()
    await row.getByRole('button', { name: '确认' }).click()
    await expect(page.getByText('预约已确认')).toBeVisible()
  })

  test('3.7 取消预约', async ({ page }) => {
    await page.locator('select').filter({ hasText: /状态/ }).selectOption('pending')
    const row = page.locator('tbody tr').first()
    await row.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText('预约已取消')).toBeVisible()
  })

  test('3.8 日历视图展示预约时间块', async ({ page }) => {
    await page.getByRole('button', { name: '日历视图' }).click()
    await expect(page.locator('[data-view="calendar"]')).toBeVisible()
  })
})
