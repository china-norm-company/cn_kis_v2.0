/**
 * 财务台 E2E — spec 04: 预算成本管理
 *
 * 场景：财务人员查看预算列表、成本记录、费用报销、应付台账
 * 验证目标：页面标题、列表数据渲染、关键操作按钮
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'finance-e2e-token-04'
const AUTH_USER = {
  id: 12,
  username: 'finance_manager_04',
  display_name: '预算管理员-测试',
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
        permissions: ['finance.read', 'finance.write', 'finance.budget.read', 'finance.cost.read'],
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
    } else if (url.includes('/finance/budgets/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [
              { id: 1, budget_no: 'BUD-2026-001', budget_name: '化妆品A功效评价预算', total_cost: 50000, actual_cost: 20000, status: 'active', protocol_id: 1, budget_year: 2026 },
              { id: 2, budget_no: 'BUD-2026-002', budget_name: '防晒产品SPF测试预算', total_cost: 30000, actual_cost: 5000, status: 'draft', protocol_id: 2, budget_year: 2026 },
            ],
          },
        },
      })
    } else if (url.includes('/finance/costs/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [{ id: 1, code: 'COST-001', project: '化妆品A功效评价', amount: 5000, cost_type: 'labor', status: 'approved' }],
            total: 1,
          },
        },
      })
    } else if (url.includes('/finance/expenses/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [{ id: 1, code: 'EXP-001', applicant: '张三', amount: 500, category: 'travel', status: 'pending' }],
            total: 1,
          },
        },
      })
    } else if (url.includes('/finance/payables/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [{ id: 1, code: 'PAY-001', vendor: '某供应商', amount: 10000, due_date: '2026-04-30', status: 'pending' }],
            total: 1,
          },
        },
      })
    } else {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    }
  })
}

test.describe('财务台 — 预算成本管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupFinanceAuth(page)
  })

  test('4.1 预算管理页面可访问', async ({ page }) => {
    await page.goto('/finance/#/budgets')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('预算管理').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('4.2 预算列表展示预算编号', async ({ page }) => {
    await page.goto('/finance/#/budgets')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.locator('body')).toContainText('BUD-2026-001')
  })

  test('4.3 成本记录页面可访问', async ({ page }) => {
    await page.goto('/finance/#/costs')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('成本记录').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('4.4 费用报销页面可访问', async ({ page }) => {
    await page.goto('/finance/#/expenses')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('费用报销').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('4.5 应付台账页面可访问', async ({ page }) => {
    await page.goto('/finance/#/payables')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('应付台账').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })
})
