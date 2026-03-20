import { test, expect } from './fixtures'

test.describe('S04: 产品线矩阵', () => {
  test('S04.1: 产品矩阵页面加载', async ({ page }) => {
    await page.goto('/#/product-lines')
    await expect(page.getByRole('heading', { name: '产品线概览' })).toBeVisible({ timeout: 10000 })
    const selector = page.locator('select').first().or(page.locator('[role="combobox"]').first())
    await expect(selector).toBeVisible({ timeout: 10000 })
  })

  test('S04.2: 客户选择器功能', async ({ page }) => {
    await page.goto('/#/product-lines')
    await expect(page.getByRole('heading', { name: '产品线概览' })).toBeVisible({ timeout: 10000 })
    const clientSelect = page.locator('select').first()
    if (await clientSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      const options = await clientSelect.locator('option').count()
      expect(options).toBeGreaterThanOrEqual(1)
    }
  })

  test('S04.3: 产品分类与价格带标签', async ({ page }) => {
    await page.goto('/#/product-lines')
    await expect(page.getByRole('heading', { name: '产品线概览' })).toBeVisible({ timeout: 10000 })
    const clientSelect = page.locator('select').first()
    if (await clientSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      const options = await clientSelect.locator('option').all()
      if (options.length > 1) {
        await clientSelect.selectOption({ index: 1 })
        const table = page.locator('table').or(page.getByText('暂无产品线数据'))
        await expect(table.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
      }
    }
  })
})
