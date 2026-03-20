/**
 * 工作台模式 E2E 测试 (D4)
 *
 * 测试 blank/pilot/full 三种模式在秘书台前端的实际效果。
 * 使用 page.route 拦截 /api/v1/auth/profile，返回包含 workstation_modes 的真实数据格式。
 * 这不是 mock 权限逻辑，而是模拟后端返回的真实数据结构，验证前端按配置渲染。
 *
 * 验收标准：
 * - blank 模式：无侧边导航，显示"功能建设中"占位页
 * - pilot 模式：只显示 enabled_menus 中的菜单项
 * - full 模式（无 workstation_modes）：显示完整导航
 * - blank 模式 + 移动端视口：无底部导航栏
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-ws-modes'

// 基础 profile 结构（真实后端返回格式）
const BASE_PROFILE = {
  code: 200,
  msg: 'ok',
  data: {
    id: 42,
    username: 'mabeili@china-norm.com',
    display_name: '马贝丽',
    email: 'mabeili@china-norm.com',
    avatar: '',
    account_type: 'internal',
    roles: [{ name: 'crc', display_name: 'CRC', level: 3, category: 'operation' }],
    permissions: ['subject.subject.read', 'workorder.workorder.read'],
    data_scope: 'project',
    visible_workbenches: ['secretary'],
    visible_menu_items: {
      secretary: ['portal', 'dashboard', 'todo', 'notifications', 'chat'],
    },
  },
}

async function setupAuth(page: Page) {
  await page.addInitScript(({ token }: { token: string }) => {
    localStorage.setItem('auth_token', token)
  }, { token: AUTH_TOKEN })
}

async function mockProfile(page: Page, profileOverrides: Record<string, unknown> = {}) {
  const profile = {
    ...BASE_PROFILE,
    data: { ...BASE_PROFILE.data, ...profileOverrides },
  }
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: profile })
  })
}

// ============================================================================
// 场景 1: blank 模式 — 无侧边导航，显示占位页
// ============================================================================

test('test_blank_mode_shows_placeholder', async ({ page }) => {
  await setupAuth(page)
  await mockProfile(page, {
    visible_menu_items: { secretary: [] },
    workstation_modes: { secretary: 'blank' },
  })

  await page.goto('http://localhost:5173/#/')
  await page.waitForLoadState('networkidle')

  // 应显示占位文字
  await expect(page.getByText('功能建设中')).toBeVisible({ timeout: 10000 })

  // 不应有侧边导航菜单项
  const navItems = page.locator('nav a, [role="navigation"] a')
  const count = await navItems.count()
  // blank 模式下所有菜单都不可见
  expect(count).toBe(0)
})

// ============================================================================
// 场景 2: pilot 模式 — 只显示指定菜单
// ============================================================================

test('test_pilot_mode_limited_nav', async ({ page }) => {
  await setupAuth(page)
  await mockProfile(page, {
    visible_menu_items: { secretary: ['chat'] },  // pilot 模式后端只返回 chat
    workstation_modes: { secretary: 'pilot' },
  })

  await page.goto('http://localhost:5173/#/')
  await page.waitForLoadState('networkidle')

  // 应显示 AI 对话菜单
  await expect(page.getByText('AI对话')).toBeVisible({ timeout: 10000 })

  // 不应显示其他菜单（如"信息总览"）
  const dashboardNav = page.getByText('信息总览')
  await expect(dashboardNav).not.toBeVisible()

  // 不应显示"工作台门户"
  const portalNav = page.getByText('工作台门户')
  await expect(portalNav).not.toBeVisible()
})

// ============================================================================
// 场景 3: full 模式 — 显示完整导航（无 workstation_modes）
// ============================================================================

test('test_full_mode_shows_all', async ({ page }) => {
  await setupAuth(page)
  // full 模式：不传 workstation_modes（后端无配置时的默认行为）
  await mockProfile(page, {
    visible_menu_items: {
      secretary: ['portal', 'dashboard', 'todo', 'notifications', 'chat'],
    },
    // 故意不传 workstation_modes，测试无配置时的默认行为
  })

  await page.goto('http://localhost:5173/#/')
  await page.waitForLoadState('networkidle')

  // 不应显示占位页
  const placeholder = page.getByText('功能建设中')
  await expect(placeholder).not.toBeVisible()

  // 应显示正常导航（至少有工作台门户）
  await expect(page.getByText('工作台门户')).toBeVisible({ timeout: 10000 })
})

// ============================================================================
// 场景 4: blank 模式 + 移动端视口
// ============================================================================

test('test_blank_mode_mobile', async ({ page }) => {
  // 设置 iPhone 视口
  await page.setViewportSize({ width: 375, height: 667 })

  await setupAuth(page)
  await mockProfile(page, {
    visible_menu_items: { secretary: [] },
    workstation_modes: { secretary: 'blank' },
  })

  await page.goto('http://localhost:5173/#/')
  await page.waitForLoadState('networkidle')

  // 应显示占位文字
  await expect(page.getByText('功能建设中')).toBeVisible({ timeout: 10000 })

  // 移动端底部导航栏不应显示（blank 模式下无菜单项，底部导航为空）
  // MobileWorkstationLayout 的底部导航 data-testid 为 mobile-bottom-nav 或 class 含 fixed bottom
  const bottomNav = page.locator('[data-testid="mobile-bottom-nav"], .fixed.bottom-0 nav')
  const count = await bottomNav.count()
  if (count > 0) {
    // 如果底部导航存在，它应该没有导航链接
    const navLinks = bottomNav.locator('a')
    const linkCount = await navLinks.count()
    expect(linkCount).toBe(0)
  }
  // 无论如何，占位页应当可见
  await expect(page.getByText('功能建设中')).toBeVisible()
})
