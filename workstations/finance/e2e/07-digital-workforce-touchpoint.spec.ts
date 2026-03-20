/**
 * P0 四工作台深度触点 — 财务台
 * 1. 进入中书：财务驾驶舱展示「进入中书·数字员工中心」入口并指向 digital-workforce
 * 2. 本台数字员工深度触点：财务台数字员工摘要卡（报价拆解/草稿）可见
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'finance-e2e-dw-touchpoint'
const AUTH_USER = { id: 12, username: 'finance_dw', display_name: '财务-测试', account_type: 'staff' }

async function setupFinanceAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['finance.read', 'finance.quote.read'] },
    }))
    localStorage.setItem('auth_profile_token', token)
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['finance.read'] } },
    })
  })
}

const REPLAY_RUN = {
  task_id: 'ORCH-DW-FINANCE-001',
  role_code: 'solution_designer',
  workstation_key: 'finance',
  status: 'success',
  query: '报价拆解',
  created_at: new Date().toISOString(),
}
const REPLAY_DETAIL = {
  task_id: REPLAY_RUN.task_id,
  structured_artifacts: { quote_inputs: ['报价项1', '报价项2'] },
}

async function mockDigitalWorkforce(page: Page) {
  await page.route(/digital-workforce\/replay-runs/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: [REPLAY_RUN], total: 1 } },
    })
  })
  await page.route(/digital-workforce\/replay\/ORCH-DW-FINANCE-001/, async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: REPLAY_DETAIL } })
  })
}

test.describe('财务台-中书触点', () => {
  test.beforeEach(async ({ page }) => {
    await setupFinanceAuth(page)
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/auth/profile') || url.includes('digital-workforce')) return route.fallback()
      await route.fulfill({
        json: { code: 200, msg: 'ok', data: { kpis: {}, trends: [], todos: [], alerts: [], expiring: [], ar_aging: {} } },
      })
    })
    await mockDigitalWorkforce(page)
  })

  test('进入中书: 财务驾驶舱展示进入中书入口且指向 digital-workforce', async ({ page }) => {
    await page.goto('/finance/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('财务驾驶舱')).toBeVisible({ timeout: 15000 })
    const link = page.getByRole('link', { name: '进入中书·数字员工中心' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /digital-workforce.*portal/)
  })

  test('本台数字员工深度触点: 财务台有报价拆解（回放）入口或摘要卡', async ({ page }) => {
    await page.goto('/finance/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('财务驾驶舱')).toBeVisible({ timeout: 15000 })
    const card = page.getByTestId('finance-digital-workforce-card')
    const link = page.getByRole('link', { name: /报价拆解（回放）/ })
    await expect(card.or(link)).toBeVisible({ timeout: 15000 })
  })
})
