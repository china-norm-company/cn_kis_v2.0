/**
 * 场景 07：变更与意外 — 非正常态
 *
 * 赵坤元不仅需要处理日常监控，还需要应对各种意外情况：
 * - 空调故障导致温度失控
 * - 停电应急（备用电源、环境恢复）
 * - 不合规事件联动（从监控到事件到清洁）
 * - 紧急预约调整
 * - 跨页面导航处理复合事务
 *
 * 8 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('变更与意外 — 非正常态', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('7.1 发现不合规后从环境监控导航到事件页面', async ({ page }) => {
    await page.goto('/facility/environment')
    const sampleArea = page.locator('.env-card').filter({ hasText: '样品存储区' })
    await expect(sampleArea).toBeVisible()

    await page.getByRole('link', { name: '不合规事件' }).click()
    await expect(page).toHaveURL(/\/incidents/)
    await expect(page.locator('tbody tr').filter({ hasText: 'INC-2026-001' })).toBeVisible()
  })

  test('7.2 查看严重事件（空调故障）详情', async ({ page }) => {
    await page.goto('/facility/incidents')
    await page.locator('tbody tr').filter({ hasText: 'INC-2026-005' }).click()
    await expect(page.getByText('事件详情')).toBeVisible()
    await expect(page.getByText('空调制冷异响')).toBeVisible()
  })

  test('7.3 空调故障 — 创建紧急事件后查看影响预约', async ({ page }) => {
    await page.goto('/facility/incidents')
    await page.getByRole('button', { name: '创建事件' }).click()
    const modal = page.locator('.fixed').filter({ hasText: '创建事件' })
    await modal.getByLabel('事件名称').fill('测试室A空调完全故障')
    await modal.getByLabel('场地').selectOption('1')
    await modal.getByLabel('严重级别').selectOption('critical')
    await modal.getByLabel('描述').fill('空调完全停止工作，温度持续上升')
    await modal.getByRole('button', { name: '确定' }).click()
    await expect(page.getByText('事件已创建')).toBeVisible()

    await page.getByRole('link', { name: '场地预约' }).click()
    await expect(page).toHaveURL(/\/reservations/)
    await expect(page.locator('tbody tr').first()).toContainText('恒温恒湿测试室 A')
  })

  test('7.4 不合规场地的温湿度数值显示', async ({ page }) => {
    await page.goto('/facility/environment')
    const sampleArea = page.locator('.env-card').filter({ hasText: '样品存储区' })
    await expect(sampleArea).toContainText('25.8')
    await expect(sampleArea).toContainText('68')
  })

  test('7.5 从场地列表进入环境监控', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.locator('.venue-card').filter({ hasText: '样品存储区' })).toBeVisible()

    await page.getByRole('link', { name: '环境监控' }).click()
    await expect(page).toHaveURL(/\/environment/)
    await expect(page.locator('.env-card').filter({ hasText: '样品存储区' })).toBeVisible()
  })

  test('7.6 事件处理后查看清洁需求', async ({ page }) => {
    await page.goto('/facility/incidents')
    await expect(page.locator('tbody tr').filter({ hasText: 'INC-2026-001' })).toBeVisible()

    await page.getByRole('link', { name: '清洁记录' }).click()
    await expect(page).toHaveURL(/\/cleaning/)
    await expect(page.locator('tbody tr').filter({ hasText: '样品存储区' })).toBeVisible()
  })

  test('7.7 等候区风速事件需要关注受试者影响', async ({ page }) => {
    await page.goto('/facility/incidents')
    await page.locator('select').filter({ hasText: /状态/ }).selectOption('open')
    const row = page.locator('tbody tr').filter({ hasText: 'INC-2026-006' })
    await expect(row).toBeVisible()
    await expect(row).toContainText('等候区通风系统风速偏高')
    await expect(row).toContainText('一般')
  })

  test('7.8 跨页面工作流 — 巡检 → 环境 → 事件 → 清洁', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.locator('[data-stat="total"]')).toContainText('场地总数')

    await page.getByRole('link', { name: '环境监控' }).click()
    await expect(page.locator('[data-stat="compliance_rate"]')).toContainText('合规率')

    await page.getByRole('link', { name: '不合规事件' }).click()
    await expect(page.locator('[data-stat="open"]')).toContainText('未关闭')

    await page.getByRole('link', { name: '清洁记录' }).click()
    await expect(page.locator('[data-stat="month_count"]')).toContainText('本月清洁')
  })
})
