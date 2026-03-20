/**
 * 伦理台桌面 E2E — 02 伦理申请管理
 *
 * 覆盖路由：/ethics/applications, /ethics/applications/create, /ethics/applications/:id
 * API：/ethics/applications (GET/POST)
 *
 * 验收标准：
 * ✓ 伦理申请列表页标题"伦理申请"可见
 * ✓ 申请记录在 DOM 中附加
 * ✓ 新建申请按钮/链接可见
 * ✓ 新建申请页标题"新建伦理申请"可见
 * ✓ 申请详情页可访问（无404）
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

  await page.route('**/api/v1/ethics/applications**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
        { id: 1, application_no: 'ETH-2026-001', protocol_title: '化妆品A皮肤刺激性临床研究方案', application_type: 'initial', status: 'reviewing', submitted_at: '2026-01-15' },
        { id: 2, application_no: 'ETH-2026-002', protocol_title: '保湿产品功效评价临床试验方案', application_type: 'amendment', status: 'approved', submitted_at: '2025-12-01' },
      ], total: 2 } } })
    } else {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { id: 3, application_no: 'ETH-2026-003' } } })
    }
  })

  await page.route('**/api/v1/ethics/applications/1**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { id: 1, application_no: 'ETH-2026-001', project_title: '化妆品A皮肤刺激性临床研究', status: 'reviewing' } } })
  })
}

test.describe('场景2: 伦理申请管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupEthicsAuth(page)
  })

  test('2.1 伦理申请列表页显示标题', async ({ page }) => {
    await page.goto('/ethics/applications')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('伦理申请').first()).toBeVisible({ timeout: 10000 })
  })

  test('2.2 申请列表显示 mock 数据', async ({ page }) => {
    await page.goto('/ethics/applications')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('ETH-2026-001').first()).toBeAttached({ timeout: 10000 })
    await expect(page.getByText('化妆品A皮肤刺激性临床研究方案').first()).toBeAttached()
  })

  test('2.3 新建申请按钮/链接可见', async ({ page }) => {
    await page.goto('/ethics/applications')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('新建申请').first()).toBeVisible({ timeout: 10000 })
  })

  test('2.4 新建申请页显示表单标题', async ({ page }) => {
    await page.goto('/ethics/applications/create')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('新建伦理申请').first()).toBeVisible({ timeout: 10000 })
  })

  test('2.5 申请详情页可访问', async ({ page }) => {
    await page.goto('/ethics/applications/1')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('404', { timeout: 10000 })
    await expect(page.locator('body')).not.toContainText('页面不存在')
  })
})
