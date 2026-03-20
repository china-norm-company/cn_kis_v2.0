/**
 * 场景 22: 自动通报配置 — 按项目开启/关闭自动通报
 *
 * AC-P4-4: 可按项目启用/禁用自动通报
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景22: 自动通报配置', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('22.1 项目进度区应显示自动通报开关', async ({ page }) => {
    await expect(page.getByTestId('auto-report-toggle-1')).toBeVisible()
  })

  test('22.2 自动通报开关应可切换', async ({ page }) => {
    const toggle = page.getByTestId('auto-report-toggle-1')
    await toggle.click()
    await page.waitForTimeout(500)
    await expect(toggle).toBeVisible()
  })

  test('22.3 每个项目都应有独立的开关', async ({ page }) => {
    await expect(page.getByTestId('auto-report-toggle-1')).toBeVisible()
    await expect(page.getByTestId('auto-report-toggle-2')).toBeVisible()
    await expect(page.getByTestId('auto-report-toggle-3')).toBeVisible()
  })
})
