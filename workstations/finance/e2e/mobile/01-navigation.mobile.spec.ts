import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-finance-mobile'
const USER = { id: 2, name: '财务-测试', role: 'finance_manager' }

async function setupMobileMocks(page: Page) {
  const profileData = { account: USER, permissions: ['finance.quote.read'] }
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user, permissions: ['finance.quote.read'] } }))
  }, { token: AUTH_TOKEN, user: USER })

  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: profileData } })
  })
}

test.describe('财务台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可打开移动导航并切换到报价管理', async ({ page }) => {
    await page.goto('/finance/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()
    await page.getByRole('button', { name: '打开导航菜单' }).click()

    const quoteLink = page.getByRole('link', { name: '报价管理' }).last()
    await expect(quoteLink).toBeVisible()
    await quoteLink.click()
    await expect(page).toHaveURL(/(\/finance\/quotes|#\/quotes)/)
  })
})
