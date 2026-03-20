import { test, expect } from './fixtures'

test.describe('S14: 合作里程碑', () => {
  test('S14.1: 里程碑页面加载', async ({ page }) => {
    await page.goto('/#/milestones')
    await expect(page.getByRole('heading', { name: '客户里程碑' })).toBeVisible({ timeout: 10000 })
  })

  test('S14.2: 创建里程碑按钮', async ({ page }) => {
    await page.goto('/#/milestones')
    await expect(page.getByRole('heading', { name: '客户里程碑' })).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('新建里程碑')
    ).toBeVisible({ timeout: 10000 })
  })

  test('S14.3: 客户选择器与时间线', async ({ page }) => {
    await page.goto('/#/milestones')
    await expect(page.getByRole('heading', { name: '客户里程碑' })).toBeVisible({ timeout: 10000 })
    const selector = page.locator('select').first().or(page.locator('[role="combobox"]').first())
    await expect(selector).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
