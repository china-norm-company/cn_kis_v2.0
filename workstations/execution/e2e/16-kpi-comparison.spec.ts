/**
 * 场景 16: KPI 对比分析 — 对比模式切换与维度选择
 *
 * AC-P3-2: KPI 页面可选择对比维度，展示双项对比图表
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景16: KPI 对比分析', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')
  })

  test('16.1 分析页面应显示 KPI 绩效 Tab', async ({ page }) => {
    await expect(page.getByText('KPI绩效')).toBeVisible()
  })

  test('16.2 切换到 KPI 绩效 Tab 应显示对比模式按钮', async ({ page }) => {
    await page.getByText('KPI绩效').click()
    await expect(page.getByTestId('compare-mode-toggle')).toBeVisible()
    await expect(page.getByTestId('compare-mode-toggle')).toContainText('对比模式')
  })

  test('16.3 点击对比模式应展开维度选择', async ({ page }) => {
    await page.getByText('KPI绩效').click()
    await page.getByTestId('compare-mode-toggle').click()
    await expect(page.getByTestId('compare-dim-person')).toBeVisible()
    await expect(page.getByTestId('compare-dim-project')).toBeVisible()
    await expect(page.getByTestId('compare-dim-period')).toBeVisible()
  })

  test('16.4 选择按项目维度应显示项目选择器', async ({ page }) => {
    await page.getByText('KPI绩效').click()
    await page.getByTestId('compare-mode-toggle').click()
    await page.getByTestId('compare-dim-project').click()
    await expect(page.getByTestId('compare-project-a')).toBeVisible()
    await expect(page.getByTestId('compare-project-b')).toBeVisible()
  })

  test('16.5 告警配置 Tab 应可切换', async ({ page }) => {
    await expect(page.getByText('告警配置')).toBeVisible()
    await page.getByText('告警配置').click()
    await expect(page.getByTestId('alert-config-panel')).toBeVisible()
  })
})
