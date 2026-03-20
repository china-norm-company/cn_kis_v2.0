import { test, expect } from '@playwright/test'
import { setupForRole } from '../helpers/setup'

test.describe('执行台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc')
  })

  test('可打开移动导航并切换到扫码页', async ({ page }) => {
    await page.goto('/execution/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()
    await expect(page.getByRole('link', { name: '仪表盘' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    await expect(page.getByRole('complementary').getByRole('link', { name: '受试者' })).toBeVisible()

    await page.getByRole('complementary').getByRole('link', { name: '排程管理' }).click()
    await expect(page).toHaveURL(/#\/scheduling/)
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(horizontalOverflow).toBeFalsy()
  })
})
