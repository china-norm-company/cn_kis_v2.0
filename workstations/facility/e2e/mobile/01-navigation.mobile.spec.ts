import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('设施台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可打开移动导航并切换到场地预约', async ({ page }) => {
    await page.goto('/facility/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const reservationLink = page.getByRole('link', { name: '场地预约' }).last()
    await expect(reservationLink).toBeVisible()
    await reservationLink.click()

    await expect(page).toHaveURL(/(\/facility\/reservations|#\/reservations)/)
  })
})
