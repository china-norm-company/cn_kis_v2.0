/**
 * 人事台桌面 E2E — 06 绩效管理与运营模块
 *
 * 覆盖路由：/hr/#/performance-ops, /hr/#/compensation, /hr/#/workload
 * API：/hr/performance/cycles/list, /hr/performance/records/list, /hr/staff/list,
 *      /hr/payroll/records/list, /hr/payroll/incentives/list, /hr/workload
 *
 * 验收标准：
 * ✓ 绩效管理页标题"绩效管理"可见
 * ✓ 薪酬与激励页标题"薪酬与激励"可见
 * ✓ 工作负荷看板页标题"工作负荷看板"可见
 * ✓ 各页面无异常错误
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

  await page.route('**/api/v1/hr/performance/cycles/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, name: '2025年度绩效周期', period_start: '2025-01-01', period_end: '2025-12-31', status: 'active' },
    ], total: 1 } } })
  })

  await page.route('**/api/v1/hr/performance/records/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, staff_name: '张评估员', cycle_name: '2025年度绩效周期', score: 88, rating: 'good', status: 'completed' },
    ], total: 1 } } })
  })

  await page.route('**/api/v1/hr/staff/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, name: '张评估员', employee_id: 'EMP-001' },
    ], total: 1 } } })
  })

  await page.route('**/api/v1/hr/payroll/records/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })

  await page.route('**/api/v1/hr/payroll/incentives/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })

  await page.route('**/api/v1/hr/workload**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [] } } })
  })
}

test.describe('场景6: 绩效管理与运营模块', () => {
  test.beforeEach(async ({ page }) => {
    await setupHrAuth(page)
  })

  test('6.1 绩效管理页显示标题', async ({ page }) => {
    await page.goto('/hr/#/performance-ops')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('绩效管理').first()).toBeVisible({ timeout: 10000 })
  })

  test('6.2 绩效管理页显示绩效周期数据', async ({ page }) => {
    await page.goto('/hr/#/performance-ops')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('2025年度绩效周期').first()).toBeAttached({ timeout: 10000 })
  })

  test('6.3 薪酬与激励页显示标题', async ({ page }) => {
    await page.goto('/hr/#/compensation')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('薪酬与激励').first()).toBeVisible({ timeout: 10000 })
  })

  test('6.4 工作负荷看板页显示标题', async ({ page }) => {
    await page.goto('/hr/#/workload')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('工作负荷看板').first()).toBeVisible({ timeout: 10000 })
  })

  test('6.5 工作负荷页面无异常错误', async ({ page }) => {
    await page.goto('/hr/#/workload')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('页面出现异常', { timeout: 10000 })
    await expect(page.locator('body')).not.toContainText('Unexpected token')
  })
})
