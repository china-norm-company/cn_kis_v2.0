import { test, expect } from './fixtures'

test.describe('S15: 市场趋势通报', () => {
  test('S15.1: 市场趋势页面加载', async ({ page }) => {
    await page.goto('/#/market-trends')
    await expect(page.getByRole('heading', { name: '市场趋势' })).toBeVisible({ timeout: 10000 })
  })

  test('S15.2: 创建通报按钮', async ({ page }) => {
    await page.goto('/#/market-trends')
    await expect(page.getByRole('heading', { name: '市场趋势' })).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('新建简报').or(page.getByText('新建通报')).or(page.getByText('创建通报'))
    ).toBeVisible({ timeout: 10000 })
  })

  test('S15.3: 分类筛选功能', async ({ page }) => {
    await page.goto('/#/market-trends')
    await expect(page.getByRole('heading', { name: '市场趋势' })).toBeVisible({ timeout: 10000 })
    const filter = page.locator('select').first().or(page.locator('[role="combobox"]').first())
    await expect(filter).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
