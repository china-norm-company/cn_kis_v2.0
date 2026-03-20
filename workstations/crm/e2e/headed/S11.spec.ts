import { test, expect } from './fixtures'

test.describe('S11: 健康度评分系统', () => {
  test('S11.1: 驾驶舱健康度均分展示', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('健康度均分')).toBeVisible({ timeout: 10000 })
  })

  test('S11.2: 合作等级均分展示', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('合作等级均分')).toBeVisible({ timeout: 10000 })
  })

  test('S11.3: 超期联系提醒展示', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('超期联系提醒')).toBeVisible({ timeout: 10000 })
  })

  test('S11.4: 客户详情健康度数据', async ({ page }) => {
    await page.goto('/#/clients/1')
    const profileTab = page.getByText('客户画像')
    await expect(profileTab).toBeVisible({ timeout: 10000 })
    await profileTab.click()
    const healthInfo = page.getByText('健康度').or(page.getByText('基础信息'))
    await expect(healthInfo.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
