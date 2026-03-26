import { test, expect, type Page } from '@playwright/test'

const USER_INFO = {
  id: '1',
  name: '验收用户',
  subjectNo: 'SUB-ACC-0001',
  enrollDate: '2026-02-01',
  projectName: '受试者全生命周期验证项目',
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

test.describe('微信小程序 Headed 验收（问题导向）', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapLogin(page)

    await page.route('**/api/v1/my/queue-position', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { position: 0, wait_minutes: 0, status: 'none' } } })
    })

    await page.route('**/api/v1/visit/nodes**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [] } } })
    })
  })

  test('A1 关键入口可达且无明显占位文案', async ({ page }) => {
    await page.goto('/#/pages/index/index')
    await expect(page.getByText('微信快捷登录').first()).toBeVisible()
    await expect(page.getByText('TODO')).toHaveCount(0)
    await expect(page.getByText('待实现')).toHaveCount(0)
  })

  test('A2 依从性页面应正确消费后端字段', async ({ page }) => {
    await page.route('**/api/v1/my/compliance', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            latest_score: 92,
            latest_rating: '良好',
            history: [{ id: 1, overall_score: 92, rating: '良好', evaluation_date: '2026-02-22' }],
          },
        },
      })
    })

    await page.goto('/#/pages/compliance/index')
    await expect(page.getByText('依从性反馈')).toBeVisible()
    await expect(page.getByText('92分')).toBeVisible()
    await expect(page.getByText('良好').first()).toBeVisible()
  })

  test('A3 检测结果页应展示后端返回的完成时间', async ({ page }) => {
    await page.route('**/api/v1/my/results', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            items: [{ id: 1, template_name: 'V1 皮肤检测', completed_at: '2026-02-22T09:30:00' }],
          },
        },
      })
    })

    await page.goto('/#/pages/results/index')
    await expect(page.getByText('V1 皮肤检测')).toBeVisible()
    await expect(page.getByText(/2026-02-22/)).toBeVisible()
  })

  test('A4 样品签收应有可达入口（避免隐藏未验收功能）', async ({ page }) => {
    await page.goto('/#/pages/sample-confirm/index')
    await expect(page.getByText('产品签收确认')).toBeVisible()
    await expect(page.getByText('确认签收')).toBeVisible()
  })
})
