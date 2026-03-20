import { test, expect, type Page } from '@playwright/test'

const AUTH_USER = { id: 3, name: '质量主管', role: 'qa_manager' }
const AUTH_TOKEN = 'test-token-quality-writeback'

async function setupQualityAuth(page: Page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('auth_profile', JSON.stringify({
      code: 200, msg: 'ok',
      data: { account: user, permissions: ['quality.deviation.read', 'quality.deviation.write', 'quality.capa.create'] },
    }))
  }, { token: AUTH_TOKEN, user: AUTH_USER })

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: AUTH_USER, permissions: ['quality.deviation.read', 'quality.deviation.write', 'quality.capa.create'] } } })
  })
}

test.describe('质量台：偏差到 CAPA 草稿写回', () => {
  test.beforeEach(async ({ page }) => {
    await setupQualityAuth(page)
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/auth/profile')) return
      if (url.includes('/quality/deviations/1/create-capa-draft')) {
        const body = route.request().postDataJSON()
        expect(body.title).toContain('DEV-2026-001')
        await route.fulfill({ json: { code: 200, msg: 'OK', data: { id: 99, code: 'CAPA-DEV-2026-001-01' } } })
        return
      }
      if (url.includes('/quality/deviations/1')) {
        await route.fulfill({
          json: {
            code: 200,
            msg: 'ok',
            data: {
              id: 1,
              code: 'DEV-2026-001',
              title: 'TEWL仪器读数异常',
              category: '设备偏差',
              severity: 'critical',
              status: 'investigating',
              reporter: '张评估员',
              reported_at: '2026-03-01',
              project: 'HYD-2026-001',
              description: '检测时读数异常波动',
              root_cause: '',
              resolution: '',
              closed_at: null,
              create_time: new Date().toISOString(),
              update_time: new Date().toISOString(),
              capas: [],
              timeline: [],
            },
          },
        })
        return
      }
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { items: [], total: 0 } } })
    })
  })

  test('用户可在偏差详情页一键创建 CAPA 草稿', async ({ page }) => {
    let called = false
    await page.route('**/api/v1/quality/deviations/1/create-capa-draft', async (route) => {
      called = true
      const body = route.request().postDataJSON()
      expect(body.title).toContain('DEV-2026-001')
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { id: 99, code: 'CAPA-DEV-2026-001-01' } } })
    })
    await page.goto('/quality/#/deviations/1')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('建议为该偏差创建 CAPA')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: '创建 CAPA 草稿' }).click()
    await expect.poll(() => called).toBeTruthy()
  })
})
