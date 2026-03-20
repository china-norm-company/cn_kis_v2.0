/**
 * 场景5：SOP管理与变更控制
 *
 * 业务目标：
 * ✓ SOP列表页显示SOP管理标题和统计卡片
 * ✓ SOP列表显示数据
 * ✓ 新建SOP按钮存在
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 3, name: '质量主管', role: 'qa_manager' }
const AUTH_TOKEN = 'test-token-quality-desktop'

async function setupSopAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['quality.sop.read', 'quality.sop.write'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['quality.sop.read', 'quality.sop.write'] } } })
  })

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/profile')) return
    if (url.includes('/sops')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
        { id: 1, code: 'SOP-QC-001', title: '皮肤TEWL检测操作规程', version: 'V3.0', category: '检测操作', status: 'effective', effective_date: '2026-01-01', next_review: '2027-01-01', owner: '技术部' },
        { id: 2, code: 'SOP-QM-001', title: '偏差管理规程', version: 'V4.0', category: '质量管理', status: 'under_review', effective_date: '2025-06-01', next_review: '2026-06-01', owner: '质量部' },
      ], total: 2 } } })
    } else if (url.includes('/changes')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    } else {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    }
  })
}

test.describe('场景5: SOP管理与变更控制', () => {
  test.beforeEach(async ({ page }) => {
    await setupSopAuth(page)
  })

  test('5.1 SOP列表页显示SOP管理标题', async ({ page }) => {
    await page.goto('/quality/#/sop')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('SOP管理').first()).toBeVisible({ timeout: 10000 })
  })

  test('5.2 SOP列表显示数据行', async ({ page }) => {
    await page.goto('/quality/#/sop')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const sopCode = page.locator('td').filter({ hasText: 'SOP-QC-001' }).first()
    await expect(sopCode).toBeAttached({ timeout: 10000 })
    await sopCode.scrollIntoViewIfNeeded()
    await expect(sopCode).toBeVisible()
    await expect(page.getByText('皮肤TEWL检测操作规程').first()).toBeAttached()
  })

  test('5.3 新建SOP按钮存在', async ({ page }) => {
    await page.goto('/quality/#/sop')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Button text is "新建 SOP" (with space)
    const createBtn = page.getByRole('button', { name: /新建.*SOP/ })
    await expect(createBtn).toBeVisible({ timeout: 10000 })
  })
})
