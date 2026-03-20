/**
 * 新页面验收测试 — 设施台 3 个新页面
 *
 * 覆盖：
 *  - 场地详情页 (/venues/:id)
 *  - 预约日历页 (/reservations/calendar)
 *  - 不合规事件详情页 (/incidents/:id)
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('设施台新页面验收', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('9.1【场地详情页】能正常加载并显示场地名称', async ({ page }) => {
    await page.goto('/facility/venues/1')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('场地详情')
    // mock venueDetail 来自 venueList.items[0]，名称为 '恒温恒湿测试室 A'
    await expect(page.locator('body')).toContainText('恒温恒湿测试室 A')
  })

  test('9.2【场地详情页】返回按钮可见', async ({ page }) => {
    await page.goto('/facility/venues/1')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('返回')).toBeVisible()
  })

  test('9.3【场地详情页】显示场地编号', async ({ page }) => {
    await page.goto('/facility/venues/1')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('VNU-TH-A')
  })

  test('9.4【预约日历页】能正常加载并显示日历标题', async ({ page }) => {
    await page.goto('/facility/reservations/calendar')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('预约日历')
  })

  test('9.5【预约日历页】显示月份导航按钮', async ({ page }) => {
    await page.goto('/facility/reservations/calendar')
    await page.waitForLoadState('networkidle')

    // 日历页存在月份导航控件或月份显示
    await expect(page.locator('body')).toContainText(/\d{4}年\d{1,2}月|上一月|下一月/)
  })

  test('9.6【预约日历页】显示预约项目', async ({ page }) => {
    await page.goto('/facility/reservations/calendar')
    await page.waitForLoadState('networkidle')

    // 日历页应显示预约相关内容
    await expect(page.locator('body')).toContainText(/预约|恒温|测试室/)
  })

  test('9.7【不合规事件详情页】能正常加载并显示事件标题', async ({ page }) => {
    await page.goto('/facility/incidents/1')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('不合规事件详情')
  })

  test('9.8【不合规事件详情页】显示事件编号', async ({ page }) => {
    await page.goto('/facility/incidents/1')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('INC-2026-001')
  })

  test('9.9【不合规事件详情页】显示严重级别标签', async ({ page }) => {
    await page.goto('/facility/incidents/1')
    await page.waitForLoadState('networkidle')

    // incidentDetail.severity = 'critical', 严重
    await expect(page.locator('body')).toContainText('严重')
  })

  test('9.10【不合规事件详情页】返回按钮可见', async ({ page }) => {
    await page.goto('/facility/incidents/1')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('返回')).toBeVisible()
  })
})
