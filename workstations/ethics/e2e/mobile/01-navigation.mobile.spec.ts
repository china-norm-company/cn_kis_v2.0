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

test.describe('伦理台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可打开移动导航并切换到伦理申请', async ({ page }) => {
    await page.goto('/ethics/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()
    await page.getByRole('button', { name: '打开导航菜单' }).click()

    const applicationLink = page.getByRole('link', { name: '伦理申请' }).last()
    await expect(applicationLink).toBeVisible()
    await applicationLink.click()
    await expect(page).toHaveURL(/(\/ethics\/applications|#\/applications)/)
  })
})
