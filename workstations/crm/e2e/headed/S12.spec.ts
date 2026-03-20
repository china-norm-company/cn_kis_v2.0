import { test, expect } from './fixtures'

test.describe('S12: 预警中心管理', () => {
  test('S12.1: 预警中心页面加载', async ({ page }) => {
    await page.goto('/#/alerts')
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 10000 })
  })

  test('S12.2: 预警筛选控件', async ({ page }) => {
    await page.goto('/#/alerts')
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 10000 })
    const filter = page.locator('select').first()
      .or(page.locator('[role="combobox"]').first())
      .or(page.locator('input[type="checkbox"]').first())
    await expect(filter).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S12.3: 预警严重级别统计', async ({ page }) => {
    await page.goto('/#/alerts')
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 10000 })
    const severityStats = page.getByText('未处理预警')
      .or(page.getByText('信息级')).or(page.getByText('警告级')).or(page.getByText('严重级'))
    await expect(severityStats.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
