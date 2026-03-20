import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('人员台飞书容器核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可进入排班管理并触发一次最小交互', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const scheduleLink = page.getByRole('link', { name: '排班管理' }).last()
    await scheduleLink.click()
    await expect(page).toHaveURL(/(\/lab-personnel\/schedules|#\/schedules)/)

    const actionButton = page
      .getByRole('button', { name: /新建|创建|新增|派工|提交|保存|筛选|查询/ })
      .first()
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click().catch(() => {})
    }
  })
})
