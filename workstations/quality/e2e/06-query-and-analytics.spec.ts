/**
 * 场景6：数据质疑与质量分析
 *
 * 业务目标：
 * ✓ 数据质疑列表页显示标题（数据质疑）和表头
 * ✓ 质量分析页面显示质量分析标题
 * ✓ 项目质量报告页面可访问
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 3, name: '质量主管', role: 'qa_manager' }
const AUTH_TOKEN = 'test-token-quality-desktop'

async function setupQueryAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['quality.query.read', 'quality.analytics.read'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['quality.query.read', 'quality.analytics.read'] } } })
  })

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/profile')) return
    if (url.includes('/analytics/management-review')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: {
        deviation_trend: [{ month: '2026-01', count: 3 }, { month: '2026-02', count: 5 }],
        deviation_categories: [{ category: '设备偏差', count: 4 }],
        capa_closure_rates: [],
        deviation_recurrence: [],
        sop_review: { total: 15, on_track: 13, overdue: 2, rate: 87 },
        summary: { total_deviations: 15, open_deviations: 7, total_capas: 13, closed_capas: 11, effective_sops: 12 },
      } } })
    } else if (url.includes('/edc/queries/list')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    } else if (url.includes('/edc/queries/stats') || (url.includes('/edc/queries') && !url.includes('/list'))) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { open: 0, answered: 0, closed: 0 } } })
    } else if (url.includes('/project-reports')) {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    } else {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    }
  })
}

test.describe('场景6: 数据质疑与质量分析', () => {
  test.beforeEach(async ({ page }) => {
    await setupQueryAuth(page)
  })

  test('6.1 数据质疑列表页显示标题', async ({ page }) => {
    await page.goto('/quality/#/queries')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('数据质疑').first()).toBeVisible({ timeout: 10000 })
    // Table column headers: 'CRF记录' and '字段'
    await expect(page.getByText('CRF记录').first()).toBeVisible()
    await expect(page.getByText('字段').first()).toBeVisible()
  })

  test('6.2 质量分析页加载显示分析标题', async ({ page }) => {
    await page.goto('/quality/#/analytics')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('质量分析').first()).toBeVisible({ timeout: 10000 })
  })

  test('6.3 项目质量报告页可访问', async ({ page }) => {
    await page.goto('/quality/#/report')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('质量报告').first()).toBeVisible({ timeout: 10000 })
  })
})
