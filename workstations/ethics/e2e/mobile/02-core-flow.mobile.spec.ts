import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-ethics-mobile'
const USER = { id: 6, name: '伦理-测试', role: 'ethics_manager' }

async function setupMobileMocks(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user } }))
  }, { token: AUTH_TOKEN, user: USER })

  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: USER } } })
  })
}

test.describe('伦理台飞书容器核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可进入伦理申请并触发一次最小交互', async ({ page }) => {
    await page.goto('/ethics/dashboard')
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const applicationLink = page.getByRole('link', { name: '伦理申请' }).last()
    await applicationLink.click()
    await expect(page).toHaveURL(/(\/ethics\/applications|#\/applications)/)

    const actionButton = page
      .getByRole('button', { name: /新建|创建|新增|提交|保存|筛选|查询|确认|发起/ })
      .first()
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click().catch(() => {})
    }
  })
})
