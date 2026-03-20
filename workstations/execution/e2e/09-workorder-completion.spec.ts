/**
 * 场景 9：工单完成流程（检查清单阻断 + 完成 + 质量审计）
 *
 * 验收项：
 * ✓ AC-5: 必做检查项未完成时"完成工单"按钮禁用
 * ✓ AC-6: 开始执行 -> 完成 -> 质量审计全流程可通
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景9: 工单完成流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc')
  })

  test('9.1 必做检查项未完成时完成按钮应禁用', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('S-001 皮肤水分测试')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('进行中')).toBeVisible()

    const completeBtn = page.getByRole('button', { name: '完成工单' })
    await expect(completeBtn).toBeVisible()
    await expect(completeBtn).toBeDisabled()
  })

  test('9.2 检查清单应显示所有检查项', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('操作检查清单')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('确认受试者身份')).toBeVisible()
    await expect(page.getByText('检查设备校准状态')).toBeVisible()
    await expect(page.getByText('确认环境温湿度达标')).toBeVisible()
    await expect(page.getByText('记录受试者不适主诉（如有）')).toBeVisible()
  })

  test('9.3 必做项应有必须标识', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('操作检查清单')).toBeVisible({ timeout: 10000 })

    const mandatoryBadges = page.getByText('必须')
    const count = await mandatoryBadges.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('9.4 勾选所有检查项后完成按钮应启用', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('操作检查清单')).toBeVisible({ timeout: 10000 })

    const checkItems = page.locator('.bg-white.rounded-xl').filter({ hasText: '操作检查清单' }).locator('button').filter({ hasNotText: '查看全部' })
    const itemCount = await checkItems.count()

    for (let i = 0; i < itemCount; i++) {
      const item = checkItems.nth(i)
      const isDisabled = await item.isDisabled()
      if (!isDisabled) {
        await item.click()
        await page.waitForTimeout(500)
      }
    }

    const completeBtn = page.getByRole('button', { name: '完成工单' })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
  })

  test('9.5 点击完成工单后应更新状态', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('操作检查清单')).toBeVisible({ timeout: 10000 })

    const checkItems = page.locator('.bg-white.rounded-xl').filter({ hasText: '操作检查清单' }).locator('button').filter({ hasNotText: '查看全部' })
    const itemCount = await checkItems.count()

    for (let i = 0; i < itemCount; i++) {
      const item = checkItems.nth(i)
      const isDisabled = await item.isDisabled()
      if (!isDisabled) {
        await item.click()
        await page.waitForTimeout(500)
      }
    }

    const completeBtn = page.getByRole('button', { name: '完成工单' })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    await expect(page.getByText('已完成').first()).toBeVisible({ timeout: 5000 })
  })

  test('9.6 质量审计区域应展示', async ({ page }) => {
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('质量审计')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('自动通过')).toBeVisible()
  })

  test('9.7 已完成工单的完成按钮不应显示', async ({ page }) => {
    await page.route(/\/api\/v1\/workorder\/203$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: {
          code: 0, msg: 'ok', data: {
            id: 203, title: 'S-005 色素/红斑测试', status: 'completed',
            work_order_type: 'detection',
            scheduled_date: new Date().toISOString().split('T')[0],
            assigned_to: 4, protocol_title: 'WH-2026-002',
            create_time: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          },
        } })
      } else {
        await route.continue()
      }
    })

    await page.goto('/execution/#/workorders/203')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('已完成').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: '完成工单' })).not.toBeVisible()
  })
})
