/**
 * 场景 18: 告警阈值配置 — 配置和管理告警规则
 *
 * AC-P3-4: 可配置告警阈值，风险预警按配置触发
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景18: 告警阈值配置', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')
  })

  test('18.1 应有告警配置 Tab', async ({ page }) => {
    await expect(page.getByText('告警配置')).toBeVisible()
  })

  test('18.2 切换到告警配置应显示配置面板', async ({ page }) => {
    await page.getByText('告警配置').click()
    await expect(page.getByTestId('alert-config-panel')).toBeVisible()
    await expect(page.getByText('告警阈值配置')).toBeVisible()
  })

  test('18.3 应显示新增告警按钮', async ({ page }) => {
    await page.getByText('告警配置').click()
    await expect(page.getByTestId('add-alert-btn')).toBeVisible()
    await expect(page.getByTestId('add-alert-btn')).toContainText('新增告警')
  })

  test('18.4 点击新增应展开表单', async ({ page }) => {
    await page.getByText('告警配置').click()
    await page.getByTestId('add-alert-btn').click()
    await expect(page.getByTestId('add-alert-form')).toBeVisible()
  })

  test('18.5 配置列表应展示已有配置', async ({ page }) => {
    await page.getByText('告警配置').click()
    await expect(page.getByText('工单逾期')).toBeVisible()
    await expect(page.getByText('负载不均')).toBeVisible()
  })
})
