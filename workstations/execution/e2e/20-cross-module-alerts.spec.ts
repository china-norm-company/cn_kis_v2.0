/**
 * 场景 20: 跨模块预警聚合 — 风险预警包含多维信息
 *
 * AC-P4-2: 风险预警包含设备/人员/物料/设施多维信息
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景20: 跨模块预警', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('20.1 风险预警区域应展示', async ({ page }) => {
    await expect(page.getByText('风险预警')).toBeVisible()
  })

  test('20.2 应包含工单预警信息', async ({ page }) => {
    await expect(page.getByText(/逾期工单/)).toBeVisible()
  })

  test('20.3 应包含负载预警信息', async ({ page }) => {
    await expect(page.getByText('工单偏多')).toBeVisible()
  })
})
