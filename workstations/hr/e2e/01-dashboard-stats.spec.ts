/**
 * 人事台桌面 E2E — 01 仪表盘统计概览
 *
 * 覆盖路由：/hr/#/dashboard
 * API：/hr/staff/stats, /hr/trainings/stats, /hr/staff/list, /hr/trainings/list,
 *      /hr/workload, /hr/ops/overview, /hr/ops/risk-actions/list
 *
 * 验收标准：
 * ✓ 页面标题"人事管理概览"可见
 * ✓ 统计卡片区域正常渲染（无异常）
 * ✓ 侧边栏菜单包含资质总览和能力评估入口
 * ✓ 快捷操作/风险操作区域可见
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 5, name: '人事主管', role: 'hr_manager' }
const AUTH_TOKEN = 'test-token-hr-desktop'

async function setupHrAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['hr.read', 'hr.write', 'hr.staff.manage', 'hr.assessment.create', 'hr.training.manage'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['hr.read', 'hr.write', 'hr.staff.manage', 'hr.assessment.create', 'hr.training.manage'] } } })
  })

  await page.route('**/api/v1/hr/staff/stats**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { by_gcp_status: { qualified: 20, in_progress: 5, expired: 3 }, total: 28 } } })
  })

  await page.route('**/api/v1/hr/trainings/stats**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { by_status: { completed: 15, in_progress: 3, planned: 7 }, total: 25, total_completed_hours: 120 } } })
  })

  await page.route('**/api/v1/hr/staff/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, name: '张评估员', employee_id: 'EMP-001', department: '技术评估部', position: '高级评估员', status: 'active', hire_date: '2024-01-15', qualification_status: 'qualified' },
    ], total: 1 } } })
  })

  await page.route('**/api/v1/hr/trainings/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })

  await page.route('**/api/v1/hr/workload**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [] } } })
  })

  await page.route('**/api/v1/hr/ops/overview**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { total_staff: 28, active_staff: 25, risk_count: 2, completion_rate: 0.89 } } })
  })

  await page.route('**/api/v1/hr/ops/risk-actions/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0, page: 1, page_size: 10 } } })
  })
}

test.describe('场景1: 人事台仪表盘概览', () => {
  test.beforeEach(async ({ page }) => {
    await setupHrAuth(page)
  })

  test('1.1 仪表盘显示人事管理概览标题', async ({ page }) => {
    await page.goto('/hr/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('人事管理概览').first()).toBeVisible({ timeout: 10000 })
  })

  test('1.2 页面加载无异常错误', async ({ page }) => {
    await page.goto('/hr/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('页面出现异常')
    await expect(page.locator('body')).not.toContainText('Unexpected token')
  })

  test('1.3 侧边栏包含资质总览导航入口', async ({ page }) => {
    await page.goto('/hr/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('资质总览').first()).toBeVisible({ timeout: 10000 })
  })

  test('1.4 侧边栏包含能力评估导航入口', async ({ page }) => {
    await page.goto('/hr/#/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('能力评估').first()).toBeVisible({ timeout: 10000 })
  })
})
