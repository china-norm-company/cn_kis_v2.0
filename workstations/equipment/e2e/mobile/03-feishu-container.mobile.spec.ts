import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('设备台飞书容器差异验证', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('刷新后可保持鉴权态并留在工作台内', async ({ page }) => {
    await page.goto('/equipment/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.reload()
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/\/equipment\//)
  })
})
