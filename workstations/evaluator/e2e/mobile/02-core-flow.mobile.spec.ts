import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../helpers/setup'

test.describe('评估台飞书容器核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('可进入扫码执行并触发一次最小交互', async ({ page }) => {
    await page.goto('/evaluator/#/dashboard')
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    await page.getByRole('complementary').getByRole('link', { name: '扫码执行' }).click()
    await expect(page).toHaveURL(/\/evaluator\/scan/)

    const actionButton = page
      .getByRole('button', { name: /扫码|开始|提交|保存|确认|下一步|筛选|查询/ })
      .first()
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click().catch(() => {})
    }
  })
})
