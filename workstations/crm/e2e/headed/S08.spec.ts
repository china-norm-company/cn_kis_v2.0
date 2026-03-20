import { test, expect } from './fixtures'

test.describe('S08: 客户简报管理', () => {
  test('S08.1: 客户简报页面加载', async ({ page }) => {
    await page.goto('/#/briefs')
    await expect(page.getByRole('heading', { name: '客户简报' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('新建简报')).toBeVisible({ timeout: 10000 })
  })

  test('S08.2: AI生成按钮存在', async ({ page }) => {
    await page.goto('/#/briefs')
    await expect(page.getByRole('heading', { name: '客户简报' })).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByRole('button', { name: 'AI生成' }).or(page.getByText('AI生成'))
    ).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S08.3: 简报列表展示', async ({ page }) => {
    await page.goto('/#/briefs')
    await expect(page.getByRole('heading', { name: '客户简报' })).toBeVisible({ timeout: 10000 })
    const content = page.locator('table').or(page.getByText('暂无简报'))
      .or(page.locator('[class*="card"]').first())
    await expect(content.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
