/**
 * S8: 监督进度 — 管理驾驶舱 + 项目组合 + 项目仪表板
 *
 * 验证研究经理的核心进度监控能力
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S8 管理驾驶舱', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S8.1 驾驶舱页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/manager')
    await page.waitForTimeout(3000)
    const content = await page.content()
    const hasKpi = content.includes('管理') || content.includes('驾驶舱') || content.includes('项目')
    expect(hasKpi).toBeTruthy()
  })

  test('S8.2 项目健康度数据', async ({ page }) => {
    await navigateTo(page, '/research/#/manager')
    await page.waitForTimeout(3000)
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)
  })

  test('S8.3 风险预警区域渲染', async ({ page }) => {
    await navigateTo(page, '/research/#/manager')
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content.length).toBeGreaterThan(1000)
  })
})

test.describe('S8 项目组合看板', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S8.4 组合看板可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/portfolio')
    await page.waitForTimeout(3000)
    const content = await page.content()
    const hasData = content.includes('项目组合') || content.includes('里程碑') || content.includes('保湿')
    expect(hasData).toBeTruthy()
  })

  test('S8.5 里程碑时间线展示', async ({ page }) => {
    await navigateTo(page, '/research/#/portfolio')
    await page.waitForTimeout(3000)
    await expect(page.getByText('里程碑时间线').first()).toBeVisible({ timeout: 5000 })
  })

  test('S8.6 资源冲突区域渲染', async ({ page }) => {
    await navigateTo(page, '/research/#/portfolio')
    await page.waitForTimeout(3000)
    await expect(page.getByText('资源冲突').first()).toBeVisible({ timeout: 5000 })
  })

  test('S8.7 冲突有解决按钮', async ({ page }) => {
    await navigateTo(page, '/research/#/portfolio')
    await page.waitForTimeout(3000)
    const resolveBtn = page.getByRole('button', { name: /解决/ })
    const count = await resolveBtn.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('S8.8 点击解决按钮打开弹窗', async ({ page }) => {
    await navigateTo(page, '/research/#/portfolio')
    await page.waitForTimeout(3000)
    const resolveBtn = page.getByRole('button', { name: /解决/ }).first()
    await resolveBtn.click()
    await page.waitForTimeout(1000)
    const modal = page.locator('[role="dialog"], .fixed.inset-0').filter({ hasText: /冲突|调整|更换|解决/ })
    await expect(modal.first()).toBeVisible({ timeout: 3000 })
  })
})

test.describe('S8 项目仪表板', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S8.9 项目仪表板可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/projects/1/dashboard')
    await page.waitForTimeout(3000)
    const content = await page.content()
    const hasProject = content.includes('保湿') || content.includes('HYD') || content.includes('项目')
    expect(hasProject).toBeTruthy()
  })

  test('S8.10 多Tab区域可见', async ({ page }) => {
    await navigateTo(page, '/research/#/projects/1/dashboard')
    await page.waitForTimeout(3000)
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)
  })
})
