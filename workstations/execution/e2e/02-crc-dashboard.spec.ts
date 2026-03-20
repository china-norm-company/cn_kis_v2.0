/**
 * 场景 2：CRC协调员仪表盘 — 个人项目执行视角
 *
 * 业务目标：
 * ✓ CRC登录后看到"我的项目工作台"
 * ✓ 今日任务时间线清晰
 * ✓ 个人KPI统计一目了然
 * ✓ 最近异常事件提醒
 * ✓ 导航中包含CRC相关功能
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景2: CRC协调员仪表盘', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc')
  })

  test('2.1 CRC登录后应看到我的项目工作台', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('我的项目工作台')).toBeVisible()
    await expect(page.getByText('CRC协调员 — 项目执行与任务管理')).toBeVisible()
  })

  test('2.2 应显示个人KPI统计', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('活跃工单')).toBeVisible()
    await expect(page.getByText('今日排程')).toBeVisible()
    await expect(page.getByText('今日完成')).toBeVisible()
    await expect(page.getByText('本周完成')).toBeVisible()
    await expect(page.getByText('逾期工单')).toBeVisible()
  })

  test('2.3 应显示今日任务列表', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('今日任务')).toBeVisible()
    await expect(page.getByText('检测室环境确认')).toBeVisible()
    await expect(page.getByText('S-001 皮肤水分测试')).toBeVisible()
    await expect(page.getByText('S-003 面部图像采集')).toBeVisible()
    await expect(page.getByText('查看全部工单')).toBeVisible()
  })

  test('2.4 应显示负责的项目列表', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('我负责的项目')).toBeVisible()
    // 项目名在多处出现（today_timeline + my_projects），用 first() 避免 strict 冲突
    await expect(page.getByText('HYD-2026-001 保湿功效评价').first()).toBeVisible()
    await expect(page.getByText('ANT-2026-003 抗衰老功效评价').first()).toBeVisible()
  })

  test('2.5 应显示最近异常', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('最近异常')).toBeVisible()
    // exception_type 显示为 subject_no_show
    await expect(page.getByText('subject_no_show')).toBeVisible()
    // severity badge: medium
    await expect(page.getByText('medium')).toBeVisible()
    // description 显示
    await expect(page.getByText('受试者S-010未按时到达')).toBeVisible()
  })

  test('2.6 CRC导航应包含相关功能入口', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    const nav = page.locator('nav')
    const navTexts = (await nav.locator('a').allTextContents()).join(' ')
    expect(navTexts).toContain('仪表盘')
    expect(navTexts).toContain('工单管理')
    expect(navTexts).toContain('访视管理')
    expect(navTexts).toContain('受试者')
  })
})
