/**
 * 伦理台桌面 E2E — 01 管理看板概览
 *
 * 覆盖路由：/ethics/dashboard
 * API：/ethics/dashboard
 *
 * 验收标准：
 * ✓ 管理看板页面标题"管理看板"可见
 * ✓ 侧边栏包含伦理申请、伦理批件、伦理监督等导航入口
 * ✓ 页面无异常渲染错误
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 10, name: '伦理委员', role: 'ethics_officer' }
const AUTH_TOKEN = 'test-token-ethics-desktop'

async function setupEthicsAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['ethics.read', 'ethics.write', 'ethics.manage'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['ethics.read', 'ethics.write', 'ethics.manage'] } } })
  })

  await page.route('**/api/v1/ethics/dashboard**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: {
      pending_applications: 5,
      expiring_approvals: 2,
      active_supervisions: 3,
      upcoming_trainings: 1,
      recent_activities: [],
    } } })
  })
}

test.describe('场景1: 伦理台管理看板概览', () => {
  test.beforeEach(async ({ page }) => {
    await setupEthicsAuth(page)
  })

  test('1.1 管理看板显示标题', async ({ page }) => {
    await page.goto('/ethics/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('管理看板').first()).toBeVisible({ timeout: 10000 })
  })

  test('1.2 侧边栏包含伦理申请导航', async ({ page }) => {
    await page.goto('/ethics/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('伦理申请').first()).toBeVisible({ timeout: 10000 })
  })

  test('1.3 侧边栏包含伦理批件导航', async ({ page }) => {
    await page.goto('/ethics/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.getByText('伦理批件').first()).toBeVisible({ timeout: 10000 })
  })

  test('1.4 页面无异常渲染错误', async ({ page }) => {
    await page.goto('/ethics/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await expect(page.locator('body')).not.toContainText('页面出现异常', { timeout: 10000 })
    await expect(page.locator('body')).not.toContainText('Unexpected token')
  })
})
