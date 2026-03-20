/**
 * 场景 14: 进展通报 — CRC主管一键生成并发送进展报告
 *
 * AC-P2-4: 主管仪表盘可预览并发送进展报告
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景14: 进展通报', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('14.1 项目进度区域应显示通报按钮', async ({ page }) => {
    await expect(page.getByTestId('report-btn-1')).toBeVisible()
    await expect(page.getByTestId('report-btn-1')).toContainText('通报')
  })

  test('14.2 点击通报按钮应打开报告预览 Modal', async ({ page }) => {
    await page.getByTestId('report-btn-1').click()
    await expect(page.getByText('进展通报')).toBeVisible()
    const modal = page.locator('.fixed.inset-0')
    await expect(modal.getByText('今日完成')).toBeVisible()
    await expect(modal.getByText('总体完成率')).toBeVisible()
  })

  test('14.3 报告预览应包含亮点和待解决事项', async ({ page }) => {
    await page.getByTestId('report-btn-1').click()
    await expect(page.getByText('亮点')).toBeVisible()
    await expect(page.getByText('HYD-2026-001完成率达到64%')).toBeVisible()
    await expect(page.getByText('待解决')).toBeVisible()
    await expect(page.getByText('1个逾期工单')).toBeVisible()
  })

  test('14.4 报告预览应包含明日预览', async ({ page }) => {
    await page.getByTestId('report-btn-1').click()
    await expect(page.getByText('明日预览')).toBeVisible()
    await expect(page.getByText(/排程 10 项/)).toBeVisible()
  })

  test('14.5 点击发送到飞书按钮应发送报告', async ({ page }) => {
    await page.getByTestId('report-btn-1').click()
    await expect(page.getByRole('button', { name: /发送到飞书/ })).toBeVisible()
    await page.getByRole('button', { name: /发送到飞书/ }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText('进展通报')).not.toBeVisible()
  })

  test('14.6 关闭按钮应关闭 Modal', async ({ page }) => {
    await page.getByTestId('report-btn-1').click()
    await expect(page.getByText('进展通报')).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.getByText('进展通报')).not.toBeVisible()
  })
})
