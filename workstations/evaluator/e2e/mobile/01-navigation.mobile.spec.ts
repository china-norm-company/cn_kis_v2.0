import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('评估台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可打开移动导航并切换到扫码执行', async ({ page }) => {
    await page.goto('/evaluator/#/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const scanLink = page.getByRole('complementary').getByRole('link', { name: '扫码执行' })
    await expect(scanLink).toBeVisible()

    await scanLink.click()
    await expect(page).toHaveURL(/\/evaluator\/scan/)
  })
})
