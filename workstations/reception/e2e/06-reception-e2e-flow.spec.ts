import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-reception-e2e'
const RECEPTION_DASHBOARD_URL = '/reception/#/dashboard'

const RECEPTIONIST_USER = {
  id: 50,
  name: '前台-E2E测试',
  role: 'receptionist',
  permissions: ['subject.subject.read', 'subject.subject.update'],
}

let checkinDone = false

async function setupE2EMocks(page: Page) {
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user } }))
    },
    { token: AUTH_TOKEN, user: RECEPTIONIST_USER },
  )

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: RECEPTIONIST_USER } } })
  })
  await page.route('**/api/v1/reception/today-queue**', async (route) => {
    const items = [
      {
        appointment_id: 100, subject_id: 200, subject_name: '新受试者-E2E',
        subject_no: 'SUB-202602-0100', appointment_time: '09:00',
        purpose: '初筛', task_type: 'pre_screening',
        status: checkinDone ? 'checked_in' : 'waiting',
        checkin_id: checkinDone ? 50 : null,
        checkin_time: checkinDone ? new Date().toISOString() : null,
        checkout_time: null, enrollment_id: null,
      },
    ]
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { items, date: '2026-02-20' } } })
  })
  await page.route('**/api/v1/reception/today-stats**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          date: '2026-02-20', total_appointments: 1,
          checked_in: checkinDone ? 1 : 0, in_progress: 0, checked_out: 0,
          no_show: 0, total_signed_in: checkinDone ? 1 : 0,
        },
      },
    })
  })
  await page.route('**/api/v1/reception/pending-alerts**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/reception/quick-checkin', async (route) => {
    checkinDone = true
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          id: 50, subject_id: 200,
          subject_name: '新受试者-E2E', subject_no: 'SUB-202602-0100',
          checkin_date: '2026-02-20', checkin_time: new Date().toISOString(),
          checkout_time: null, status: 'checked_in', location: '', notes: '',
        },
      },
    })
  })
  await page.route('**/api/v1/reception/quick-checkout', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          id: 50, subject_id: 200,
          subject_name: '新受试者-E2E', subject_no: 'SUB-202602-0100',
          checkin_date: '2026-02-20', checkin_time: '2026-02-20T09:00:00',
          checkout_time: new Date().toISOString(), status: 'checked_out',
          location: '', notes: '', warnings: [],
        },
      },
    })
  })
}

test.describe('场景 R6: 前台完整闭环', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    checkinDone = false
    await setupE2EMocks(page)
  })

  test.afterAll(async () => {
    await page?.context().close()
  })

  test('R6.1 可看到新受试者并完成签到链路', async () => {
    await page.goto(RECEPTION_DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('新受试者-E2E')).toBeVisible()
    const checkinReq = page.waitForRequest('**/api/v1/reception/quick-checkin')
    await page.locator('[data-action="checkin"]').first().click()
    await expect(checkinReq).resolves.toBeTruthy()
    await expect(page.locator('[data-action="checkout"]')).toBeVisible()
  })

  test('R6.2 分流跳转与独立工作台标识正确', async () => {
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: '发起初筛' }).click()
    const popup = await popupPromise
    await expect(popup).toHaveURL(/\/recruitment\/#\/prescreening/)
    await popup.close()

    await expect(page.getByText('和序·接待台')).toBeVisible()
    await expect(page.getByRole('link', { name: '接待看板' })).toBeVisible()
    await expect(page.getByRole('link', { name: '大屏投影' })).toBeVisible()
  })

  test('R6.3 可完成签出闭环', async () => {
    const checkoutReq = page.waitForRequest('**/api/v1/reception/quick-checkout')
    await page.locator('[data-action="checkout"]').first().click()
    await expect(checkoutReq).resolves.toBeTruthy()
  })
})
