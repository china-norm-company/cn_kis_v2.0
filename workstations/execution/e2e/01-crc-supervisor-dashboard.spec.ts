/**
 * 场景 1：CRC主管仪表盘 — 全局项目掌控与团队管理
 *
 * 业务目标：
 * ✓ CRC主管登录后看到"多项目交付指挥中心"
 * ✓ 清楚了解项目交付进度
 * ✓ CRC团队负载一目了然
 * ✓ 待处理决策事项清晰
 * ✓ 风险预警醒目
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景1: CRC主管仪表盘', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
  })

  test('1.1 主管登录后应看到多项目交付指挥中心', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('多项目交付指挥中心')).toBeVisible()
    await expect(page.getByText('CRC主管 — 全局项目交付监控与团队管理')).toBeVisible()
  })

  test('1.2 应显示KPI概览卡片', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('总工单数')).toBeVisible()
    await expect(page.getByText('今日排程')).toBeVisible()
    await expect(page.getByText('活跃工单')).toBeVisible()
    await expect(page.getByText('今日完成')).toBeVisible()
  })

  test('1.3 应显示所有项目的交付进度', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('项目交付进度')).toBeVisible()
    await expect(page.getByText('HYD-2026-001 保湿功效评价')).toBeVisible()
    await expect(page.getByText('ANT-2026-003 抗衰老功效评价')).toBeVisible()
    await expect(page.getByText('WH-2026-002 美白功效评价')).toBeVisible()

    // 完成率
    await expect(page.getByText('64%')).toBeVisible()
    await expect(page.getByText('93.3%')).toBeVisible()
  })

  test('1.4 应显示CRC团队负载', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('CRC团队负载')).toBeVisible()
    // 使用 exact 避免匹配到风险预警中的"李协调今日工单偏多"
    await expect(page.getByText('李协调', { exact: true })).toBeVisible()
    await expect(page.getByText('赵CRC')).toBeVisible()
    await expect(page.getByText('钱CRC')).toBeVisible()

    // 表头
    await expect(page.getByText('成员')).toBeVisible()
  })

  test('1.5 应显示待处理决策', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('待处理决策')).toBeVisible()
    await expect(page.getByText('2 项')).toBeVisible()
    await expect(page.getByText('受试者S-012排程冲突')).toBeVisible()
    await expect(page.getByText('保湿项目方案修订响应')).toBeVisible()
  })

  test('1.6 应显示风险预警', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('风险预警')).toBeVisible()
    await expect(page.getByText('HYD-2026-001 有2个逾期工单')).toBeVisible()
    await expect(page.getByText('李协调今日工单偏多（8个待处理）')).toBeVisible()
  })
})
