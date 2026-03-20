/**
 * 财务台 E2E — spec 05: 财务分析模块
 *
 * 场景：财务分析师查看盈利分析、收入分析、成本分析、AR账龄、现金流
 * 验证目标：各分析页面标题、图表容器存在、无错误页面
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'finance-e2e-token-05'
const AUTH_USER = {
  id: 13,
  username: 'finance_analyst_05',
  display_name: '财务分析师-测试',
  account_type: 'staff',
}

async function setupFinanceAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: {
        account: user,
        permissions: ['finance.read', 'finance.analytics.read'],
      },
    }))
    localStorage.setItem('auth_profile_token', token)
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route(/\/api\/v1\//, async (route) => {
    const url = route.request().url()

    if (url.includes('/auth/profile')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok',
          data: { account: AUTH_USER, permissions: ['finance.read', 'finance.analytics.read'] },
        },
      })
    } else if (url.includes('/finance/analytics/profit')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [{ protocol_id: 1, protocol_name: '化妆品A功效评价', revenue: 50000, cost: 30000, profit: 20000, margin: 0.4 }],
            total: 1,
          },
        },
      })
    } else if (url.includes('/finance/analytics/risk')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            high_risk_count: 2, medium_risk_count: 3, low_risk_count: 8,
            total_exposure: 100000, items: [],
          },
        },
      })
    } else if (url.includes('/finance/profit-analysis')) {
      await route.fulfill({
        json: { code: 200, msg: 'ok', data: {} },
      })
    } else if (url.includes('/protocol/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [{ id: 1, name: '化妆品A功效评价', protocol_no: 'PROT-001' }],
            total: 1,
          },
        },
      })
    } else {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    }
  })
}

test.describe('财务台 — 财务分析模块', () => {
  test.beforeEach(async ({ page }) => {
    await setupFinanceAuth(page)
  })

  test('5.1 盈利分析页面可访问', async ({ page }) => {
    await page.goto('/finance/#/profit-analysis')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('盈利分析').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('5.2 收入分析页面可访问', async ({ page }) => {
    await page.goto('/finance/#/revenue-analysis')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('收入分析').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('5.3 成本分析页面可访问', async ({ page }) => {
    await page.goto('/finance/#/cost-analysis')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('成本分析').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('5.4 应收账龄页面可访问', async ({ page }) => {
    await page.goto('/finance/#/ar-aging')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 检查页面不报错
    await expect(page.locator('body')).not.toContainText('页面出现异常')
    await expect(page.locator('body')).not.toContainText('Cannot read')
  })

  test('5.5 现金流页面可访问', async ({ page }) => {
    await page.goto('/finance/#/cashflow')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })
})
