/**
 * 场景 17: 快捷审批 — CRC主管内联批准/拒绝待决策项
 *
 * AC-P3-3: 待决策事项可直接批准/拒绝，操作后列表刷新
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景17: 快捷审批', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('17.1 每个待决策项应有批准和拒绝按钮', async ({ page }) => {
    await expect(page.getByTestId('approve-btn-301')).toBeVisible()
    await expect(page.getByTestId('reject-btn-301')).toBeVisible()
    await expect(page.getByTestId('approve-btn-302')).toBeVisible()
    await expect(page.getByTestId('reject-btn-302')).toBeVisible()
  })

  test('17.2 批准确认 Modal 应包含备注输入', async ({ page }) => {
    await page.getByTestId('approve-btn-301').click()
    await expect(page.getByPlaceholder('备注（可选）')).toBeVisible()
  })

  test('17.3 输入备注后确认批准应关闭 Modal', async ({ page }) => {
    await page.getByTestId('approve-btn-301').click()
    await page.getByPlaceholder('备注（可选）').fill('同意调整')
    await page.getByRole('button', { name: '确认批准' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText('批准确认')).not.toBeVisible()
  })

  test('17.4 拒绝确认后 Modal 应关闭', async ({ page }) => {
    await page.getByTestId('reject-btn-302').click()
    await page.getByPlaceholder('备注（可选）').fill('需要进一步讨论')
    await page.getByRole('button', { name: '确认拒绝' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText('拒绝确认')).not.toBeVisible()
  })
})
