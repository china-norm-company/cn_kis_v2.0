/**
 * 财务台 E2E — spec 06: 结算与风险管理
 *
 * 场景：财务主管查看项目决算、风险分析、运营效率、财务报表
 * 验证目标：页面标题、数据展示、按钮可见性
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'finance-e2e-token-06'
const AUTH_USER = {
  id: 14,
  username: 'finance_director_06',
  display_name: '财务主管-测试',
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
        permissions: ['finance.read', 'finance.write', 'finance.settlement.read', 'finance.report.read'],
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
          data: { account: AUTH_USER, permissions: ['finance.read', 'finance.write'] },
        },
      })
    } else if (url.includes('/finance/settlements/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [
              { id: 1, settlement_no: 'SETT-2026-001', protocol_name: '化妆品A功效评价', total_revenue: 50000, total_cost: 30000, profit: 20000, status: 'completed' },
            ],
            total: 1,
          },
        },
      })
    } else if (url.includes('/finance/analytics/risk')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            high_risk_count: 1, medium_risk_count: 2, low_risk_count: 5,
            total_exposure: 80000, items: [],
          },
        },
      })
    } else if (url.includes('/finance/analytics/efficiency')) {
      await route.fulfill({
        json: { code: 200, msg: 'ok', data: {} },
      })
    } else if (url.includes('/finance/reports/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [
              { id: 1, report_name: '2026年Q1财务报表', report_type: 'quarterly', created_at: '2026-04-01', status: 'generated' },
            ],
            total: 1,
          },
        },
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

test.describe('财务台 — 结算与风险管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupFinanceAuth(page)
  })

  test('6.1 项目决算页面可访问', async ({ page }) => {
    await page.goto('/finance/#/settlement')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('项目决算').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('6.2 项目决算展示决算编号', async ({ page }) => {
    await page.goto('/finance/#/settlement')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.locator('body')).toContainText('SETT-2026-001')
  })

  test('6.3 风险分析页面可访问', async ({ page }) => {
    await page.goto('/finance/#/risk-dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('风险分析').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('6.4 运营效率页面可访问', async ({ page }) => {
    await page.goto('/finance/#/efficiency')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('运营效率').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('6.5 财务报表页面可访问', async ({ page }) => {
    await page.goto('/finance/#/reports')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('财务报表').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })
})
