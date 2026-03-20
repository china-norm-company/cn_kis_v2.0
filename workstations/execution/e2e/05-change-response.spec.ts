/**
 * 场景 5：变更应对 — 方案变更响应与CRC决策记录
 *
 * 业务目标：
 * ✓ 主管仪表盘能看到变更类待处理决策
 * ✓ 变更响应记录包含来源、描述、影响
 * ✓ CRC决策日志包含标题、描述、依据
 * ✓ 数据在不同页面间保持一致
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景5: 变更应对', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
  })

  test('5.1 主管仪表盘应显示变更相关待决策', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('待处理决策')).toBeVisible()
    await expect(page.getByText('保湿项目方案修订响应')).toBeVisible()
  })

  test('5.2 变更响应记录应包含完整信息', async ({ page }) => {
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')

    await page.getByText('执行上下文').click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('变更响应记录')).toBeVisible()

    // 变更来源
    await expect(page.getByText('protocol_amendment')).toBeVisible()
    // 变更描述
    await expect(page.getByText('增加TEWL检测时间点')).toBeVisible()
    // 影响评估
    await expect(page.getByText('增加每位受试者约10分钟')).toBeVisible()
    // 状态
    await expect(page.getByText('completed')).toBeVisible()
  })

  test('5.3 CRC决策日志应包含决策依据', async ({ page }) => {
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')

    await page.getByText('执行上下文').click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('CRC决策日志')).toBeVisible()
    await expect(page.getByText('受试者S-012排程调整')).toBeVisible()
    await expect(page.getByText('因受试者请假，将访视推迟至下周一')).toBeVisible()
    // 依据
    await expect(page.getByText(/依据：.*访视窗口期/)).toBeVisible()
  })

  test('5.4 仪表盘和上下文的变更信息一致', async ({ page }) => {
    // 仪表盘
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('保湿项目方案修订响应')).toBeVisible()

    // 项目上下文
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')
    await page.getByText('执行上下文').click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('增加TEWL检测时间点')).toBeVisible()
  })
})
