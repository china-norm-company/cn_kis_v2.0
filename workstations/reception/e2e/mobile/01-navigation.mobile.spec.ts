import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-reception-mobile'
const RECEPTIONIST_USER = {
  id: 50,
  name: '前台-测试',
  role: 'receptionist',
  permissions: ['subject.subject.read', 'subject.subject.update'],
}

async function setupReceptionMobileMocks(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user } }))
  }, { token: AUTH_TOKEN, user: RECEPTIONIST_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: RECEPTIONIST_USER } } })
  })
  await page.route('**/api/v1/reception/today-queue**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { date: '2026-02-20', items: [] } } })
  })
  await page.route('**/api/v1/reception/today-stats**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { total_appointments: 0, checked_in: 0, checked_out: 0 } } })
  })
  await page.route('**/api/v1/reception/pending-alerts**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [], total: 0 } } })
  })
}

test.describe('接待台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await setupReceptionMobileMocks(page)
  })

  test('可打开移动导航并切换到大屏投影', async ({ page }) => {
    await page.goto('/reception/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const displayLink = page.getByRole('link', { name: '大屏投影' }).last()
    await expect(displayLink).toBeVisible()
    await displayLink.click()

    await expect(page).toHaveURL(/#\/display/)
  })
})
