import { expect, test, type Page } from '@playwright/test'

async function mockHomeApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()

    if (url.includes('/api/v1/visit/nodes')) {
      return route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            items: [
              { id: 1, name: 'V1 首访', plan_id: 1, baseline_day: 0, window_before: 0, window_after: 1, status: 'completed', order: 1 },
              { id: 2, name: 'V2 复访', plan_id: 1, baseline_day: 7, window_before: 1, window_after: 2, status: 'active', order: 2 },
            ],
          },
        },
      })
    }

    if (url.includes('/api/v1/my/queue-position')) {
      return route.fulfill({
        json: { code: 200, msg: 'OK', data: { position: 3, ahead_count: 2, wait_minutes: 15, status: 'waiting', checkin_time: '10:30' } },
      })
    }

    return route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [] } } })
  })
}

test.describe('首页动画专项验收（Headed）', () => {
  test('首页首屏渲染 HeroBrandAnimation（APNG/GIF 版）', async ({ page }) => {
    await mockHomeApis(page)

    // 首屏：首页大尺寸动画（基于 utest.mp4 的 APNG/GIF）
    await page.goto('/#/pages/index/index')
    const guestHero = page.locator('.hero-brand').first()
    await expect(guestHero).toBeVisible()
    await expect(page.locator('.hero-brand__img').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/ui-audit/index-hero-component.png', fullPage: true })
  })
})
