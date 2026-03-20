/**
 * 场景 13: 审批流程 — 待决策项快捷审批 + 工单审批状态展示
 *
 * AC-P2-3: 待决策事项可提交审批，工单详情页展示审批状态
 * AC-P3-3: 待决策事项可直接批准/拒绝，操作后列表刷新
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景13: 审批流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
  })

  test('13.1 待决策区域应显示批准/拒绝按钮', async ({ page }) => {
    await expect(page.getByTestId('approve-btn-301')).toBeVisible()
    await expect(page.getByTestId('reject-btn-301')).toBeVisible()
  })

  test('13.2 点击批准按钮应弹出确认 Modal', async ({ page }) => {
    await page.getByTestId('approve-btn-301').click()
    await expect(page.getByText('批准确认')).toBeVisible()
    await expect(page.getByPlaceholder('备注（可选）')).toBeVisible()
    await expect(page.getByRole('button', { name: '确认批准' })).toBeVisible()
  })

  test('13.3 点击拒绝按钮应弹出确认 Modal', async ({ page }) => {
    await page.getByTestId('reject-btn-301').click()
    await expect(page.getByText('拒绝确认')).toBeVisible()
    await expect(page.getByRole('button', { name: '确认拒绝' })).toBeVisible()
  })

  test('13.4 确认批准后 Modal 应关闭', async ({ page }) => {
    await page.getByTestId('approve-btn-301').click()
    await page.getByRole('button', { name: '确认批准' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText('批准确认')).not.toBeVisible()
  })

  test('13.5 确认拒绝后 Modal 应关闭', async ({ page }) => {
    await page.getByTestId('reject-btn-301').click()
    await page.getByRole('button', { name: '确认拒绝' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText('拒绝确认')).not.toBeVisible()
  })

  test('13.6 取消按钮应关闭审批 Modal', async ({ page }) => {
    await page.getByTestId('approve-btn-301').click()
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText('批准确认')).not.toBeVisible()
  })
})

test.describe('场景13b: 工单审批状态展示', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
  })

  test('13.7 review 状态工单应显示审批中徽章', async ({ page }) => {
    await page.route(/\/api\/v1\/workorder\/\d+$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { code: 0, msg: 'ok', data: {
          id: 301, title: '测试工单', status: 'review',
          work_order_type: 'detection', create_time: new Date().toISOString(),
          update_time: new Date().toISOString(),
        } } })
      } else {
        await route.continue()
      }
    })
    await page.goto('/execution/#/workorders/301')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('审批中')).toBeVisible()
  })
})
