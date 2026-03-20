/**
 * 伦理台桌面 E2E — 03 伦理批件与审查意见
 *
 * 覆盖路由：/ethics/approvals, /ethics/review-opinions
 * API：/ethics/approvals (GET), /ethics/approvals/expiring, /ethics/review-opinions (GET)
 *
 * 验收标准：
 * ✓ 伦理批件列表页标题"伦理批件"可见
 * ✓ 批件记录在 DOM 中附加
 * ✓ 审查意见页标题"审查意见"可见
 * ✓ 审查意见记录在 DOM 中附加
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 10, name: '伦理委员', role: 'ethics_officer' }
const AUTH_TOKEN = 'test-token-ethics-desktop'

async function setupEthicsAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['ethics.read', 'ethics.write', 'ethics.manage'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['ethics.read', 'ethics.write', 'ethics.manage'] } } })
  })

  await page.route('**/api/v1/ethics/approvals/expiring**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: [] } })
  })

  await page.route('**/api/v1/ethics/approvals**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, document_no: 'APP-2025-001', application_no: 'ETH-2025-008', approved_at: '2025-08-01', valid_until: '2026-07-31' },
      { id: 2, document_no: 'APP-2025-002', application_no: 'ETH-2025-003', approved_at: '2025-03-15', valid_until: '2026-03-14' },
    ], total: 2 } } })
  })

  await page.route('**/api/v1/ethics/review-opinions**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, opinion_no: 'RO-2025-001', application_id: 1, application_no: 'ETH-2026-001', project_title: '化妆品A皮肤刺激性临床研究', opinion_type: 'approve', issued_date: '2025-09-01', status: 'issued' },
    ], total: 1 } } })
  })
}

test.describe('场景3: 伦理批件与审查意见', () => {
  test.beforeEach(async ({ page }) => {
    await setupEthicsAuth(page)
  })

  test('3.1 伦理批件列表页显示标题', async ({ page }) => {
    await page.goto('/ethics/approvals')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('伦理批件').first()).toBeVisible({ timeout: 10000 })
  })

  test('3.2 批件列表显示 mock 数据', async ({ page }) => {
    await page.goto('/ethics/approvals')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('APP-2025-001').first()).toBeAttached({ timeout: 10000 })
    await expect(page.getByText('APP-2025-002').first()).toBeAttached()
  })

  test('3.3 审查意见页显示标题', async ({ page }) => {
    await page.goto('/ethics/review-opinions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('审查意见').first()).toBeVisible({ timeout: 10000 })
  })

  test('3.4 审查意见列表显示 mock 数据', async ({ page }) => {
    await page.goto('/ethics/review-opinions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('RO-2025-001').first()).toBeAttached({ timeout: 10000 })
  })
})
