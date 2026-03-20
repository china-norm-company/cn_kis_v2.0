import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-hr-mobile'
const USER = { id: 4, name: '人事-测试', role: 'hr_manager' }

async function setupMobileMocks(page: Page) {
  const profileData = { account: USER, permissions: ['hr.staff.read', 'hr.staff.manage', 'hr.training.manage'] }
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user, permissions: ['hr.staff.read', 'hr.staff.manage', 'hr.training.manage'] } }))
  }, { token: AUTH_TOKEN, user: USER })

  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: profileData } })
  })
}

test.describe('人事台飞书容器核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupMobileMocks(page)
  })

  test('可进入资质总览并完成一次新增流程', async ({ page }) => {
    await page.goto('/hr/dashboard')
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const qualificationLink = page.getByRole('link', { name: '资质总览' }).last()
    await qualificationLink.click()
    await expect(page).toHaveURL(/(\/hr\/qualifications|#\/qualifications)/)

    const createButton = page.getByRole('button', { name: '新增人员' }).first()
    await expect(createButton).toBeVisible()
    await createButton.click()
    await expect(page.getByRole('heading', { name: '新增人员' })).toBeVisible()
  })
})
