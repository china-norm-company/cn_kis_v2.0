import { expect, test, type Page } from '@playwright/test'

async function mockGateApis(page: Page) {
  await page.route('**/api/v1/my/identity/status', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'OK',
        data: {
          auth_level: 'phone_verified',
          identity_verified_at: null,
          identity_verify_status: 'pending',
          phone_masked: '138****1234',
          id_card_masked: null,
          trace_id: 'ci-smoke',
        },
      },
    })
  })
  await page.route('**/api/v1/my/payments', async (route) => {
    await route.fulfill({
      status: 403,
      json: {
        code: 403,
        msg: '请先完成实名认证后再查看礼金',
        data: null,
        error_code: '403_IDENTITY_REQUIRED',
      },
    })
  })
  await page.route('**/api/v1/my/payment-summary', async (route) => {
    await route.fulfill({
      status: 403,
      json: {
        code: 403,
        msg: '请先完成实名认证后再查看礼金',
        data: null,
        error_code: '403_IDENTITY_REQUIRED',
      },
    })
  })
  await page.route('**/api/v1/my/notifications**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: [], total: 0, unread: 0 } },
    })
  })
  await page.route('**/api/v1/my/available-plans**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: [] } },
    })
  })
  await page.route('**/api/v1/my/queue-position**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { position: 0, wait_minutes: 0, status: 'none' } },
    })
  })
  await page.route('**/api/v1/visit/**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: [] } },
    })
  })
  await page.route('**/api/v1/my/appointments**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: [] } },
    })
  })
}

test.describe('CI smoke gates', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'ci-smoke-token')
      localStorage.setItem('userInfo', JSON.stringify({
        id: '1',
        name: 'CI 验证用户',
        subjectNo: 'SUB-CI-0001',
        enrollDate: '2026-01-01',
        projectName: 'CI项目',
      }))
    })
    await mockGateApis(page)
  })

  test('guest home and projects render', async ({ page }) => {
    await page.goto('/#/pages/index/index')
    await expect(page.getByText('微信快捷登录')).toBeVisible()
    await expect(page.getByText('机构介绍')).toBeVisible()
    await expect(page.getByText('研究类型')).toBeVisible()
  })

  test('payment page shows L2 gate guidance', async ({ page }) => {
    await page.goto('/#/pages/payment/index')
    await expect(page.getByText('我的礼金')).toBeVisible()
    await expect(page.getByText(/请先完成实名认证|暂无礼金记录/)).toBeVisible()
  })

  test('notifications page renders without crash', async ({ page }) => {
    await page.goto('/#/pages/notifications/index')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('消息通知', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('projects list page renders without crash', async ({ page }) => {
    await page.goto('/#/pages/projects/index')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('招募项目', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('visit page renders without crash', async ({ page }) => {
    await page.goto('/#/pages/visit/index')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('时间线', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('appointment page renders without crash', async ({ page }) => {
    await page.goto('/#/pages/appointment/index')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('我的预约', { exact: true })).toBeVisible({ timeout: 10000 })
  })
})

