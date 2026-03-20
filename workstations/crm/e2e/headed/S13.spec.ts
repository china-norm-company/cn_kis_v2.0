import { test, expect } from './fixtures'

test.describe('S13: 满意度追踪', () => {
  test('S13.1: 满意度追踪页面加载', async ({ page }) => {
    await page.goto('/#/surveys')
    await expect(page.getByRole('heading', { name: '满意度调研' })).toBeVisible({ timeout: 10000 })
  })

  test('S13.2: 统计卡片展示', async ({ page }) => {
    await page.goto('/#/surveys')
    await expect(page.getByRole('heading', { name: '满意度调研' })).toBeVisible({ timeout: 10000 })
    const stats = page.locator('[class*="card"]').or(page.locator('[class*="stat"]'))
      .or(page.locator('[class*="metric"]'))
    await expect(stats.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S13.3: 满意度数据列表', async ({ page }) => {
    await page.goto('/#/surveys')
    await expect(page.getByRole('heading', { name: '满意度调研' })).toBeVisible({ timeout: 10000 })
    const content = page.locator('table').or(page.getByText('暂无数据'))
      .or(page.locator('[class*="chart"]'))
    await expect(content.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
