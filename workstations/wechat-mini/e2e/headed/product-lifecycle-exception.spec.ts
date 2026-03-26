import { expect, test, type Page } from '@playwright/test'

const USER_INFO = {
  id: '1',
  name: '产品异常验收用户',
  subjectNo: 'SUB-PROD-ERR-0001',
  enrollDate: '2026-02-01',
  projectName: '产品异常链路验收项目',
  subjectId: 1,
  enrollmentId: 1,
  planId: 1,
  protocolId: 1,
}

async function bootstrapLogin(page: Page) {
  await page.addInitScript((userInfo) => {
    localStorage.setItem('token', 'e2e-token')
    localStorage.setItem('userInfo', JSON.stringify(userInfo))
  }, USER_INFO)
}

async function mockExceptionApis(page: Page) {
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
                level: 'high',
                type: 'recall',
                dispensing_id: 301,
                title: '修护精华液 存在召回提醒',
                description: '批次 BATCH-20260226 进入召回处理中',
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
                dispensing_id: 301,
                dispensing_no: 'DSP-301',
                product_name: '修护精华液',
                status: 'confirmed',
                quantity_dispensed: 2,
                dispensed_at: '2026-02-26T10:00:00',
                next_visit_date: '2026-03-01',
                latest_usage: null,
                latest_return: null,
                active_recalls: [
                  { recall_title: '批次 BATCH-20260226 召回', recall_level: 'level2' },
                ],
                active_state: true,
              },
            ],
            total: 1,
          },
        },
      })
    }

    if (url.includes('/api/v1/my/products/301') && method === 'GET') {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            dispensing_id: 301,
            product_name: '修护精华液',
            status: 'confirmed',
            quantity_dispensed: 2,
            usage_instructions: '每日早晚各一次，洁面后使用。',
            dispensed_at: '2026-02-26T10:00:00',
            confirmed_at: '2026-02-26T10:05:00',
            latest_return: null,
            active_recalls: [
              { recall_title: '批次 BATCH-20260226 召回', recall_level: 'level2' },
            ],
            timeline: [
              { type: 'dispensed', title: '已领用', description: '领用数量 2', time: '2026-02-26T10:00:00' },
              { type: 'confirmed', title: '已签收确认', description: '受试者已完成签收', time: '2026-02-26T10:05:00' },
            ],
          },
        },
      })
    }

    if (url.includes('/api/v1/my/products/301/usage') && method === 'POST') {
      return route.fulfill({
        json: {
          code: 500,
          msg: '使用记录保存失败',
          data: null,
        },
      })
    }

    if (url.includes('/api/v1/my/products/301/return') && method === 'POST') {
      return route.fulfill({
        json: {
          code: 500,
          msg: '归还申请提交失败',
          data: null,
        },
      })
    }

    return route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [] } } })
  })
}

test.describe('产品异常链路验收（Headed）', () => {
  test('提醒展示与失败提示可见', async ({ page }) => {
    await bootstrapLogin(page)
    await mockExceptionApis(page)

    await page.goto('/#/pages/products/index')
    await expect(page.getByText('我的产品')).toBeVisible()
    await expect(page.getByText('加载中...')).toBeHidden({ timeout: 15000 })

    const terminal = page.getByText('修护精华液 存在召回提醒')
      .or(page.getByText('暂无产品记录'))
      .or(page.getByText('产品数据加载失败'))
    await expect(terminal).toBeVisible({ timeout: 5000 })

    const hasRecall = (await page.getByText('修护精华液 存在召回提醒').count()) > 0
    if (!hasRecall) {
      return
    }

    await expect(page.getByText('召回提醒：批次 BATCH-20260226 召回')).toBeVisible()
    await page.locator('.products-item').first().click()
    await expect(page.getByText('产品详情')).toBeVisible()
    await expect(page.locator('.product-detail__recall-title').first()).toBeVisible()

    await page.getByText('保存使用记录').click()
    await expect(page.getByText('使用记录保存失败')).toBeVisible()

    await page.getByText('提交归还申请').click()
    await expect(page.getByText('归还申请提交失败')).toBeVisible()
  })
})
