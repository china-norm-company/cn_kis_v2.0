/**
 * Admin 数字员工入口验收 — AI 运营已迁移至中书·数字员工中心
 * 验证管理台侧栏存在「数字员工中心」跳转入口，指向 /digital-workforce/
 */
import { test, expect, type Page, type Route } from '@playwright/test'

const BASE = '/admin/#'

function ok<T>(data: T) {
  return { code: 0, msg: 'ok', data }
}

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  })
}

async function mockCommonApis(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'dev-bypass-token')
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 1, name: '测试管理员', email: 'admin@cnkis.local', avatar: '' }),
    )
    localStorage.setItem('auth_token_ts', String(Date.now()))
  })
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await fulfillJson(
      route,
      ok({
        id: 1,
        username: 'admin',
        display_name: '测试管理员',
        permissions: ['system.role.manage', 'system.account.manage'],
        visible_workbenches: ['admin'],
        visible_menu_items: { admin: ['dashboard', 'accounts', 'roles', 'permissions', 'sessions', 'workstations', 'pilot-config', 'audit', 'digital-workforce', 'feishu', 'config'] },
      }),
    )
  })
  await page.route('**/api/v1/log/frontend-error', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
}

test.describe('数字员工中心入口', () => {
  test('侧栏展示「数字员工中心」并指向中书工作台', async ({ page }) => {
    await mockCommonApis(page)
    await page.goto(`${BASE}/dashboard`)
    await expect(page.getByRole('heading', { name: /系统概览|御史·管理台/ })).toBeVisible({ timeout: 15000 })
    const link = page.getByRole('link', { name: '数字员工中心' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /digital-workforce/)
    await expect(link).toHaveAttribute('target', '_blank')
  })
})
