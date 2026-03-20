import { test, expect } from '@playwright/test'
import { setupForRole } from '../helpers/setup'

test.describe('执行台飞书容器差异验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc')
  })

  test('刷新后可保持鉴权态并留在工作台内', async ({ page }) => {
    await page.goto('/execution/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.reload()
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/\/execution\//)
  })
})
