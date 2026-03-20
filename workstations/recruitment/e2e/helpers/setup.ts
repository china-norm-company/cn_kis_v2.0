import { type Page, expect } from '@playwright/test'
import {
  RECRUITER_USER,
  AUTH_TOKEN,
  authProfileData,
  authProfileResponse,
  plans,
  registrations,
  myTasks,
  contactRecords,
  subjects,
} from './mock-data'

export async function injectAuth(page: Page) {
  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token: AUTH_TOKEN, user: RECRUITER_USER, profile: authProfileData },
  )
}

/**
 * Navigate to a page and wait for the first meaningful content to render.
 * Uses Playwright's default 'load' wait, then asserts specific text.
 */
export async function navigateTo(page: Page, path: string, waitForText?: string) {
  await page.goto(path)
  if (waitForText) {
    await expect(page.getByText(waitForText).first()).toBeVisible({ timeout: 8000 })
  }
}

/**
 * Playwright routes match in REVERSE registration order (last registered = highest priority).
 * Register catch-alls FIRST, specific handlers LAST.
 */
export async function setupApiMocks(page: Page) {
  // ===== Auth =====
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: authProfileResponse })
  })

  // ===== My tasks =====
  await page.route('**/api/v1/recruitment/my-tasks**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: myTasks } })
  })

  // ===== Plans =====
  await page.route(/\/api\/v1\/recruitment\/plans\/(\d+)\/funnel/, async (route) => {
    await route.fulfill({
      json: {
        code: 0, msg: 'ok',
        data: {
          registered: 35, screened: 28, enrolled: 22, withdrawn: 3,
          conversion_rates: { registered_to_screened: 80.0, screened_to_enrolled: 78.6, overall: 62.9 },
        },
      },
    })
  })

  await page.route(/\/api\/v1\/recruitment\/plans\/(\d+)\/withdrawal-analysis/, async (route) => {
    await route.fulfill({
      json: {
        code: 0, msg: 'ok',
        data: {
          total_withdrawn: 3,
          reasons: [
            { reason: '个人时间冲突', count: 2, percentage: 66.7 },
            { reason: '不良反应', count: 1, percentage: 33.3 },
          ],
        },
      },
    })
  })

  await page.route(/\/api\/v1\/recruitment\/plans\/(\d+)\/trends/, async (route) => {
    const items = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - 6 + i)
      return {
        date: d.toISOString().split('T')[0],
        registered: 2 + Math.floor(Math.random() * 3),
        screened: 1 + Math.floor(Math.random() * 2),
        enrolled: Math.floor(Math.random() * 2),
      }
    })
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { items } },
    })
  })

  await page.route(/\/api\/v1\/recruitment\/plans\/(\d+)\/status/, async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: { code: 0, msg: '状态已更新', data: { success: true, status: body?.status } },
    })
  })

  await page.route(/\/api\/v1\/recruitment\/plans\/(\d+)\/statistics/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: {} } })
  })

  await page.route(/\/api\/v1\/recruitment\/plans\/(\d+)\/criteria/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [] } } })
  })

  await page.route(/\/api\/v1\/recruitment\/plans\/(\d+)\/channels/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [] } } })
  })

  await page.route(/\/api\/v1\/recruitment\/plans\/(\d+)\/ads/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [] } } })
  })

  // Plan detail GET /plans/:id  and DELETE /plans/:id
  await page.route(/\/api\/v1\/recruitment\/plans\/\d+$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { code: 0, msg: '已删除', data: { success: true } } })
      return
    }
    const match = route.request().url().match(/plans\/(\d+)/)
    const planId = match ? Number(match[1]) : 0
    const plan = plans.find((p) => p.id === planId) ?? plans[0]
    await route.fulfill({ json: { code: 0, msg: 'ok', data: plan } })
  })

  // Plans list (GET) & create (POST) — `/recruitment/plans` with optional query params
  await page.route(/\/api\/v1\/recruitment\/plans(\?|$)/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({
        json: {
          code: 0, msg: '创建成功',
          data: {
            id: 99, plan_no: 'RP-2026-099', ...body,
            registered_count: 0, screened_count: 0, enrolled_count: 0,
            completion_rate: 0, status: 'draft',
          },
        },
      })
    } else {
      const url = new URL(route.request().url())
      const status = url.searchParams.get('status')
      const filtered = status ? plans.filter((p) => p.status === status) : plans
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { items: filtered, total: filtered.length } },
      })
    }
  })

  // ===== Registrations =====
  await page.route(/\/api\/v1\/recruitment\/registrations\/(\d+)\/withdraw/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已退出', data: { success: true } } })
  })

  await page.route(/\/api\/v1\/recruitment\/registrations\/(\d+)\/screening/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '筛选已开始', data: { id: 50, screening_no: 'SCR-001' } } })
  })

  await page.route(/\/api\/v1\/recruitment\/registrations\/(\d+)\/enrollment/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '已创建入组记录', data: { id: 10, enrollment_no: 'ENR-001' } } })
  })

  // Contact records — GET (list) & POST (create) on the same URL
  await page.route(/\/api\/v1\/recruitment\/registrations\/(\d+)\/contacts/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({ json: { code: 0, msg: '跟进记录已添加', data: { id: 99, ...body } } })
    } else {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: contactRecords, total: contactRecords.length } } })
    }
  })

  // Registrations list (GET) & create (POST)
  await page.route(/\/api\/v1\/recruitment\/registrations(\?|$)/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({
        json: {
          code: 0, msg: '报名成功',
          data: { id: 200, registration_no: 'REG-2026-0200', ...body, status: 'registered' },
        },
      })
    } else {
      const url = new URL(route.request().url())
      const status = url.searchParams.get('status')
      const filtered = status ? registrations.filter((r) => r.status === status) : registrations
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { items: filtered, total: filtered.length } },
      })
    }
  })

  // ===== Screening =====
  await page.route(/\/api\/v1\/recruitment\/screenings\/(\d+)\/complete/, async (route) => {
    await route.fulfill({ json: { code: 0, msg: '筛选已完成', data: { success: true } } })
  })

  // ===== Channel analytics =====
  await page.route('**/api/v1/recruitment/channel-analytics**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [], total: 0 } } })
  })

  // ===== Subjects =====
  await page.route(/\/api\/v1\/subject/, async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { items: subjects, total: subjects.length } },
    })
  })

  // ===== Protocols =====
  await page.route(/\/api\/v1\/protocol/, async (route) => {
    await route.fulfill({
      json: {
        code: 0, msg: 'ok',
        data: {
          items: [
            { id: 1, protocol_no: 'HYD-2026-001', title: '保湿功效评价' },
            { id: 2, protocol_no: 'ANT-2026-003', title: '抗衰老功效评价' },
          ],
          total: 2,
        },
      },
    })
  })

  // ===== Questionnaire =====
  await page.route(/\/api\/v1\/questionnaire\//, async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { items: [], total: 0, assigned_count: 0, completed_count: 0, pending_count: 0, completion_rate: 0 } },
    })
  })

  // ===== Loyalty =====
  await page.route(/\/api\/v1\/loyalty\//, async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { items: [], total: 0, referrals_made: [], referred_by: [] } },
    })
  })

  // ===== Quality SOPs =====
  await page.route('**/api/v1/quality/sops**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [], total: 0 } } })
  })

  // ===== Execution (checkins, compliance, payments, support-tickets) =====
  await page.route('**/api/v1/execution/**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: { items: [], total: 0 } } })
  })
}
