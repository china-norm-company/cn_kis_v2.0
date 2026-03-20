/**
 * P0 四工作台深度触点 — 质量台
 * 1. 进入中书：仪表盘展示「进入中书·数字员工中心」入口并指向 digital-workforce
 * 2. 本台数字员工深度触点：质量台数字员工摘要卡（偏差/CAPA 建议）可见
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 3, name: '质量主管', role: 'qa_manager' }
const AUTH_TOKEN = 'test-token-quality-dw-touchpoint'

async function setupQualityAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['quality.deviation.read', 'quality.capa.read'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['quality.deviation.read'] } },
    })
  })
}

const REPLAY_RUN = {
  task_id: 'ORCH-DW-QUALITY-001',
  role_code: 'quality_reviewer',
  workstation_key: 'quality',
  status: 'success',
  query: '偏差与 CAPA 建议',
  created_at: new Date().toISOString(),
}

async function mockDigitalWorkforce(page: Page) {
  await page.route(/digital-workforce\/replay-runs/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: [REPLAY_RUN], total: 1 } },
    })
  })
}

test.describe('质量台·中书触点', () => {
  test.beforeEach(async ({ page }) => {
    await setupQualityAuth(page)
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/auth/profile') || url.includes('digital-workforce')) return route.fallback()
      await route.fulfill({
        json: { code: 200, msg: 'ok', data: { items: [], total: 0, stats: { open_deviations: 0, overdue_capas: 0, sops_due_review: 0, weekly_queries: 0 }, todos: [], recent_events: [] } },
      })
    })
    await mockDigitalWorkforce(page)
  })

  test('进入中书：仪表盘展示「进入中书·数字员工中心」入口且指向 digital-workforce', async ({ page }) => {
    await page.goto('/quality/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('质量管理概览')).toBeVisible({ timeout: 15000 })
    const link = page.getByRole('link', { name: '进入中书·数字员工中心' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /digital-workforce.*portal/)
  })

  test('本台数字员工深度触点：质量台有偏差与 CAPA（门禁回放）入口或摘要卡', async ({ page }) => {
    await page.goto('/quality/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('质量管理概览')).toBeVisible({ timeout: 15000 })
    const card = page.getByTestId('quality-digital-workforce-card')
    const link = page.getByRole('link', { name: /偏差与 CAPA（门禁回放）/ })
    await expect(card.or(link)).toBeVisible({ timeout: 15000 })
  })
})
