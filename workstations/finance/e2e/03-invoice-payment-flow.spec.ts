/**
 * 财务台 E2E — spec 03: 发票管理（开票申请、发票、收款、催款、客户）
 *
 * 场景：/finance/#/invoices 发票管理页面及标签页
 * 验证目标：页面标题、开票申请/发票管理标签可访问
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'finance-e2e-token-03'
const AUTH_USER = {
  id: 11,
  username: 'finance_manager_03',
  display_name: '发票管理员-测试',
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
        permissions: ['finance.read', 'finance.write', 'finance.invoice.read', 'finance.payment.read'],
      },
    }))
    localStorage.setItem('auth_profile_token', token)
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  // 统一处理所有 API 请求
  await page.route(/\/api\/v1\//, async (route) => {
    const url = route.request().url()

    if (url.includes('/auth/profile')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok',
          data: { account: AUTH_USER, permissions: ['finance.read', 'finance.write'] },
        },
      })
    } else if (url.includes('/finance/invoices/stats')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            by_status: { pending: 1, issued: 1, paid: 0, overdue: 0 },
            total: 2,
          },
        },
      })
    } else if (url.includes('/finance/invoices/list') || (url.includes('/finance/invoices') && !url.includes('/finance/invoice-requests') && !/\/finance\/invoices\/[0-9]+/.test(url))) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            invoices: [
              { id: 1, invoice_no: 'INV-2026-001', customer_name: '某化妆品公司', invoice_amount_tax_included: 48000, status: 'issued', invoice_date: '2026-02-01' },
              { id: 2, invoice_no: 'INV-2026-002', customer_name: '某品牌公司', invoice_amount_tax_included: 29000, status: 'pending', invoice_date: '2026-02-15' },
            ],
            total_records: 2,
            total_pages: 1,
            current_page: 1,
          },
        },
      })
    } else if (url.includes('/finance/payments/stats')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            by_status: { pending: 0, received: 1, overdue: 0 },
            total: 1,
            total_received: 48000,
            overdue_count: 0,
          },
        },
      })
    } else if (url.includes('/finance/payments/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [
              { id: 1, code: 'PAY-2026-001', client: '某化妆品公司', amount: 48000, status: 'received', received_date: '2026-03-01' },
            ],
            total: 1,
          },
        },
      })
    } else {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    }
  })
}

test.describe('财务台 — 发票回款流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupFinanceAuth(page)
  })

  test('3.1 发票管理页面可访问', async ({ page }) => {
    await page.goto('/finance/#/invoices')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('发票管理').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('3.2 开票申请标签可见', async ({ page }) => {
    await page.goto('/finance/#/invoices')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await expect(page.getByText('开票申请').first()).toBeVisible()
    await expect(page.getByText('客户管理').first()).toBeVisible()
  })

  test('3.3 切到发票管理标签可见新建按钮', async ({ page }) => {
    await page.goto('/finance/#/invoices')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await page.getByRole('tab', { name: '发票管理' }).click()
    await page.waitForTimeout(800)
    await expect(page.getByRole('button', { name: /新建发票|新建/ }).first()).toBeVisible()
  })
})
