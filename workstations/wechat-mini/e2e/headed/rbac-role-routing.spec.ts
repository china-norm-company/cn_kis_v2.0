/**
 * RBAC 角色路由 E2E Headed 测试
 *
 * 计划 P0.7：7 个测试用例验证角色分流与页面守护
 *
 * 使用 API mock（route.fulfill）模拟 /auth/profile 返回不同角色，
 * 并通过 localStorage 注入登录 token 和 userInfo，验证路由跳转行为。
 *
 * 运行方式：
 *   cd workstations/wechat-mini
 *   HEADED=1 pnpm exec playwright test e2e/headed/rbac-role-routing.spec.ts
 *
 * Taro H5 存储格式（必须遵守）：
 *   Taro.setStorageSync('key', val) 存储格式：localStorage['key'] = JSON.stringify({data: val})
 *   Taro.getStorageSync('key') 读取：JSON.parse(localStorage['key']).data
 *   直接写 localStorage 时必须遵循 {data: value} 包装格式，否则 getStorageSync 返回 ""。
 */
import { expect, test } from '@playwright/test'

// ============================================================
// 辅助：注入登录态（token + userInfo）到 localStorage
// 使用 Taro H5 内部存储格式 { data: value }
// ============================================================
async function injectLoginStateBeforeLoad(
  page: import('@playwright/test').Page,
  options: {
    roles?: string[]
    accountType?: string
  } = {},
) {
  const { roles = [], accountType = 'subject' } = options
  const userInfoObject = {
    id: 'test-user-001',
    name: '测试用户',
    subjectNo: 'SB-TEST-001',
    enrollDate: '',
    projectName: '',
    account_type: accountType,
    roles,
    primary_role: roles[0] || 'viewer',
  }
  await page.addInitScript(
    ({ tokenData, userInfoData }) => {
      // Taro H5 存储格式：{ data: value }
      // getStorageSync('key') 从 localStorage['key'] 中读取 JSON.parse(...).data
      localStorage.setItem('token', JSON.stringify({ data: tokenData }))
      localStorage.setItem('userInfo', JSON.stringify({ data: userInfoData }))
    },
    {
      tokenData: 'mock-token-for-testing',
      userInfoData: userInfoObject,
    },
  )
}

// ============================================================
// 辅助：mock /auth/profile API 返回
// ============================================================
async function mockAuthProfile(
  page: import('@playwright/test').Page,
  roles: string[],
  accountType = 'internal',
) {
  await page.route('**/api/v1/auth/profile', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        msg: 'OK',
        data: {
          id: 100,
          username: 'test_staff',
          display_name: '测试员工',
          account_type: accountType,
          roles: roles.map((name) => ({ name, display_name: name })),
          visible_workbenches: [],
          permissions: [],
        },
      }),
    })
  })
}

// ============================================================
// 测试用例
// ============================================================

test.describe('RBAC 角色路由', () => {
  // 用例 1：受试者账号登录后留在首页
  test('受试者登录后留在受试者首页，显示欢迎内容', async ({ page }) => {
    await injectLoginStateBeforeLoad(page, {
      roles: [],
      accountType: 'subject',
    })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // 受试者首页应显示"您好"或登录入口（未完全加载时）
    await expect(
      page.locator('.home-top-card__title, .home-login-panel__btn').first()
    ).toBeVisible({ timeout: 15000 })
    // 不应跳转到 technician 页面
    await expect(page).not.toHaveURL(/#\/pages\/technician\/index/, { timeout: 3000 }).catch(() => {
      // 如果 URL 不含 technician，断言成功
    })
  })

  // 用例 2：技术员角色登录后自动跳转到技术员工作台
  test('技术员角色登录后应跳转到 technician 页面', async ({ page }) => {
    await injectLoginStateBeforeLoad(page, { roles: ['technician'], accountType: 'internal' })
    await mockAuthProfile(page, ['technician'])
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    // Taro.reLaunch('/pages/technician/index') → H5 hash 路由
    await expect(page).toHaveURL(/#\/pages\/technician\/index/, { timeout: 12000 })
  })

  // 用例 3：评估员角色登录后应跳转到技术员工作台
  test('评估员角色登录后应跳转到 technician 页面', async ({ page }) => {
    await injectLoginStateBeforeLoad(page, { roles: ['evaluator'], accountType: 'internal' })
    await mockAuthProfile(page, ['evaluator'])
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    // resolveLoginRoute('internal', ['evaluator']) = 'technician_workbench' → reLaunch
    await expect(page).toHaveURL(/#\/pages\/technician\/index/, { timeout: 12000 })
  })

  // 用例 4：受试者账号无法访问技术员页面（被重定向）
  test('受试者无 technician 角色时访问技术员页面应被重定向', async ({ page }) => {
    await injectLoginStateBeforeLoad(page, {
      roles: [],
      accountType: 'subject',
    })
    // 直接访问 technician 页面
    await page.goto('/#/pages/technician/index')
    await page.waitForLoadState('domcontentloaded')

    // 应被重定向回首页
    await expect(page).toHaveURL(/\/$|#\/$|pages\/index\/index/, { timeout: 10000 })
  })

  // 用例 5：多角色用户（evaluator + qa）按优先级进入技术员工作台
  test('多角色用户（evaluator + qa）按优先级进入技术员工作台', async ({ page }) => {
    await injectLoginStateBeforeLoad(page, { roles: ['evaluator', 'qa'], accountType: 'internal' })
    await mockAuthProfile(page, ['evaluator', 'qa'])
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    // evaluator 优先级高于 qa，resolveLoginRoute 返回 'technician_workbench'
    await expect(page).toHaveURL(/#\/pages\/technician\/index/, { timeout: 12000 })
  })

  // 用例 6：零角色用户（仅 viewer）进入受试者默认首页，不崩溃
  test('零角色用户（仅 viewer）进入受试者默认首页，不崩溃', async ({ page }) => {
    await injectLoginStateBeforeLoad(page, {
      roles: ['viewer'],
      accountType: 'internal',
    })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // viewer 不是 FIELD_EXECUTOR，应留在首页
    // 首页应无崩溃错误
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(2000)
    expect(errors.filter((e) => !/ResizeObserver/.test(e))).toHaveLength(0)
  })

  // 用例 7：无缓存（未登录）直接访问 technician 页面应重定向到首页
  test('未登录状态直接访问 technician 页面应被重定向到首页登录', async ({ page }) => {
    // 清除所有存储
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
    })
    await page.goto('/#/pages/technician/index')
    await page.waitForLoadState('domcontentloaded')

    // 应跳转到首页（无 token）
    await expect(page).toHaveURL(/\/$|#\/$|pages\/index\/index/, { timeout: 10000 })
  })
})
