import { expect, test } from '@playwright/test'

const AUTH_TOKEN = 'test-token-secretary-portal'
const USER = { id: 1, name: '秘书-入口验收', role: 'viewer' }

test.describe('秘书台门户天工入口（headed 验收）', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
    }, { token: AUTH_TOKEN, user: USER })

    await page.route('**/api/v1/auth/profile**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'ok',
          data: {
            username: 'secretary-viewer',
            roles: [{ name: 'viewer', display_name: '查看者', level: 1, category: 'external' }],
            permissions: [],
            visible_workbenches: ['secretary'],
            visible_menu_items: { secretary: ['portal'] },
          },
        },
      })
    })
  })

  test('门户应展示天工入口卡片', async ({ page }) => {
    await page.goto('/secretary/#/portal')
    await expect(page.getByText('天工·资源统一智能化管理平台')).toBeVisible()
  })
})
