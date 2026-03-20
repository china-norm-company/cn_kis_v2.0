/**
 * 财务台 E2E — spec 02: 报价合同核心链路
 *
 * 场景：管仲（财务台）的报价管理员登录后查看报价列表、创建报价，查看合同列表
 * 验证目标：页面可访问、统计卡可见、列表渲染正常、新建按钮存在
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'finance-e2e-token-02'
const AUTH_USER = {
  id: 10,
  username: 'finance_manager_02',
  display_name: '财务经理-测试',
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
        permissions: [
          'finance.read', 'finance.write', 'finance.quote.read', 'finance.quote.create',
          'finance.contract.read', 'finance.contract.create',
        ],
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
          code: 200, msg: 'ok', data: {
            account: AUTH_USER,
            permissions: ['finance.read', 'finance.write', 'finance.quote.read', 'finance.contract.read'],
          },
        },
      })
    } else if (url.includes('/finance/quotes/stats')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            by_status: { draft: 1, sent: 1, accepted: 0, rejected: 0 },
            total: 2,
          },
        },
      })
    } else if (url.includes('/finance/quotes/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [
              { id: 1, code: 'QT-2026-001', project: '化妆品A功效评价', client: '某化妆品公司', total_amount: 50000, status: 'draft', created_at: '2026-01-15', valid_until: '2026-06-30' },
              { id: 2, code: 'QT-2026-002', project: '防晒产品SPF测试', client: '某品牌公司', total_amount: 30000, status: 'sent', created_at: '2026-02-01', valid_until: '2026-05-31' },
            ],
            total: 2,
          },
        },
      })
    } else if (url.includes('/finance/contracts/list')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'ok', data: {
            items: [
              { id: 1, code: 'CT-2026-001', project: '化妆品A功效评价', client: '某化妆品公司', amount: 48000, status: 'active', start_date: '2026-01-01', end_date: '2026-12-31' },
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

test.describe('财务台 — 报价合同核心链路', () => {
  test.beforeEach(async ({ page }) => {
    await setupFinanceAuth(page)
  })

  test('2.1 报价管理页面可访问且显示 h1 标题', async ({ page }) => {
    await page.goto('/finance/#/quotes')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('报价管理').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('2.2 报价统计数据正常渲染', async ({ page }) => {
    await page.goto('/finance/#/quotes')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 统计卡应该有数字（不是空/错误状态）
    await expect(page.getByText('报价总数').first()).toBeVisible()
    await expect(page.getByText('待回复').first()).toBeVisible()
  })

  test('2.3 报价列表展示报价编号', async ({ page }) => {
    await page.goto('/finance/#/quotes')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // 报价编号在表格中可见
    await expect(page.locator('body')).toContainText('QT-2026-001')
    await expect(page.locator('body')).toContainText('QT-2026-002')
  })

  test('2.4 报价列表有新建报价按钮', async ({ page }) => {
    await page.goto('/finance/#/quotes')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByRole('button', { name: /新建报价/ }).first()).toBeVisible()
  })

  test('2.5 合同管理页面可访问', async ({ page }) => {
    await page.goto('/finance/#/contracts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByText('合同管理').first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('页面出现异常')
  })

  test('2.6 合同列表展示合同编号', async ({ page }) => {
    await page.goto('/finance/#/contracts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.locator('body')).toContainText('CT-2026-001')
  })
})
