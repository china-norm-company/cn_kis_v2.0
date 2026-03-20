import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('招募台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可打开移动导航并切换到计划管理', async ({ page }) => {
    await page.goto('/recruitment/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const planLink = page.getByRole('link', { name: '计划管理' }).last()
    await expect(planLink).toBeVisible()
    await planLink.click()

    await expect(page).toHaveURL(/(\/recruitment\/plans|#\/plans)/)
  })
})
