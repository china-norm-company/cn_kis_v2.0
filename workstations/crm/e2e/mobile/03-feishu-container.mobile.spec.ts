import { test, expect, type Page } from '@playwright/test'

async function setupContainerMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'container-token-crm')
    localStorage.setItem('auth_user', JSON.stringify({ id: 5, name: '客户-容器验证' }))
  })
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })
}

test.describe('客户台飞书容器差异验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupContainerMocks(page)
  })

  test('刷新后可保持鉴权态并留在工作台内', async ({ page }) => {
    await page.goto('/crm/clients')
    await expect(page).toHaveURL(/\/crm\//)

    await page.reload()
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/\/crm\//)
  })
})
