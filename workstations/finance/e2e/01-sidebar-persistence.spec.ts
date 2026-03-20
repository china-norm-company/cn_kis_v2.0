import { test, expect, type Page } from '@playwright/test'

const TOKEN = 'finance-sidebar-token'
const USER = { id: 2, name: '财务-测试', role: 'finance_manager' }

async function seedAuth(page: Page, withCachedProfile = true) {
  await page.addInitScript(({ token, user, useCachedProfile }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    if (useCachedProfile) {
      localStorage.setItem(
        'auth_profile',
        JSON.stringify({
          id: user.id,
          username: 'finance_user',
          display_name: user.name,
          roles: [{ name: 'finance_manager', display_name: '财务经理', level: 1, category: 'biz' }],
          permissions: ['finance.quote.read'],
          visible_workbenches: ['finance'],
          visible_menu_items: { finance: ['dashboard', 'quotes'] },
        }),
      )
      localStorage.setItem('auth_profile_token', token)
    }
  }, { token: TOKEN, user: USER, useCachedProfile: withCachedProfile })
}

test.describe('财务台侧栏稳定性（desktop）', () => {
  test('auth/profile 异常时侧栏不应在后续渲染消失', async ({ page }) => {
    await seedAuth(page, true)
    await page.route('**/api/v1/auth/profile**', async (route) => {
      await page.waitForTimeout(350)
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    })
    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    })

    await page.goto('/finance/dashboard')
    const sidebarQuoteLink = page.getByRole('link', { name: '报价管理' }).first()
    await expect(sidebarQuoteLink).toBeVisible()

    await page.mouse.move(1200, 40)
    await page.waitForTimeout(900)
    await expect(sidebarQuoteLink).toBeVisible()
  })

  test('无缓存且 auth/profile 异常时，侧栏仍保持可见', async ({ page }) => {
    await seedAuth(page, false)
    await page.route('**/api/v1/auth/profile**', async (route) => {
      await page.waitForTimeout(350)
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    })
    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    })

    await page.goto('/finance/dashboard')
    const sidebarQuoteLink = page.getByRole('link', { name: '报价管理' }).first()
    await expect(sidebarQuoteLink).toBeVisible()

    await page.mouse.move(1000, 200)
    await page.waitForTimeout(900)
    await expect(sidebarQuoteLink).toBeVisible()
  })

  test('account 嵌套结构 profile 返回时，侧栏稳定可见', async ({ page }) => {
    await seedAuth(page, false)
    await page.route('**/api/v1/auth/profile**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'ok',
          data: {
            account: { id: 2, username: 'finance_user', display_name: '财务-测试' },
            permissions: ['finance.quote.read'],
            visible_workbenches: ['finance'],
            visible_menus: { finance: ['dashboard', 'quotes'] },
          },
        },
      })
    })
    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    })

    await page.goto('/finance/dashboard')
    const sidebarQuoteLink = page.getByRole('link', { name: '报价管理' }).first()
    await expect(sidebarQuoteLink).toBeVisible()
    await page.waitForTimeout(800)
    await expect(sidebarQuoteLink).toBeVisible()
  })
})
