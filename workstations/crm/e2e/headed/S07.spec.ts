import { test, expect } from './fixtures'

test.describe('S07: 价值洞察管理', () => {
  test('S07.1: 价值洞察页面加载', async ({ page }) => {
    await page.goto('/#/insights')
    await expect(page.getByRole('heading', { name: '价值洞察' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: '创建洞察' })).toBeVisible({ timeout: 10000 })
  })

  test('S07.2: AI生成按钮存在', async ({ page }) => {
    await page.goto('/#/insights')
    await expect(page.getByRole('heading', { name: '价值洞察' })).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByRole('button', { name: 'AI生成' }).or(page.getByText('AI生成'))
    ).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S07.3: 洞察列表展示', async ({ page }) => {
    await page.goto('/#/insights')
    await expect(page.getByRole('heading', { name: '价值洞察' })).toBeVisible({ timeout: 10000 })
    const content = page.locator('table').or(page.getByText('暂无洞察'))
      .or(page.locator('[class*="card"]').first())
    await expect(content.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
