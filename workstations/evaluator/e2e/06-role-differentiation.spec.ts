/**
 * 场景 6：角色差异化 — 仪器评估 vs 医生评估 vs 技术评估
 *
 * 验证 P1 阶段核心业务补全效果：
 * ✓ 仪器角色看到 QC 面板
 * ✓ 医生角色看到评分入口
 * ✓ 仪器检测面板在执行阶段可见
 * ✓ 电子签名对话框可触发
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'
import { dashboardData } from './helpers/mock-data'

test.describe('P1 角色差异化', () => {
  test('6.1 仪器角色 — Dashboard 显示 QC 快捷入口', async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)

    await page.route('**/api/v1/evaluator/my-dashboard**', async (route) => {
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { ...dashboardData, role: 'instrument_operator' } },
      })
    })

    await page.goto('/evaluator/dashboard')

    await expect(page.locator('text=QC 快捷入口')).toBeVisible()
  })

  test('6.2 医生角色 — Dashboard 显示医学评估快捷', async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)

    await page.route('**/api/v1/evaluator/my-dashboard**', async (route) => {
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { ...dashboardData, role: 'medical_evaluator' } },
      })
    })

    await page.goto('/evaluator/dashboard')

    await expect(page.locator('text=医学评估快捷')).toBeVisible()
    await expect(page.locator('text=待评分工单')).toBeVisible()
  })

  test('6.3 执行阶段 — 仪器检测面板可见', async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)

    await page.goto('/evaluator/execute/101')

    const acceptBtn = page.locator('button:has-text("接受工单")')
    await expect(acceptBtn).toBeVisible({ timeout: 5000 })
    await acceptBtn.click()
    await page.waitForTimeout(500)

    // "3.执行" tab — use the tab label, not the button text
    const executeTab = page.getByRole('button', { name: /^3\./ })
    await executeTab.click()
    await page.waitForTimeout(300)

    await expect(page.locator('text=仪器检测管理')).toBeVisible({ timeout: 5000 })
  })

  test('6.4 检测步骤 — 执行阶段可进入并显示步骤或初始化提示', async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)

    await page.goto('/evaluator/execute/101')

    const acceptBtn = page.locator('button:has-text("接受工单")')
    await expect(acceptBtn).toBeVisible({ timeout: 5000 })
    await acceptBtn.click()
    await page.waitForTimeout(500)

    const executeTab = page.getByRole('button', { name: /^3\./ })
    await executeTab.click()
    await page.waitForTimeout(300)

    // 执行阶段进入后应显示步骤初始化提示或检测面板
    await expect(page.getByText('请先完成准备阶段以初始化执行步骤')).toBeVisible({ timeout: 5000 })
  })

  test('6.5 完成阶段 — 电子签名按钮可见', async ({ page }) => {
    await injectAuth(page)

    // Register setupApiMocks first
    await setupApiMocks(page)

    // Override with custom routes (LIFO: these take priority)
    await page.route('**/api/v1/workorder/*', async (route) => {
      if (route.request().method() === 'GET') {
        const match = route.request().url().match(/workorder\/(\d+)$/)
        if (match) {
          await route.fulfill({
            json: {
              code: 0,
              msg: 'ok',
              data: {
                id: Number(match[1]),
                title: 'Test WO',
                status: 'completed',
                work_order_type: 'detection',
                resources: [],
              },
            },
          })
        } else {
          await route.continue()
        }
      } else {
        await route.continue()
      }
    })

    await page.route('**/api/v1/evaluator/workorders/*/steps', async (route) => {
      if (route.request().method() === 'GET') {
        const allComplete = [
          { id: 1, step_number: 1, step_name: 'Step 1', step_description: '', estimated_duration_minutes: 5, status: 'completed', started_at: null, completed_at: new Date().toISOString(), actual_duration_minutes: 5, execution_data: {}, result: '', skip_reason: '' },
          { id: 2, step_number: 2, step_name: 'Step 2', step_description: '', estimated_duration_minutes: 5, status: 'completed', started_at: null, completed_at: new Date().toISOString(), actual_duration_minutes: 3, execution_data: {}, result: '', skip_reason: '' },
        ]
        await route.fulfill({
          json: { code: 0, msg: 'ok', data: { items: allComplete, total: 2 } },
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // Work order with status='completed' → auto-navigates to complete phase
    const completeTab = page.getByRole('button', { name: /^4\./ })
    await completeTab.click()
    await page.waitForTimeout(500)

    await expect(page.getByRole('button', { name: '电子签名确认' })).toBeVisible({ timeout: 5000 })
  })
})
