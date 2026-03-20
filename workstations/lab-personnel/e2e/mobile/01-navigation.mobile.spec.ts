import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('人员台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可打开移动导航并切换到排班管理', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const scheduleLink = page.getByRole('link', { name: '排班管理' }).last()
    await expect(scheduleLink).toBeVisible()
    await scheduleLink.click()

    await expect(page).toHaveURL(/(\/lab-personnel\/schedules|#\/schedules)/)
  })
})
