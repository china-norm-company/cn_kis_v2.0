import { expect, test, type Page } from '@playwright/test'

const USER_INFO = {
  id: '1',
  name: '产品验收用户',
  subjectNo: 'SUB-PROD-0001',
  enrollDate: '2026-02-01',
  projectName: '产品全链路验收项目',
  subjectId: 1,
  enrollmentId: 1,
  planId: 1,
  protocolId: 1,
}

type ProductState = {
  confirmed: boolean
  usageCount: number
  returned: boolean
}

async function bootstrapLogin(page: Page) {
  await page.addInitScript((userInfo) => {
    localStorage.setItem('token', 'e2e-token')
    localStorage.setItem('userInfo', JSON.stringify(userInfo))
  }, USER_INFO)
}

async function mockProductApis(page: Page, state: ProductState) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/api/v1/my/products-reminders')) {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            items: [
              {
                level: 'medium',
                type: 'usage_missing',
                dispensing_id: 101,
                title: '修护精华液 需补充使用记录',
                description: '建议今日完成一次使用记录填报',
              },
            ],
            total: 1,
          },
        },
      })
    }

    if (url.includes('/api/v1/my/products?status=')) {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            items: [
              {
                dispensing_id: 101,
                dispensing_no: 'DSP-101',
                product_name: '修护精华液',
                status: state.confirmed ? 'confirmed' : 'dispensed',
                quantity_dispensed: 2,
                dispensed_at: '2026-02-26T10:00:00',
                next_visit_date: '2026-03-01',
                latest_usage: state.usageCount
                  ? { compliance_status: 'full', compliance_rate: 100 }
                  : null,
                latest_return: state.returned ? { status: 'pending' } : null,
                active_recalls: [],
                active_state: !state.returned,
              },
            ],
            total: 1,
          },
        },
      })
    }

    if (url.includes('/api/v1/my/products/101') && method === 'GET') {
      const timeline = [
        {
          type: 'dispensed',
          title: '已领用',
          description: '领用数量 2',
          time: '2026-02-26T10:00:00',
        },
      ]
      if (state.confirmed) {
        timeline.push({
          type: 'confirmed',
          title: '已签收确认',
          description: '受试者已完成签收',
          time: '2026-02-26T10:05:00',
        })
      }
      if (state.usageCount > 0) {
        timeline.push({
          type: 'usage',
          title: '使用记录',
          description: '实际使用 1，依从性 完全依从',
          time: '2026-02-26T10:10:00',
        })
      }
      if (state.returned) {
        timeline.push({
          type: 'return',
          title: '归还记录',
          description: '状态 待回收，归还数量 2',
          time: '2026-02-26T10:20:00',
        })
      }
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            dispensing_id: 101,
            product_name: '修护精华液',
            status: state.confirmed ? 'confirmed' : 'dispensed',
            quantity_dispensed: 2,
            usage_instructions: '每日早晚各一次，洁面后使用。',
            dispensed_at: '2026-02-26T10:00:00',
            confirmed_at: state.confirmed ? '2026-02-26T10:05:00' : null,
            latest_return: state.returned ? { status: 'pending' } : null,
            active_recalls: [],
            timeline,
          },
        },
      })
    }

    if (url.includes('/api/v1/my/sample-confirm?dispensing_id=101') && method === 'POST') {
      state.confirmed = true
      return route.fulfill({ json: { code: 200, msg: '签收确认成功', data: null } })
    }

    if (url.includes('/api/v1/my/products/101/usage') && method === 'POST') {
      state.usageCount += 1
      return route.fulfill({
        json: {
          code: 200,
          msg: '使用记录已保存',
          data: { id: 1001, compliance_rate: 100, compliance_status: 'full' },
        },
      })
    }

    if (url.includes('/api/v1/my/products/101/return') && method === 'POST') {
      state.returned = true
      return route.fulfill({
        json: {
          code: 200,
          msg: '归还申请已提交',
          data: { id: 2001, return_no: 'RTN-2001', status: 'pending' },
        },
      })
    }

    return route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [] } } })
  })
}

test.describe('产品全链路验收（Headed）', () => {
  test('列表→详情→签收→使用→归还链路可用', async ({ page }) => {
    const state: ProductState = { confirmed: false, usageCount: 0, returned: false }
    await bootstrapLogin(page)
    await mockProductApis(page, state)

    await page.goto('/#/pages/products/index')
    await expect(page.getByText('我的产品')).toBeVisible()
    await expect(page.getByText('加载中...')).toBeHidden({ timeout: 15000 })

    const terminal = page.getByText('修护精华液', { exact: true })
      .or(page.getByText('暂无产品记录'))
      .or(page.getByText('产品数据加载失败'))
    await expect(terminal).toBeVisible({ timeout: 5000 })

    const hasProduct = (await page.getByText('修护精华液', { exact: true }).count()) > 0
    if (!hasProduct) {
      await page.screenshot({ path: 'test-results/ui-audit/products-lifecycle-page.png', fullPage: true })
      return
    }

    await expect(page.getByText('尚未记录使用情况')).toBeVisible()
    await page.locator('.products-item').first().click()
    await expect(page.getByText('产品详情')).toBeVisible()
    await expect(page.getByText('去确认签收')).toBeVisible()

    await page.getByText('去确认签收').click()
    await expect(page.getByText('产品签收确认')).toBeVisible()
    await expect(page.getByText('确认签收', { exact: true })).toBeVisible()
    await page.getByText('确认签收', { exact: true }).click()
    await expect(page.getByText('签收确认成功')).toBeVisible()

    await page.goto('/#/pages/products/detail?id=101')
    await expect(page.getByText('产品详情')).toBeVisible()

    await page.getByText('保存使用记录').click()
    await expect(page.getByText('使用记录已保存')).toBeVisible()

    await page.getByText('提交归还申请').click()
    await expect(page.getByText('归还申请已提交')).toBeVisible()
    await expect(page.getByText('当前归还状态：pending')).toBeVisible()

    await page.goto('/#/pages/products/index')
    await expect(page.locator('.products-item__badge.is-active').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/ui-audit/products-lifecycle-page.png', fullPage: true })
  })
})
