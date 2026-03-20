import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-quality-mobile'
const USER = { id: 3, name: '质量-测试', role: 'qa_manager' }

async function setupMobileMocks(page: Page) {
  const profileData = { account: USER, permissions: ['quality.deviation.read'] }
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user, permissions: ['quality.deviation.read'] } }))
  }, { token: AUTH_TOKEN, user: USER })

  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: profileData } })
  })
}

test.describe('质量台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可打开移动导航并切换到偏差管理', async ({ page }) => {
    await page.goto('/quality/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()
    await page.getByRole('button', { name: '打开导航菜单' }).click()

    const deviationLink = page.getByRole('link', { name: '偏差管理' }).last()
    await expect(deviationLink).toBeVisible()
    await deviationLink.click()
    await expect(page).toHaveURL(/(\/quality\/deviations|#\/deviations)/)
  })
})
