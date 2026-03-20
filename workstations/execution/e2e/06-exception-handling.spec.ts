/**
 * 场景 6：异常处理 — 各角色异常/风险视图差异
 *
 * 业务目标：
 * ✓ CRC主管看到全局风险预警
 * ✓ CRC协调员看到个人最近异常
 * ✓ 排程员看到排程冲突
 * ✓ KPI中异常率正确
 * ✓ 各角色异常信息各有侧重
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景6: 异常处理与韧性', () => {
  test('6.1 CRC主管应看到全局风险预警', async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('风险预警')).toBeVisible()
    await expect(page.getByText('HYD-2026-001 有2个逾期工单')).toBeVisible()
    await expect(page.getByText('工单偏多')).toBeVisible()
  })

  test('6.2 CRC协调员应看到最近异常', async ({ page }) => {
    await setupForRole(page, 'crc')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('最近异常')).toBeVisible()
    await expect(page.getByText('受试者S-010未按时到达')).toBeVisible()
    await expect(page.getByText('medium')).toBeVisible()
  })

  test('6.3 排程员应看到排程冲突', async ({ page }) => {
    await setupForRole(page, 'scheduler')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('排程冲突')).toBeVisible()
    await expect(page.getByText('Corneometer CM825 排程')).toBeVisible()
    await expect(page.getByText('10:00-11:00有重复预约')).toBeVisible()
    await expect(page.getByText('检测室B排程')).toBeVisible()
  })

  test('6.4 KPI中异常率应正确反映', async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'KPI绩效' }).click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('异常发生率')).toBeVisible()
    await expect(page.getByText('3.2%')).toBeVisible()
  })

  test('6.5 CRC主管仪表盘逾期工单数量匹配', async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    // 逾期信息同时出现在项目进度和风险预警中
    await expect(page.getByText('逾期 2')).toBeVisible() // HYD项目逾期2
    await expect(page.getByText('逾期 1')).toBeVisible() // WH项目逾期1
  })

  test('6.6 排程员冲突数量与Badge一致', async ({ page }) => {
    await setupForRole(page, 'scheduler')
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('2 个冲突')).toBeVisible()
    // 两条冲突记录
    await expect(page.getByText('Corneometer CM825 排程')).toBeVisible()
    await expect(page.getByText('检测室B排程')).toBeVisible()
  })
})
