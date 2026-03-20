/**
 * 伦理台桌面 E2E — 04 伦理监督与法规跟踪
 *
 * 覆盖路由：/ethics/supervisions, /ethics/regulations
 * API：/ethics/supervisions (GET/POST), /ethics/regulations (GET)
 *
 * 验收标准：
 * ✓ 伦理监督列表页标题"伦理监督"可见
 * ✓ 监督记录在 DOM 中附加
 * ✓ 法规跟踪页标题"法规跟踪"可见
 * ✓ 法规记录在 DOM 中附加
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

  await page.route('**/api/v1/ethics/supervisions**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, supervision_no: 'SUP-2026-001', project_title: '化妆品A皮肤刺激性临床研究', supervision_type: 'routine', planned_date: '2026-03-15', status: 'planned', supervisor_name: '王委员' },
      { id: 2, supervision_no: 'SUP-2025-010', project_title: '防晒产品功效临床研究', supervision_type: 'spot_check', planned_date: '2025-11-20', status: 'completed', supervisor_name: '李委员' },
    ], total: 2 } } })
  })

  await page.route('**/api/v1/ethics/regulations**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, title: '化妆品监督管理条例2021', issuing_authority: '国务院', issue_date: '2021-01-01', effective_date: '2021-01-01', category: 'cosmetics', status: 'effective' },
      { id: 2, title: '化妆品注册备案管理办法', issuing_authority: '国家药监局', issue_date: '2021-05-28', effective_date: '2021-05-28', category: 'cosmetics', status: 'effective' },
    ], total: 2 } } })
  })
}

test.describe('场景4: 伦理监督与法规跟踪', () => {
  test.beforeEach(async ({ page }) => {
    await setupEthicsAuth(page)
  })

  test('4.1 伦理监督列表页显示标题', async ({ page }) => {
    await page.goto('/ethics/supervisions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('伦理监督').first()).toBeVisible({ timeout: 10000 })
  })

  test('4.2 监督列表显示 mock 数据', async ({ page }) => {
    await page.goto('/ethics/supervisions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('SUP-2026-001').first()).toBeAttached({ timeout: 10000 })
    await expect(page.getByText('SUP-2025-010').first()).toBeAttached()
  })

  test('4.3 法规跟踪列表页显示标题', async ({ page }) => {
    await page.goto('/ethics/regulations')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('法规跟踪').first()).toBeVisible({ timeout: 10000 })
  })

  test('4.4 法规列表显示 mock 数据', async ({ page }) => {
    await page.goto('/ethics/regulations')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('化妆品监督管理条例2021').first()).toBeAttached({ timeout: 10000 })
    await expect(page.getByText('化妆品注册备案管理办法').first()).toBeAttached()
  })
})
