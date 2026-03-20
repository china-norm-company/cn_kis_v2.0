import { expect, test } from '@playwright/test'

test.describe('统一平台移动端核心流程', () => {
  test('可从总控台进入对象中心', async ({ page }) => {
    await page.goto('/control-plane/#/dashboard')
    await page.goto('/control-plane/#/objects')
    await expect(page.getByText('对象中心')).toBeVisible()
  })
})
