/**
 * 场景 15: 产能预测 — 排程专员查看产能预测
 *
 * AC-P3-1: 排程专员可查看产能预测（预计完成日期、瓶颈资源）
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景15: 产能预测', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'scheduler')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('15.1 排程专员仪表盘应显示产能预测按钮', async ({ page }) => {
    await expect(page.getByTestId('prediction-toggle')).toBeVisible()
    await expect(page.getByTestId('prediction-toggle')).toContainText('产能预测')
  })

  test('15.2 点击产能预测按钮应展开预测面板', async ({ page }) => {
    await page.getByTestId('prediction-toggle').click()
    await expect(page.getByTestId('prediction-panel')).toBeVisible()
    await expect(page.getByRole('combobox', { name: '选择排程计划' })).toBeVisible()
  })

  test('15.3 再次点击应收起预测面板', async ({ page }) => {
    await page.getByTestId('prediction-toggle').click()
    await expect(page.getByTestId('prediction-panel')).toBeVisible()
    await page.getByTestId('prediction-toggle').click()
    await expect(page.getByTestId('prediction-panel')).not.toBeVisible()
  })
})
