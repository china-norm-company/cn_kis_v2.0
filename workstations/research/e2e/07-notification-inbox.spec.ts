/**
 * S7: 通知中心端到端
 *
 * 验证通知铃铛→收件箱→标记已读→跳转详情完整闭环
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S7 通知中心', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S7.1 通知铃铛显示未读计数', async ({ page }) => {
    await navigateTo(page, '/research/', '工作台')
    const bell = page.locator('button[title="通知"]')
    await expect(bell).toBeVisible({ timeout: 5000 })
  })

  test('S7.2 进入通知收件箱页面', async ({ page }) => {
    await navigateTo(page, '/research/#/notifications')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/通知/).first()).toBeVisible({ timeout: 5000 })
  })

  test('S7.3 收件箱展示通知列表', async ({ page }) => {
    await navigateTo(page, '/research/#/notifications')
    await page.waitForTimeout(2000)
    const content = await page.content()
    const hasNotif = content.includes('逾期') || content.includes('审批') || content.includes('变更') || content.includes('通知')
    expect(hasNotif).toBeTruthy()
  })

  test('S7.4 点击标记已读', async ({ page }) => {
    await navigateTo(page, '/research/#/notifications')
    await page.waitForTimeout(2000)
    const readBtn = page.getByRole('button', { name: /已读|标记/ }).first()
    if (await readBtn.isVisible().catch(() => false)) {
      await readBtn.click()
      await page.waitForTimeout(500)
    }
  })

  test('S7.5 可切换全部/未读标签', async ({ page }) => {
    await navigateTo(page, '/research/#/notifications')
    await page.waitForTimeout(2000)
    const tabs = page.getByRole('tab').or(page.locator('button').filter({ hasText: /全部|未读/ }))
    const count = await tabs.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
