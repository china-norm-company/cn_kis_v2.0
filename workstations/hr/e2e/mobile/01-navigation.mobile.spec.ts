import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-hr-mobile'
const USER = { id: 4, name: '人事-测试', role: 'hr_manager' }

async function setupMobileMocks(page: Page) {
  const profileData = { account: USER, permissions: ['hr.staff.read'] }
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user, permissions: ['hr.staff.read'] } }))
  }, { token: AUTH_TOKEN, user: USER })

  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: profileData } })
  })
}

test.describe('人事台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可打开移动导航并切换到资质总览', async ({ page }) => {
    await page.goto('/hr/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()
    await page.getByRole('button', { name: '打开导航菜单' }).click()

    const qualificationLink = page.getByRole('link', { name: '资质总览' }).last()
    await expect(qualificationLink).toBeVisible()
    await qualificationLink.click()
    await expect(page).toHaveURL(/(\/hr\/qualifications|#\/qualifications)/)
  })
})
