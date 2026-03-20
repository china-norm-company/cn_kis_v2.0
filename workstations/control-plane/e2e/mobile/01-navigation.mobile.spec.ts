import { expect, test } from '@playwright/test'

test.describe('统一平台移动端导航冒烟', () => {
  test('可打开应用并显示移动导航', async ({ page }) => {
    await page.goto('/control-plane/#/dashboard')
    await expect(page.getByText('天工·统一平台').first()).toBeVisible()
  })
})
