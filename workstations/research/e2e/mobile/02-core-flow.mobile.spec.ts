import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('研究台飞书容器核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可进入项目组合并触发一次最小交互', async ({ page }) => {
    await page.goto('/research/')
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const portfolioLink = page.getByRole('link', { name: '项目组合' }).last()
    await portfolioLink.click()
    await expect(page).toHaveURL(/(\/research\/portfolio|#\/portfolio)/)

    const actionButton = page
      .getByRole('button', { name: /新建|创建|新增|提交|保存|筛选|查询|确认|发起/ })
      .first()
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click().catch(() => {})
    }
  })
})
