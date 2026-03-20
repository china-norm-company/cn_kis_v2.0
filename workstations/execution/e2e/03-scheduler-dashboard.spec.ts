/**
 * 场景 3：排程员仪表盘 — 资源调度与冲突管理
 *
 * 业务目标：
 * ✓ 排程员登录后看到"资源调度中心"
 * ✓ 待分配工单队列清晰
 * ✓ 资源概览（设备、人员、场地）一目了然
 * ✓ 排程冲突预警醒目
 * ✓ 本周产能一览
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景3: 排程员仪表盘', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'scheduler')
  })

  test('3.1 排程员登录后应看到资源调度中心', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('资源调度中心')).toBeVisible()
    await expect(page.getByText('排程专员 — 资源编排与工单调度')).toBeVisible()
  })

  test('3.2 应显示资源KPI卡片', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    // "待分配工单" 同时出现在 StatCard (p) 和 section heading (h3)，用 first() 避免 strict 冲突
    await expect(page.getByText('待分配工单').first()).toBeVisible()
    await expect(page.getByText('设备可用')).toBeVisible()
    await expect(page.getByText('人员在岗')).toBeVisible()
    await expect(page.getByText('场地可用')).toBeVisible()
  })

  test('3.3 应显示待分配工单队列', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '待分配工单' }).or(
      page.locator('h3').filter({ hasText: '待分配工单' })
    )).toBeVisible()
    await expect(page.getByText('S-015 基线访视检测')).toBeVisible()
    await expect(page.getByText('S-018 第2周访视')).toBeVisible()
    await expect(page.getByText('S-022 第4周访视')).toBeVisible()
    await expect(page.getByText('查看全部')).toBeVisible()
  })

  test('3.4 应显示排程冲突', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('排程冲突')).toBeVisible()
    await expect(page.getByText('2 个冲突')).toBeVisible()
    await expect(page.getByText('Corneometer CM825 排程')).toBeVisible()
    await expect(page.getByText('10:00-11:00有重复预约')).toBeVisible()
    await expect(page.getByText('检测室B排程')).toBeVisible()
    await expect(page.getByText('明日预约已满')).toBeVisible()
  })

  test('3.5 应显示本周产能', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('本周产能')).toBeVisible()
    // 统计数据
    await expect(page.getByText('总排程:')).toBeVisible()
    await expect(page.getByText('已完成:')).toBeVisible()
    await expect(page.getByText('完成率:')).toBeVisible()
  })

  test('3.6 排程员导航应包含排程和LIMS', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')

    const nav = page.locator('nav')
    const navTexts = (await nav.locator('a').allTextContents()).join(' ')
    expect(navTexts).toContain('仪表盘')
    expect(navTexts).toContain('工单管理')
    expect(navTexts).toContain('排程管理')
    expect(navTexts).toContain('LIMS')
  })
})
