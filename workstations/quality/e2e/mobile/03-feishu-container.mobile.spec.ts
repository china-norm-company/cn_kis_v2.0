import { test, expect, type Page } from '@playwright/test'

async function setupContainerMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'container-token-quality')
    localStorage.setItem('auth_user', JSON.stringify({ id: 3, name: '质量-容器验证' }))
  })
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
}

test.describe('质量台飞书容器差异验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupContainerMocks(page)
  })

  test('刷新后可保持鉴权态并留在工作台内', async ({ page }) => {
    await page.goto('/quality/dashboard')
    await expect(page).toHaveURL(/\/quality\//)

    await page.reload()
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/\/quality\//)
  })
})
