/**
 * P2 低频页面冒烟测试
 * 覆盖：report/history、myqrcode、queue、checkin、nps、withdraw
 * 测试目标：页面能正常渲染，不出现白屏或 JS 崩溃
 */
import { expect, test, type Page } from '@playwright/test'

async function setLoginState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'e2e-mock-token')
    localStorage.setItem('userInfo', JSON.stringify({
      id: '1',
      name: 'E2E测试用户',
      subjectNo: 'SUB-E2E-001',
      subjectId: 1,
      enrollDate: '2026-01-01',
      projectName: 'E2E测试项目',
    }))
  })
}

async function mockMyEndpoints(page: Page) {
  await page.route('**/api/v1/my/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/my/adverse-events')) {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { items: [], total: 0 } },
      })
    } else if (url.includes('/my/queue-position')) {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { position: 0, wait_minutes: 0, status: 'none' } },
      })
    } else if (url.includes('/my/nps')) {
      await route.fulfill({
        json: { code: 200, msg: '感谢您的反馈', data: { id: 1, score: 8 } },
      })
    } else if (url.includes('/my/withdraw')) {
      await route.fulfill({
        json: { code: 200, msg: '退出申请已提交', data: { status: 'withdrawn' } },
      })
    } else if (url.includes('/qrcode/generate')) {
      await route.fulfill({
        json: {
          code: 200, msg: 'OK',
          data: { qr_data: 'SUB-E2E-001', qr_hash: 'mock', label: '受试者 E2E测试用户' },
        },
      })
    } else {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: {} },
      })
    }
  })
}

test.describe('P2 低频页面冒烟测试', () => {
  test.beforeEach(async ({ page }) => {
    await setLoginState(page)
    await mockMyEndpoints(page)
  })

  test('AE上报历史页可打开并渲染', async ({ page }) => {
    await page.goto('/#/pages/report/history')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })

  test('我的二维码页可打开并渲染', async ({ page }) => {
    await page.goto('/#/pages/myqrcode/index')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('我的二维码', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('排队状态页可打开并渲染', async ({ page }) => {
    await page.goto('/#/pages/queue/index')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })

  test('扫码签到页可打开并显示签到按钮', async ({ page }) => {
    await page.goto('/#/pages/checkin/index')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await expect(
      page.locator('.mini-btn__text').filter({ hasText: '扫码签到 / 签出' }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('NPS评分页可打开并显示评分组件', async ({ page }) => {
    await page.goto('/#/pages/nps/index?plan_id=1')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('提交评分', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('退出研究页可打开并显示警告和退出按钮', async ({ page }) => {
    await page.goto('/#/pages/withdraw/index')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('提交退出申请', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('AE不良反应上报页可打开', async ({ page }) => {
    await page.goto('/#/pages/report/index')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('提交上报', { exact: true })).toBeVisible({ timeout: 10000 })
  })
})

test.describe('P2 静态说明页渲染', () => {
  test('研究类型说明页可打开', async ({ page }) => {
    await page.goto('/#/pages/study-types/index')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })

  test('权益保障页可打开', async ({ page }) => {
    await page.goto('/#/pages/rights/index')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })

  test('FAQ页可打开', async ({ page }) => {
    await page.goto('/#/pages/faq/index')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })
})
