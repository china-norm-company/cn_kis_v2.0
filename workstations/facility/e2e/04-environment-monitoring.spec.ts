/**
 * 场景 04：环境监控 — 温湿度合规
 *
 * 环境监控是赵坤元最核心的日常工作。他需要确保：
 * - 每个受控场地的温湿度在标准范围内
 * - 不合规记录被及时发现和标记
 * - 环境合规率维持在 99% 以上
 * - 人工巡检数据能快速录入
 *
 * 8 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('环境监控 — 温湿度合规', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
    await page.goto('/facility/environment')
  })

  test('4.1 合规统计概览卡片', async ({ page }) => {
    await expect(page.locator('[data-stat="compliance_rate"]')).toContainText('95.8')
    await expect(page.locator('[data-stat="non_compliant"]')).toContainText('8')
    await expect(page.locator('[data-stat="sensor_online"]')).toContainText('99.2')
  })

  test('4.2 实时环境概览 — 各场地温湿度卡片', async ({ page }) => {
    await expect(page.locator('.env-card').filter({ hasText: '恒温恒湿测试室 A' })).toBeVisible()
    await expect(page.locator('.env-card').filter({ hasText: '恒温恒湿测试室 B' })).toBeVisible()
    await expect(page.locator('.env-card').filter({ hasText: '样品存储区' })).toBeVisible()
  })

  test('4.3 合规场地显示绿色标识', async ({ page }) => {
    const roomA = page.locator('.env-card').filter({ hasText: '恒温恒湿测试室 A' })
    await expect(roomA).toBeVisible()
    await expect(roomA.locator('[data-compliant="true"]')).toBeVisible()
  })

  test('4.4 不合规场地显示红色标识', async ({ page }) => {
    const sampleArea = page.locator('.env-card').filter({ hasText: '样品存储区' })
    await expect(sampleArea).toBeVisible()
    await expect(sampleArea.locator('[data-compliant="false"]')).toBeVisible()
  })

  test('4.5 查看环境记录列表', async ({ page }) => {
    await page.getByRole('button', { name: '历史记录' }).click()
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('4.6 按场地筛选环境记录', async ({ page }) => {
    await page.getByRole('button', { name: '历史记录' }).click()
    await page.locator('select').filter({ hasText: /场地/ }).selectOption('1')
    await expect(page.locator('tbody tr').first()).toContainText('恒温恒湿测试室 A')
  })

  test('4.7 筛选不合规记录', async ({ page }) => {
    await page.getByRole('button', { name: '历史记录' }).click()
    await page.locator('select').filter({ hasText: /合规/ }).selectOption('false')
    await expect(page.locator('tbody tr.bg-red-50').first()).toBeVisible()
  })

  test('4.8 手动录入环境记录', async ({ page }) => {
    await page.getByRole('button', { name: '录入记录' }).click()
    const modal = page.locator('.fixed').filter({ hasText: '新增环境记录' })
    await expect(modal).toBeVisible()

    await modal.getByLabel('场地').selectOption('1')
    await modal.getByLabel('温度').fill('22.1')
    await modal.getByLabel('湿度').fill('49.5')
    await modal.getByRole('button', { name: '确定' }).click()
    await expect(page.getByText('记录已创建')).toBeVisible()
  })
})
