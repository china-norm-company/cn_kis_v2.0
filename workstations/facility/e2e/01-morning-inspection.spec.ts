/**
 * 场景 01：早晨巡检 — 设施全景感知
 *
 * 赵坤元每天 7:30 到岗，第一件事是打开设施管理台，快速掌握：
 * - 全部 8 个场地的状态概览
 * - 今日预约排程
 * - 是否有未关闭的不合规事件
 * - 环境合规率是否达标
 * - 清洁任务的执行进度
 *
 * 9 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('早晨巡检 — 设施全景感知', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('1.1 打开工作台首页，看到仪表盘核心指标', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.locator('[data-stat="total"]')).toContainText('场地总数')
    await expect(page.locator('[data-stat="available"]')).toContainText('空闲')
    await expect(page.locator('[data-stat="in_use"]')).toContainText('使用中')
    await expect(page.locator('[data-stat="maintenance"]')).toContainText('维护中')
  })

  test('1.2 场地统计卡片显示正确数值', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.locator('[data-stat="total"]')).toContainText('8')
    await expect(page.locator('[data-stat="available"]')).toContainText('5')
    await expect(page.locator('[data-stat="in_use"]')).toContainText('1')
    await expect(page.locator('[data-stat="maintenance"]')).toContainText('1')
  })

  test('1.3 场地列表展示全部 8 个场地', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 A' })).toBeVisible()
    await expect(page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 B' })).toBeVisible()
    await expect(page.locator('.venue-card').filter({ hasText: '受试者等候区' })).toBeVisible()
    await expect(page.locator('.venue-card').filter({ hasText: '受试者洗漱区' })).toBeVisible()
    await expect(page.locator('.venue-card').filter({ hasText: '仪器存放室' })).toBeVisible()
    await expect(page.locator('.venue-card').filter({ hasText: '样品存储区' })).toBeVisible()
    await expect(page.locator('.venue-card').filter({ hasText: '数据处理室' })).toBeVisible()
    await expect(page.locator('.venue-card').filter({ hasText: '清洁准备间' })).toBeVisible()
  })

  test('1.4 不合规场地有红色标识', async ({ page }) => {
    await page.goto('/facility/venues')
    const sampleStorage = page.locator('.venue-card').filter({ hasText: '样品存储区' })
    await expect(sampleStorage).toBeVisible()
    await expect(sampleStorage.locator('[data-compliant="false"]')).toBeVisible()
  })

  test('1.5 侧边导航包含全部 5 个菜单项', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.getByRole('link', { name: '场地列表' })).toBeVisible()
    await expect(page.getByRole('link', { name: '场地预约' })).toBeVisible()
    await expect(page.getByRole('link', { name: '环境监控' })).toBeVisible()
    await expect(page.getByRole('link', { name: '不合规事件' })).toBeVisible()
    await expect(page.getByRole('link', { name: '清洁记录' })).toBeVisible()
  })

  test('1.6 导航到环境监控页面', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.getByRole('link', { name: '环境监控' }).click()
    await expect(page).toHaveURL(/\/environment/)
    await expect(page.locator('[data-stat="compliance_rate"]')).toContainText('合规率')
  })

  test('1.7 导航到预约管理页面', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.getByRole('link', { name: '场地预约' }).click()
    await expect(page).toHaveURL(/\/reservations/)
    await expect(page.locator('[data-stat="today"]')).toContainText('今日预约')
  })

  test('1.8 导航到不合规事件页面', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.getByRole('link', { name: '不合规事件' }).click()
    await expect(page).toHaveURL(/\/incidents/)
    await expect(page.locator('[data-stat="open"]')).toContainText('未关闭')
  })

  test('1.9 导航到清洁记录页面', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.getByRole('link', { name: '清洁记录' }).click()
    await expect(page).toHaveURL(/\/cleaning/)
    await expect(page.locator('[data-stat="month_count"]')).toContainText('本月清洁')
  })
})
