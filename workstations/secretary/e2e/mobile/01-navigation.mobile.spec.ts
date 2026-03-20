import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-secretary-mobile'
const USER = { id: 1, name: '秘书-测试', role: 'manager' }

async function setupMobileMocks(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user, roles: [{ level: 1, display_name: '管理员' }] } }))
  }, { token: AUTH_TOKEN, user: USER })

  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: USER, roles: [{ level: 1, display_name: '管理员' }] } } })
  })
}

test.describe('秘书台移动端导航冒烟', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可打开移动导航并切换到统一待办', async ({ page }) => {
    await page.goto('/secretary/portal')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()
    await expect(page.getByRole('link', { name: '工作台门户' })).toBeVisible()
    await page.getByRole('button', { name: '打开导航菜单' }).click()

    const todoLink = page.getByRole('link', { name: '统一待办' }).last()
    await expect(todoLink).toBeVisible()
    await todoLink.click()
    await expect(page).toHaveURL(/(\/secretary\/todo|#\/todo)/)
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(horizontalOverflow).toBeFalsy()
  })
})
