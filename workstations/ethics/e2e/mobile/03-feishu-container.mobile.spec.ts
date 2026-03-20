import { test, expect, type Page } from '@playwright/test'

async function setupContainerMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'container-token-ethics')
    localStorage.setItem('auth_user', JSON.stringify({ id: 6, name: '伦理-容器验证' }))
  })
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
}

test.describe('伦理台飞书容器差异验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupContainerMocks(page)
  })

  test('刷新后可保持鉴权态并留在工作台内', async ({ page }) => {
    await page.goto('/ethics/dashboard')
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible()

    await page.reload()
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/\/ethics\//)
  })
})
