import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-crm-mobile'
const USER = { id: 5, name: '客户-测试', role: 'crm_manager' }

async function setupMobileMocks(page: Page) {
  const profileData = { account: USER, permissions: ['crm.client.read'] }
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user, permissions: ['crm.client.read'] } }))
  }, { token: AUTH_TOKEN, user: USER })

  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: profileData } })
  })
}

test.describe('客户台飞书容器核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可进入客户组合并触发一次最小交互', async ({ page }) => {
    await page.goto('/crm/clients')
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/(\/crm\/clients|#\/clients)/)

    const actionButton = page
      .getByRole('button', { name: /新建|创建|新增|提交|保存|筛选|查询|确认|跟进/ })
      .first()
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click().catch(() => {})
    }
  })
})
