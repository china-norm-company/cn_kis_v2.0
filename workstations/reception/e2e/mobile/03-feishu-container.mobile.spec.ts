import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'container-token-reception'
const USER = { id: 50, name: '前台-容器验证', role: 'receptionist' }

async function setupContainerMocks(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
  }, { token: AUTH_TOKEN, user: USER })
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
}

test.describe('接待台飞书容器差异验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupContainerMocks(page)
  })

  test('刷新后可保持鉴权态并留在工作台内', async ({ page }) => {
    await page.goto('/reception/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.reload()
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/\/reception\//)
  })
})
