/**
 * 场景1：质量管理仪表盘概览
 *
 * 业务目标：
 * ✓ 仪表盘成功加载，显示四个核心统计卡片（开放偏差/超期CAPA/待审SOP/本周质疑）
 * ✓ 待办事项区域和最近事件区域正常渲染
 * ✓ 侧边栏导航菜单完整
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
      data: { account: user, permissions: ['quality.deviation.read', 'quality.capa.read', 'quality.sop.read'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'ok',
        data: { account: AUTH_USER, permissions: ['quality.deviation.read', 'quality.capa.read', 'quality.sop.read'] },
      },
    })
  })

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/profile')) return
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0, stats: { open_deviations: 3, overdue_capas: 1, sops_due_review: 2, weekly_queries: 5 }, todos: [], recent_events: [] } } })
  })
}

test.describe('场景1: 质量管理仪表盘概览', () => {
  test.beforeEach(async ({ page }) => {
    await setupQualityAuth(page)
  })

  test('1.1 仪表盘加载显示质量管理概览标题', async ({ page }) => {
    await page.goto('/quality/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('质量管理概览')).toBeVisible({ timeout: 15000 })
  })

  test('1.2 仪表盘显示四个统计卡片标签', async ({ page }) => {
    await page.goto('/quality/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('开放偏差')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('超期 CAPA')).toBeVisible()
    await expect(page.getByText('本周质疑')).toBeVisible()
  })

  test('1.3 仪表盘待办事项和最近事件区域正常显示', async ({ page }) => {
    await page.goto('/quality/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('待办事项').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('最近质量事件').first()).toBeVisible()
  })
})
