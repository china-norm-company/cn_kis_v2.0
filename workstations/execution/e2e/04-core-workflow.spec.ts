/**
 * 场景 4：核心业务链路 — 工单 → 上下文 → KPI
 *
 * 业务目标：
 * ✓ 工单列表可正常加载
 * ✓ 项目执行上下文可查看（关键要求、决策日志、变更响应）
 * ✓ KPI绩效指标Tab可查看
 * ✓ 分析页面可正常加载
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景4: 核心业务链路', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
  })

  test('4.1 工单列表应正常加载并显示工单', async ({ page }) => {
    // 监听 JS 错误
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/execution/#/workorders')
    // 给更多时间加载
    await page.waitForTimeout(3000)
    await page.waitForLoadState('networkidle')

    // 如果页面有 JS 错误，打印出来便于调试
    if (errors.length > 0) {
      console.log('Page errors:', errors)
    }

    // 工单页面标题在 h2 中
    const main = page.locator('main')
    await expect(main.getByText('工单管理').first()).toBeVisible({ timeout: 10000 })
    await expect(main.getByRole('table')).toBeVisible({ timeout: 10000 })
    await expect(main.getByRole('row').nth(1)).toBeVisible({ timeout: 10000 })
  })

  test('4.2 项目执行上下文页面 — 概览Tab', async ({ page }) => {
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')

    // 页面标题
    await expect(page.getByText('HYD-2026-001 保湿功效评价')).toBeVisible()

    // Tab栏
    await expect(page.getByText('执行概览')).toBeVisible()
    await expect(page.getByText('执行上下文')).toBeVisible()

    // KPI卡片
    await expect(page.getByText('目标样本')).toBeVisible()
    await expect(page.getByText('已入组')).toBeVisible()
  })

  test('4.3 项目执行上下文 — 上下文Tab: 关键要求', async ({ page }) => {
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')

    // 切换到上下文Tab
    await page.getByText('执行上下文').click()
    await page.waitForLoadState('networkidle')

    // 关键要求
    await expect(page.getByText('关键要求摘要')).toBeVisible()
    await expect(page.getByText('受试者准备')).toBeVisible()
    await expect(page.getByText('空腹状态')).toBeVisible()
    await expect(page.getByText('环境条件')).toBeVisible()
  })

  test('4.4 项目执行上下文 — 特殊注意事项', async ({ page }) => {
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')

    await page.getByText('执行上下文').click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('特殊注意事项')).toBeVisible()
    await expect(page.getByText('赞助商要求每日邮件汇报进展')).toBeVisible()
  })

  test('4.5 项目执行上下文 — CRC决策日志', async ({ page }) => {
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')

    await page.getByText('执行上下文').click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('CRC决策日志')).toBeVisible()
    await expect(page.getByText('受试者S-012排程调整')).toBeVisible()
    await expect(page.getByText('访视窗口期')).toBeVisible()
  })

  test('4.6 项目执行上下文 — 变更响应', async ({ page }) => {
    await page.goto('/execution/#/projects/1/execution')
    await page.waitForLoadState('networkidle')

    await page.getByText('执行上下文').click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('变更响应记录')).toBeVisible()
    await expect(page.getByText('protocol_amendment')).toBeVisible()
    await expect(page.getByText('增加TEWL检测时间点')).toBeVisible()
  })

  test('4.7 KPI绩效Tab应显示6项核心指标', async ({ page }) => {
    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '分析与报表' })).toBeVisible()

    // 切换到 KPI Tab（使用 role=button 定位 tab 按钮）
    await page.getByRole('button', { name: 'KPI绩效' }).click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('按时完成率')).toBeVisible()
    await expect(page.getByText('94.5%')).toBeVisible()
    await expect(page.getByText('质量审计通过率')).toBeVisible()
    await expect(page.getByText('异常发生率')).toBeVisible()
    await expect(page.getByText('3.2%')).toBeVisible()
    await expect(page.getByText('设备利用率')).toBeVisible()
    await expect(page.getByText('78.5%')).toBeVisible()
    await expect(page.getByText('人均工单量')).toBeVisible()
  })

  test('4.8 KPI明细数据应显示', async ({ page }) => {
    await page.goto('/execution/#/analytics')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'KPI绩效' }).click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('KPI明细数据')).toBeVisible()
    // "总工单数" 在页面顶部概要和 KPI 明细中都有，用 first()
    await expect(page.getByText('总工单数').first()).toBeVisible()
    await expect(page.getByText('按时完成', { exact: true })).toBeVisible()
    await expect(page.getByText('异常总数')).toBeVisible()
  })
})
