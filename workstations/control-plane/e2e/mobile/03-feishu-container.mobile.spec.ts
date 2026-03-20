import { expect, test } from '@playwright/test'

test.describe('统一平台飞书容器差异验证', () => {
  test('Hash 路由可正常工作', async ({ page }) => {
    await page.goto('/control-plane/#/network')
    await expect(page).toHaveURL(/control-plane\/#\/network/)
  })
})
