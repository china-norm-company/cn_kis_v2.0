/**
 * 场景 02：场地台账 — 场地信息与配置
 *
 * 赵坤元需要管理 8 个功能区域的物理环境参数、设备清单、使用状态，
 * 确保每个测试空间的环境控制标准明确且可追溯。
 *
 * 9 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场地台账 — 场地信息与配置', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('2.1 场地卡片展示核心信息', async ({ page }) => {
    await page.goto('/facility/venues')
    const card = page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 A' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('VNU-TH-A')
    await expect(card).toContainText('35')
    await expect(card).toContainText('严格控制')
  })

  test('2.2 点击场地查看详情抽屉', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 A' }).click()
    await expect(page.getByText('场地详情')).toBeVisible()
    await expect(page.getByText('Corneometer CM 825')).toBeVisible()
    await expect(page.getByText('Tewameter TM 300')).toBeVisible()
  })

  test('2.3 场地详情展示环境控制标准', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 A' }).click()
    await expect(page.getByText('环境控制标准')).toBeVisible()
    await expect(page.getByText('目标温度')).toBeVisible()
    await expect(page.getByText('目标湿度')).toBeVisible()
  })

  test('2.4 场地详情展示关联设备清单', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 A' }).click()
    await expect(page.getByText('VISIA-CR Gen7')).toBeVisible()
    await expect(page.getByText('Cutometer Dual MPA 580')).toBeVisible()
  })

  test('2.5 按名称搜索场地', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.getByPlaceholder(/搜索/).fill('测试室')
    await page.getByPlaceholder(/搜索/).press('Enter')
    await expect(page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 A' })).toBeVisible()
    await expect(page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 B' })).toBeVisible()
  })

  test('2.6 按场地状态筛选', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.locator('select').filter({ hasText: /状态/ }).selectOption('maintenance')
    await expect(page.locator('.venue-card').filter({ hasText: '数据处理室' })).toBeVisible()
  })

  test('2.7 按功能类型筛选', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.locator('select').filter({ hasText: /类型/ }).selectOption('testing_room')
    await expect(page.locator('.venue-card').filter({ hasText: '恒温恒湿测试室 A' })).toBeVisible()
  })

  test('2.8 新增场地 — 打开表单并填写', async ({ page }) => {
    await page.goto('/facility/venues')
    await page.getByRole('button', { name: '新增场地' }).click()
    const modal = page.locator('.fixed').filter({ hasText: '新增场地' })
    await expect(modal).toBeVisible()

    await page.getByLabel('场地名称').fill('新建测试室 C')
    await page.getByLabel('场地编码').fill('VNU-TH-C')
    await page.getByLabel('面积').fill('25')
    await modal.getByRole('button', { name: '确定' }).click()
    await expect(page.getByText('场地创建成功')).toBeVisible()
  })

  test('2.9 维护中场地有维护标识', async ({ page }) => {
    await page.goto('/facility/venues')
    const dataRoom = page.locator('.venue-card').filter({ hasText: '数据处理室' })
    await expect(dataRoom).toBeVisible()
    await expect(dataRoom.locator('.badge-warning, .text-yellow-600, .bg-yellow-50')).toBeVisible()
  })
})
