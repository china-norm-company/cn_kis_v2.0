/**
 * 场景2：偏差管理
 *
 * 业务目标：
 * ✓ 偏差列表页面加载显示标题和统计卡片
 * ✓ 偏差列表 mock 数据正确显示
 * ✓ 新建偏差按钮存在
 * ✓ 偏差详情页可访问
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 3, name: '质量主管', role: 'qa_manager' }
const AUTH_TOKEN = 'test-token-quality-desktop'

async function setupQualityAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['quality.deviation.read', 'quality.deviation.write'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['quality.deviation.read', 'quality.deviation.write'] } } })
  })

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/profile')) return
    if (url.includes('/deviations/list')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
        { id: 1, code: 'DEV-2026-001', title: 'TEWL仪器读数异常', category: '设备偏差', severity: 'critical', status: 'investigating', reporter: '张评估员', reported_at: '2026-03-01', project: 'HYD-2026-001' },
        { id: 2, code: 'DEV-2026-002', title: '受试者未空腹偏差', category: '操作偏差', severity: 'major', status: 'capa_pending', reporter: '李研究员', reported_at: '2026-03-02', project: 'HYD-2026-001' },
      ], total: 2 } } })
    } else if (url.includes('/deviations/stats')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { by_status: { investigating: 2, capa_pending: 1 }, total: 3 } } })
    } else if (url.includes('/deviations/')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { id: 1, code: 'DEV-2026-001', title: 'TEWL仪器读数异常', category: '设备偏差', severity: 'critical', status: 'investigating' } } })
    } else {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    }
  })
}

test.describe('场景2: 偏差管理生命周期', () => {
  test.beforeEach(async ({ page }) => {
    await setupQualityAuth(page)
  })

  test('2.1 偏差列表页显示偏差管理标题和统计卡片', async ({ page }) => {
    await page.goto('/quality/#/deviations')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('偏差管理').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('开放中').first()).toBeVisible()
    await expect(page.getByText('CAPA 处理中').first()).toBeVisible()
  })

  test('2.2 偏差列表 mock 数据正确显示在 DOM 中', async ({ page }) => {
    await page.goto('/quality/#/deviations')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Verify mock data is rendered in DOM (table cells may be in scroll container)
    await expect(page.getByText('DEV-2026-001').first()).toBeAttached({ timeout: 10000 })
    await expect(page.getByText('TEWL仪器读数异常').first()).toBeAttached({ timeout: 5000 })
    await expect(page.getByText('DEV-2026-002').first()).toBeAttached({ timeout: 5000 })
  })

  test('2.3 新建偏差按钮存在', async ({ page }) => {
    await page.goto('/quality/#/deviations')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const createBtn = page.getByRole('button', { name: /新建偏差/ })
    await expect(createBtn).toBeVisible({ timeout: 10000 })
  })

  test('2.4 偏差详情页可访问', async ({ page }) => {
    await page.goto('/quality/#/deviations/1')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('404', { timeout: 10000 })
  })
})
