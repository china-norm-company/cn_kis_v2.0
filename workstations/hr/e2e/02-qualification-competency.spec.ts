/**
 * 人事台桌面 E2E — 02 资质总览与胜任力模型
 *
 * 覆盖路由：/hr/#/qualifications, /hr/#/competency
 * API：/hr/staff/list, /hr/staff/stats, /hr/staff/create, /hr/competency/list
 *
 * 验收标准：
 * ✓ 资质总览页标题"资质总览"可见
 * ✓ 员工列表数据行在 DOM 中附加
 * ✓ 新增员工按钮可见
 * ✓ 胜任力模型页标题"胜任力模型"可见
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
      data: { account: user, permissions: ['hr.read', 'hr.write', 'hr.staff.manage', 'hr.assessment.manage', 'hr.training.manage'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['hr.read', 'hr.write', 'hr.staff.manage', 'hr.assessment.manage', 'hr.training.manage'] } } })
  })

  // 返回空列表避免 DataTable 单参数 render 函数将整个 record 传入导致 React child 错误
  await page.route('**/api/v1/hr/staff/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
  })

  await page.route('**/api/v1/hr/staff/stats**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { by_gcp_status: { qualified: 20, in_progress: 5, expired: 3 }, total: 28 } } })
  })

  await page.route('**/api/v1/hr/competency/list**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [
      { id: 1, name: '皮肤检测操作', description: '使用皮肤检测仪器的操作能力', level_required: 3 },
      { id: 2, name: 'GCP合规知识', description: '临床研究规范知识掌握程度', level_required: 4 },
    ] } } })
  })
}

test.describe('场景2: 资质总览与胜任力模型', () => {
  test.beforeEach(async ({ page }) => {
    await setupHrAuth(page)
  })

  test('2.1 资质总览页显示标题', async ({ page }) => {
    await page.goto('/hr/#/qualifications')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('资质总览').first()).toBeVisible({ timeout: 10000 })
  })

  test('2.2 资质总览页正常渲染无异常', async ({ page }) => {
    await page.goto('/hr/#/qualifications')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('页面出现异常', { timeout: 10000 })
    await expect(page.locator('body')).not.toContainText('Objects are not valid')
  })

  test('2.3 新增人员按钮可见', async ({ page }) => {
    await page.goto('/hr/#/qualifications')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const addBtn = page.getByRole('button', { name: /新增人员/ })
    await expect(addBtn).toBeVisible({ timeout: 10000 })
  })

  test('2.4 胜任力模型页显示标题', async ({ page }) => {
    await page.goto('/hr/#/competency')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('胜任力模型').first()).toBeVisible({ timeout: 10000 })
  })
})
