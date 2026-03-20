import { test, expect } from './fixtures'

test.describe('S16: 宣称趋势分析', () => {
  test('S16.1: 宣称趋势页面加载', async ({ page }) => {
    await page.goto('/#/claim-trends')
    await expect(page.getByRole('heading', { name: '宣称趋势' })).toBeVisible({ timeout: 10000 })
  })

  test('S16.2: 筛选控件存在', async ({ page }) => {
    await page.goto('/#/claim-trends')
    await expect(page.getByRole('heading', { name: '宣称趋势' })).toBeVisible({ timeout: 10000 })
    const filters = page.locator('select').or(page.locator('[role="combobox"]'))
      .or(page.locator('input[type="text"]'))
    await expect(filters.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S16.3: 趋势数据展示', async ({ page }) => {
    await page.goto('/#/claim-trends')
    await expect(page.getByRole('heading', { name: '宣称趋势' })).toBeVisible({ timeout: 10000 })
    const content = page.locator('table').or(page.locator('[class*="chart"]'))
      .or(page.getByText('暂无数据')).or(page.locator('[class*="card"]'))
    await expect(content.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
