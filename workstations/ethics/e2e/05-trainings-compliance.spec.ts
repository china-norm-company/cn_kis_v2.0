/**
 * 伦理台桌面 E2E — 05 合规培训与合规检查
 *
 * 覆盖路由：/ethics/trainings, /ethics/compliance
 * API：/ethics/trainings (GET), /ethics/compliance-checks (GET)
 *
 * 验收标准：
 * ✓ 合规培训列表页标题"合规培训"可见
 * ✓ 培训记录在 DOM 中附加
 * ✓ 合规检查页标题"合规检查"可见
 * ✓ 检查记录在 DOM 中附加
 * ✓ 各页面无异常错误
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

  await page.route('**/api/v1/ethics/trainings**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, title: '伦理审查规范培训2026', organizer: '伦理委员会秘书处', training_date: '2026-02-20', duration_hours: 4, status: 'completed', participant_count: 15 },
      { id: 2, title: 'GCP临床研究伦理培训', organizer: '外部讲师', training_date: '2026-04-10', duration_hours: 6, status: 'planned', participant_count: 0 },
    ], total: 2 } } })
  })

  await page.route('**/api/v1/ethics/compliance-checks**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, check_no: 'CC-2026-001', project_title: '化妆品A皮肤刺激性临床研究', check_type: 'annual', check_date: '2026-01-20', status: 'completed', checker_name: '刘合规员' },
    ], total: 1 } } })
  })
}

test.describe('场景5: 合规培训与合规检查', () => {
  test.beforeEach(async ({ page }) => {
    await setupEthicsAuth(page)
  })

  test('5.1 合规培训列表页显示标题', async ({ page }) => {
    await page.goto('/ethics/trainings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('合规培训').first()).toBeVisible({ timeout: 10000 })
  })

  test('5.2 培训列表显示 mock 数据', async ({ page }) => {
    await page.goto('/ethics/trainings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('伦理审查规范培训2026').first()).toBeAttached({ timeout: 10000 })
    await expect(page.getByText('GCP临床研究伦理培训').first()).toBeAttached()
  })

  test('5.3 合规检查列表页显示标题', async ({ page }) => {
    await page.goto('/ethics/compliance')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('合规检查').first()).toBeVisible({ timeout: 10000 })
  })

  test('5.4 合规检查列表显示 mock 数据', async ({ page }) => {
    await page.goto('/ethics/compliance')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('CC-2026-001').first()).toBeAttached({ timeout: 10000 })
  })

  test('5.5 合规检查页面无异常错误', async ({ page }) => {
    await page.goto('/ethics/compliance')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('页面出现异常', { timeout: 10000 })
    await expect(page.locator('body')).not.toContainText('Objects are not valid')
  })
})
