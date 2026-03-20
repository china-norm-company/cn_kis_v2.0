import { test, expect } from '@playwright/test'

const ENTRY_URL = '/reception/'

test.describe('飞书认证与数据流基础校验', () => {
  test('A1 未登录时显示登录兜底页', async ({ page }) => {
    await page.goto(ENTRY_URL)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('和序·接待台')).toBeVisible()
    await expect(page.getByRole('button', { name: '飞书登录' })).toBeVisible()
  })

  test('A2 已登录后触发 profile 与接待数据请求', async ({ page }) => {
    const seen = {
      profile: false,
      stats: false,
      queue: false,
      alerts: false,
    }

    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'token-auth-flow')
      localStorage.setItem('auth_user', JSON.stringify({ id: 1, name: '接待员-认证链路' }))
      localStorage.setItem('auth_profile', JSON.stringify({
        code: 200,
        msg: 'ok',
        data: {
          account: {
            id: 1,
            username: 'reception_user',
            display_name: '接待员-认证链路',
            roles: [{ name: 'receptionist' }],
            permissions: ['subject.subject.read'],
            visible_workbenches: ['reception'],
            visible_menu_items: { reception: ['dashboard'] },
          },
        },
      }))
    })

    await page.route('**/api/v1/auth/profile**', async (route) => {
      seen.profile = true
      await route.fulfill({
        json: {
          code: 200,
          msg: 'ok',
          data: {
            account: {
              id: 1,
              username: 'reception_user',
              display_name: '接待员-认证链路',
              roles: [{ name: 'receptionist' }],
              permissions: ['subject.subject.read'],
              visible_workbenches: ['reception'],
              visible_menu_items: { reception: ['dashboard'] },
            },
          },
        },
      })
    })
    await page.route('**/api/v1/reception/today-stats**', async (route) => {
      seen.stats = true
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { date: '2026-02-21', total_appointments: 1, checked_in: 0, in_progress: 0, checked_out: 0, no_show: 0, total_signed_in: 0 } },
      })
    })
    await page.route('**/api/v1/reception/today-queue**', async (route) => {
      seen.queue = true
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [], date: '2026-02-21' } } })
    })
    await page.route('**/api/v1/reception/pending-alerts**', async (route) => {
      seen.alerts = true
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [], total: 0 } } })
    })

    await page.goto('/reception/#/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '前台接待' })).toBeVisible()
    expect(seen.profile).toBeTruthy()
    expect(seen.stats).toBeTruthy()
    expect(seen.queue).toBeTruthy()
    expect(seen.alerts).toBeTruthy()
  })
})
