import { test, expect } from './fixtures'

test.describe('S10: 管理驾驶舱概览', () => {
  test('S10.1: 驾驶舱页面加载与统计卡片', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('客户总数')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('健康度均分')).toBeVisible({ timeout: 10000 })
  })

  test('S10.2: 待处理预警与管道价值卡片', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    const main = page.getByRole('main')
    await expect(main.getByText('待处理预警').first()).toBeVisible({ timeout: 10000 })
    await expect(main.getByText('管道价值').first()).toBeVisible({ timeout: 10000 })
  })

  test('S10.3: 风险分布与最新预警', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('风险分布')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('最新预警')).toBeVisible({ timeout: 10000 })
  })
})
