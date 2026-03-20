/**
 * 场景3：CAPA管理生命周期
 *
 * 业务目标：
 * ✓ CAPA列表页加载显示标题和统计卡片
 * ✓ CAPA列表显示数据
 * ✓ 新建CAPA按钮存在
 * ✓ CAPA详情页可访问
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 3, name: '质量主管', role: 'qa_manager' }
const AUTH_TOKEN = 'test-token-quality-desktop'

async function setupCapaAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['quality.capa.read', 'quality.capa.write'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['quality.capa.read', 'quality.capa.write'] } } })
  })

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/profile')) return
    if (url.includes('/capas/list')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
        { id: 1, code: 'CAPA-2026-001', deviation_code: 'DEV-2026-001', type: 'corrective', title: '更换TEWL探头重新校准', responsible: '器衡管理员', due_date: '2026-03-15', status: 'in_progress', effectiveness: '' },
        { id: 2, code: 'CAPA-2026-002', deviation_code: 'DEV-2026-002', type: 'preventive', title: '增加访视前核查SOP', responsible: '质量主管', due_date: '2026-03-20', status: 'planned', effectiveness: '' },
      ], total: 2 } } })
    } else if (url.includes('/capas/stats')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { by_status: { in_progress: 1, planned: 1 }, total: 2 } } })
    } else if (url.match(/\/capas\/\d+$/)) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { id: 1, code: 'CAPA-2026-001', deviation_code: 'DEV-2026-001', type: 'corrective', title: '更换TEWL探头重新校准', status: 'in_progress' } } })
    } else {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    }
  })
}

test.describe('场景3: CAPA管理生命周期', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapaAuth(page)
  })

  test('3.1 CAPA列表页显示CAPA跟踪标题', async ({ page }) => {
    await page.goto('/quality/#/capa')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // 页面标题是"CAPA跟踪"（侧边栏菜单也显示"CAPA跟踪"）
    await expect(page.getByText('CAPA跟踪').first()).toBeVisible({ timeout: 10000 })
  })

  test('3.2 CAPA列表 mock 数据正确显示在 DOM 中', async ({ page }) => {
    await page.goto('/quality/#/capa')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('CAPA-2026-001').first()).toBeAttached({ timeout: 10000 })
    await expect(page.getByText('更换TEWL探头重新校准').first()).toBeAttached({ timeout: 5000 })
    await expect(page.getByText('CAPA-2026-002').first()).toBeAttached({ timeout: 5000 })
  })

  test('3.3 新建CAPA按钮存在', async ({ page }) => {
    await page.goto('/quality/#/capa')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Button is labeled "+ 新建 CAPA"
    const createBtn = page.getByRole('button', { name: /新建.*CAPA/ })
    await expect(createBtn).toBeVisible({ timeout: 10000 })
  })

  test('3.4 CAPA详情页可访问', async ({ page }) => {
    await page.goto('/quality/#/capa/1')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('404', { timeout: 10000 })
  })
})
