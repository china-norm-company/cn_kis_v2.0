import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('研究台：协议解析写回', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)

    await page.route('**/api/v1/protocol/1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            code: 200,
            msg: 'OK',
            data: {
              id: 1,
              title: '保湿功效评价协议',
              code: 'HYD-2026-001',
              file_path: '/tmp/protocol.pdf',
              status: 'parsed',
              parsed_data: {
                sponsor: '测试申办方',
                sample_size: { planned: 60 },
                inclusion_criteria: ['18-70 岁', 'HbA1c 7.5%-10.0%'],
                visits: [{ visit_code: 'V1' }],
              },
              efficacy_type: 'superiority',
              sample_size_value: 60,
              create_time: new Date().toISOString(),
              update_time: new Date().toISOString(),
            },
          },
        })
      } else {
        await route.fulfill({ json: { code: 200, msg: 'OK', data: {} } })
      }
    })

    await page.route('**/api/v1/protocol/1/accept-parsed', async (route) => {
      const body = route.request().postDataJSON()
      expect(body.parsed_data.sponsor).toBe('测试申办方')
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { protocol_id: 1, status: 'parsed' } } })
    })
  })

  test('用户可在协议详情页一键采纳解析结果写入协议', async ({ page }) => {
    await navigateTo(page, '/research/#/protocols/1', '保湿功效评价协议')
    await expect(page.getByText('解析结果已就绪，可采纳写入协议')).toBeVisible()
    await page.getByRole('button', { name: '采纳写入协议' }).click()
    await expect(page.getByText('AI 解析结果')).toBeVisible()
  })
})
