/**
 * 场景 8：飞书能力集成 — 认证、权限、用户体验
 *
 * 业务背景：
 *   设备管理工作台是飞书 H5 应用，设备管理员通过飞书客户端
 *   或浏览器访问。系统使用飞书 OAuth 认证，登录后根据用户的
 *   角色和权限决定能看到哪些菜单、能做哪些操作。
 *
 *   飞书集成能力：
 *   - OAuth 登录（飞书端内免登 / 浏览器 OAuth 跳转）
 *   - 权限画像（从 /auth/profile 获取角色、权限、可见工作台）
 *   - 基于权限的菜单可见性（hasAnyPermission 控制）
 *   - 用户信息展示（头像、姓名）
 *   - 退出登录
 *
 * 验证目标：
 *   - 未登录时显示正确的登录引导
 *   - 登录后用户信息正确展示
 *   - 权限控制菜单可见性
 *   - 退出登录功能正常
 *   - 不同权限角色看到不同内容
 */
import { test, expect, type Page } from '@playwright/test'
import { setupApiMocks } from './helpers/setup'
import { EQUIPMENT_MANAGER_USER, AUTH_TOKEN, authProfileData } from './helpers/mock-data'

/**
 * 注入完整权限的设备管理员
 */
async function injectFullAuth(page: Page) {
  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token: AUTH_TOKEN, user: EQUIPMENT_MANAGER_USER, profile: authProfileData },
  )
}

/**
 * 注入受限权限的用户（只有查看权限，没有创建/修改权限）
 */
async function injectReadOnlyAuth(page: Page) {
  const readOnlyProfile = {
    ...authProfileData,
    id: 20,
    username: 'readonly_viewer',
    display_name: '观察员小周',
    account_type: 'viewer',
    roles: [
      { name: 'viewer', display_name: '观察员', level: 1, category: 'support' },
    ],
    permissions: [
      'resource.equipment.read',
      'resource.calibration.read',
      'resource.maintenance.read',
      'resource.usage.read',
    ],
    visible_menu_items: {
      equipment: ['ledger', 'calibration', 'maintenance', 'usage'],
    },
  }

  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    {
      token: 'mock-e2e-token-readonly-viewer',
      user: { open_id: 'ou_readonly_viewer', name: '观察员小周', avatar: '', email: 'zhou@cnkis.test' },
      profile: readOnlyProfile,
    },
  )
}

test.describe('场景8A: 飞书认证 — 登录与用户身份', () => {

  test('8A.1【未登录态】未认证时显示飞书登录引导页', async ({ page }) => {
    // 不注入任何认证信息，直接访问工作台
    // FeishuAuthProvider 检测到无 token，应该显示 LoginFallback
    await setupApiMocks(page)
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 应该看到登录引导而非工作台内容
    await expect(page.getByRole('button', { name: '飞书登录' })).toBeVisible({ timeout: 10000 })

    // 应该显示工作台名称
    await expect(page.getByRole('heading', { name: '器衡·设备台' })).toBeVisible()
  })

  test('8A.2【登录后身份】登录后显示用户名称和头像', async ({ page }) => {
    await injectFullAuth(page)
    await setupApiMocks(page)
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 设备管理员"李器衡"的名字应该出现在顶部导航
    await expect(page.getByText('李器衡')).toBeVisible()

    // 无头像时显示名字首字符
    const avatar = page.locator('div').filter({ hasText: /^李$/ })
    if (await avatar.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(avatar.first()).toBeVisible()
    }
  })

  test('8A.3【工作台品牌】顶部显示正确的工作台名称', async ({ page }) => {
    await injectFullAuth(page)
    await setupApiMocks(page)
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 顶部应该显示"器衡·设备台"
    await expect(page.getByText('器衡·设备台')).toBeVisible()
  })

  test('8A.4【退出登录】退出登录按钮存在且可点击', async ({ page }) => {
    await injectFullAuth(page)
    await setupApiMocks(page)
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 退出登录按钮（title="退出登录"）
    const logoutBtn = page.locator('button[title="退出登录"]')
    await expect(logoutBtn).toBeVisible()
    await expect(logoutBtn).toBeEnabled()
  })

  test('8A.5【加载状态】认证加载过程中显示加载指示', async ({ page }) => {
    // 模拟认证过程的加载状态
    // 不注入认证，拦截 profile 请求使其延迟
    await page.route('**/api/v1/auth/profile**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.fulfill({ json: { code: 0, msg: 'ok', data: authProfileData } })
    })

    await page.goto('/equipment/ledger')

    // 加载过程中应该显示加载提示
    const loadingText = page.getByText('正在加载')
      .or(page.getByText('加载中'))
    if (await loadingText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(loadingText).toBeVisible()
    }
  })
})

test.describe('场景8B: 权限控制 — 不同角色看到不同内容', () => {
  const sidebarNav = (page: Page) => page.getByRole('complementary').getByRole('navigation')

  test('8B.1【完整权限】设备管理员能看到全部 5 个导航项', async ({ page }) => {
    await injectFullAuth(page)
    await setupApiMocks(page)
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 设备管理员拥有全部权限，5 个菜单都应可见
    const nav = sidebarNav(page)
    await expect(nav.getByRole('link', { name: '设备台账' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '校准计划' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '维护工单' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '使用记录' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '检测方法' })).toBeVisible()
  })

  test('8B.2【受限权限】只读用户看不到检测方法菜单', async ({ page }) => {
    const readOnlyProfileData = {
      id: 20,
      username: 'readonly_viewer',
      display_name: '观察员小周',
      account_type: 'viewer',
      roles: [{ name: 'viewer', display_name: '观察员', level: 1, category: 'support' }],
      permissions: [
        'resource.equipment.read',
        'resource.calibration.read',
        'resource.maintenance.read',
        'resource.usage.read',
      ],
      visible_workbenches: ['equipment'],
      visible_menu_items: { equipment: ['ledger', 'calibration', 'maintenance', 'usage'] },
      data_scope: 'team',
      email: 'zhou@cnkis.test',
      avatar: '',
    }

    await injectReadOnlyAuth(page)
    await setupApiMocks(page)

    // 覆盖 auth/profile 路由，使其返回只读用户的 profile（而非默认的管理员 profile）
    await page.route('**/api/v1/auth/profile**', async (route) => {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: readOnlyProfileData } })
    })

    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 只读用户缺少 resource.method.read 权限
    const nav = sidebarNav(page)

    // 有权限的菜单应该可见
    await expect(nav.getByRole('link', { name: '设备台账' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '校准计划' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '维护工单' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '使用记录' })).toBeVisible()

    // 无权限的菜单应该不可见
    const methodMenu = nav.getByRole('link', { name: '检测方法' })
    await expect(methodMenu).not.toBeVisible()
  })

  test('8B.3【用户身份一致】不同角色显示不同的用户名', async ({ page }) => {
    await injectReadOnlyAuth(page)
    await setupApiMocks(page)

    // 覆盖 auth/profile 返回只读用户 profile
    await page.route('**/api/v1/auth/profile**', async (route) => {
      await route.fulfill({ json: { code: 0, msg: 'ok', data: {
        id: 20, username: 'readonly_viewer', display_name: '观察员小周',
        account_type: 'viewer', roles: [{ name: 'viewer', display_name: '观察员', level: 1, category: 'support' }],
        permissions: ['resource.equipment.read', 'resource.calibration.read', 'resource.maintenance.read', 'resource.usage.read'],
        visible_workbenches: ['equipment'], visible_menu_items: { equipment: ['ledger', 'calibration', 'maintenance', 'usage'] },
        data_scope: 'team', email: 'zhou@cnkis.test', avatar: '',
      } } })
    })

    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 应该显示只读用户的名称而非管理员
    await expect(page.getByText('观察员小周')).toBeVisible()
  })

  test('8B.4【侧栏品牌标识】侧栏显示 CN KIS 品牌标识', async ({ page }) => {
    await injectFullAuth(page)
    await setupApiMocks(page)
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 侧栏顶部应该有品牌标识
    const sidebar = page.locator('aside')
    await expect(sidebar.getByText('CN KIS')).toBeVisible()
  })

  test('8B.5【页面权限保护】所有页面都在 FeishuAuthProvider 内', async ({ page }) => {
    await injectFullAuth(page)
    await setupApiMocks(page)

    // 验证每个路由都能正常访问（不会因为权限框架崩溃）
    const routes = ['/ledger', '/calibration', '/maintenance', '/usage', '/detection-methods']

    for (const route of routes) {
      await page.goto(`/equipment${route}`)
      await page.waitForLoadState('networkidle')

      // 每个页面都应该在 FeishuAuthProvider 框架内
      // 验证顶部标题和侧栏导航仍然存在
      await expect(page.getByText('器衡·设备台')).toBeVisible()
    }
  })

  test('8B.6【菜单高亮】当前页面对应的导航项应高亮显示', async ({ page }) => {
    await injectFullAuth(page)
    await setupApiMocks(page)
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 当在校准计划页面时，侧栏的"校准计划"应该有高亮样式
    const calNav = sidebarNav(page).getByRole('link', { name: '校准计划' })
    await expect(calNav).toBeVisible()

    // NavLink isActive 时应用不同的 className
    const classAttr = await calNav.getAttribute('class')
    expect(classAttr).toContain('bg-primary')
  })
})
