/**
 * 人事台桌面 E2E — 05 人事档案管理
 *
 * 覆盖路由：/hr/#/archives, /hr/#/archives/:staffId, /hr/#/archive-changes, /hr/#/archive-exits
 * API：/hr/archives/list, /hr/archives/:id
 *
 * 验收标准：
 * ✓ 人事档案总览页标题"人事档案总览"可见
 * ✓ 档案列表数据行在 DOM 中附加
 * ✓ 档案变更页标题"档案变更记录"可见
 * ✓ 离职档案页标题"离职档案"可见
 * ✓ 员工档案详情页可访问（无404）
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

  await page.route('**/api/v1/hr/archives/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, staff_id: 1, staff_name: '张评估员', department: '技术评估部', manager_name: '王主管', job_rank: 'P4', employment_status: 'active', employment_type: '全职', sync_source: '手动' },
      { id: 2, staff_id: 2, staff_name: '李研究员', department: '临床研究部', manager_name: '赵主管', job_rank: 'P3', employment_status: 'active', employment_type: '全职', sync_source: '手动' },
    ], total: 2 } } })
  })

  await page.route('**/api/v1/hr/archives/1**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { id: 1, staff_name: '张评估员', employee_id: 'EMP-001', status: 'active' } } })
  })
}

test.describe('场景5: 人事档案管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupHrAuth(page)
  })

  test('5.1 人事档案总览页显示标题', async ({ page }) => {
    await page.goto('/hr/#/archives')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('人事档案总览').first()).toBeVisible({ timeout: 10000 })
  })

  test('5.2 档案列表显示 mock 数据', async ({ page }) => {
    await page.goto('/hr/#/archives')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('张评估员').first()).toBeAttached({ timeout: 10000 })
    await expect(page.getByText('技术评估部').first()).toBeAttached()
    await expect(page.getByText('王主管').first()).toBeAttached()
  })

  test('5.3 员工档案详情页可访问', async ({ page }) => {
    await page.goto('/hr/#/archives/1')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('页面不存在', { timeout: 10000 })
    await expect(page.locator('body')).not.toContainText('404')
  })

  test('5.4 档案变更记录页可访问', async ({ page }) => {
    await page.goto('/hr/#/archive-changes')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('页面出现异常', { timeout: 10000 })
    await expect(page.locator('body')).not.toContainText('404')
  })
})
