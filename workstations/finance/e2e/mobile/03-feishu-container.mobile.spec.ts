import { test, expect, type Page } from '@playwright/test'

async function setupContainerMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'container-token-finance')
    localStorage.setItem('auth_user', JSON.stringify({ id: 2, name: '财务-容器验证' }))
  })
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
}

test.describe('财务台飞书容器差异验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupContainerMocks(page)
  })

  test('刷新后可保持鉴权态并留在工作台内', async ({ page }) => {
    await page.goto('/finance/quotes')
    await expect(page).toHaveURL(/\/finance\//)

    await page.reload()
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/\/finance\//)
  })
})
