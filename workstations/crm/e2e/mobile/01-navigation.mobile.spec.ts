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

test.describe('客户台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可打开移动导航并切换到客户组合', async ({ page }) => {
    await page.goto('/crm/dashboard')
    const menuButton = page.getByRole('button', { name: '打开导航菜单' }).first()
    await expect(menuButton).toBeVisible()
    await page.goto('/crm/clients')
    await expect(page).toHaveURL(/(\/crm\/clients|#\/clients)/)
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(horizontalOverflow).toBeFalsy()
  })
})
