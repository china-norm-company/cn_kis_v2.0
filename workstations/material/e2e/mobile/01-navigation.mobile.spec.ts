import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('物料台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可打开移动导航并切换到库存管理', async ({ page }) => {
    await page.goto('/material/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const inventoryLink = page.getByRole('link', { name: '库存管理' }).last()
    await expect(inventoryLink).toBeVisible()
    await inventoryLink.click()

    await expect(page).toHaveURL(/(\/material\/inventory|#\/inventory)/)
  })
})
