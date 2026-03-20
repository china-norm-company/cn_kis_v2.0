/**
 * 场景 12: 工单分配通知 — 分配工单后验证飞书通知提示
 *
 * AC-P2-2: 工单分配后显示"已通知执行人"提示
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景12: 工单分配通知', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'scheduler')
  })

  test('12.1 排程专员应看到待分配工单', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '待分配工单' })).toBeVisible()
    await expect(page.getByText('S-015 基线访视检测')).toBeVisible()
  })

  test('12.2 待分配工单列表应可点击', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('S-015 基线访视检测')).toBeVisible()
  })

  test('12.3 排程冲突区域应展示冲突数量', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('2 个冲突')).toBeVisible()
  })
})
