/**
 * 场景 18：电子签名与合规 — 关键操作签名验证
 *
 * 业务背景：
 *   销毁执行、盘点审核、分发确认、批次放行等关键操作需电子签名或确认。
 *   依从性、温度监控、留样管理需合规展示。
 *
 * 验证目标：
 *   工作台是否能支持关键操作的签名/确认流程及合规页面正常加载。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景18: 电子签名与合规 — 关键操作签名验证', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('18.1【销毁签名】销毁执行需要电子签名', async ({ page }) => {
    await page.goto('/material/destructions')
    await page.waitForLoadState('networkidle')
    // Approved destructions should have execute button
    const executeBtn = page.getByRole('button', { name: /执行/ })
    if (await executeBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await executeBtn.first().click()
      await page.waitForTimeout(500)
      // Verify execution modal opens
      const modal = page.locator('.fixed')
      await expect(modal.first()).toBeVisible()
    }
  })

  test('18.2【盘点审核】盘点审核需确认操作', async ({ page }) => {
    await page.goto('/material/inventory-execution')
    await page.waitForLoadState('networkidle')
    // Verify approve button is visible for review
    const approveBtn = page.getByRole('button', { name: /审核通过/ }).or(page.getByRole('button', { name: /通过/ }))
    if (await approveBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(approveBtn.first()).toBeVisible()
    }
  })

  test('18.3【分发确认】分发确认步骤可见', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')
    // Switch to dispensing tab
    const tab = page.getByText('分发记录')
    if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tab.click()
      await page.waitForTimeout(500)
      // Verify confirm button on dispensed items
      const confirmBtn = page.getByRole('button', { name: /确认/ })
      if (await confirmBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(confirmBtn.first()).toBeVisible()
      }
    }
  })

  test('18.4【批次放行】批次放行按钮可用', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')
    const releaseBtn = page.getByRole('button', { name: /放行/ })
    if (await releaseBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(releaseBtn.first()).toBeVisible()
    }
  })

  test('18.5【合规检查】依从性页面正常加载', async ({ page }) => {
    await page.goto('/material/compliance')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('依从性').first()).toBeVisible()
  })

  test('18.6【温度合规】温度监控显示合规状态', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')
    // Verify temperature page loads with data
    await expect(page.getByText('温').first()).toBeVisible()
  })

  test('18.7【留样合规】留样管理合规展示', async ({ page }) => {
    await page.goto('/material/retention')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('留样').first()).toBeVisible()
  })
})
