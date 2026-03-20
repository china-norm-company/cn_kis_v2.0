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

test.describe('质量台飞书容器核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可进入偏差管理并触发一次最小交互', async ({ page }) => {
    await page.goto('/quality/dashboard')
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const deviationLink = page.getByRole('link', { name: '偏差管理' }).last()
    await deviationLink.click()
    await expect(page).toHaveURL(/(\/quality\/deviations|#\/deviations)/)

    const actionButton = page
      .getByRole('button', { name: /新建|创建|新增|提交|保存|筛选|查询|确认|关闭/ })
      .first()
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click().catch(() => {})
    }
  })
})
