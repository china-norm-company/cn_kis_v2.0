import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('研究台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可打开移动导航并切换到项目组合', async ({ page }) => {
    await page.goto('/research/')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const portfolioLink = page.getByRole('link', { name: '项目组合' }).last()
    await expect(portfolioLink).toBeVisible()
    await portfolioLink.click()

    await expect(page).toHaveURL(/(\/research\/portfolio|#\/portfolio)/)
  })
})
