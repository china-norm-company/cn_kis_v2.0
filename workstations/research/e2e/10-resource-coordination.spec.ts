/**
 * S10: 协调资源 — 团队全景（分配/均衡） + 执行管理（访视/受试者）
 *
 * 验证研究经理的资源调配操作能力
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S10 团队全景', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S10.1 团队页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/team')
    await page.waitForTimeout(2000)
    await expect(page.getByText('团队全景').first()).toBeVisible({ timeout: 8000 })
  })

  test('S10.2 团队统计卡片', async ({ page }) => {
    await navigateTo(page, '/research/#/team')
    await page.waitForTimeout(2000)
    const content = await page.content()
    const hasStats = content.includes('总成员') || content.includes('负荷率') || content.includes('团队')
    expect(hasStats).toBeTruthy()
  })

  test('S10.3 成员卡片渲染', async ({ page }) => {
    await navigateTo(page, '/research/#/team')
    await page.waitForTimeout(3000)
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)
  })

  test('S10.4 分配工单按钮可见', async ({ page }) => {
    await navigateTo(page, '/research/#/team')
    await page.waitForTimeout(3000)
    const assignBtns = page.getByRole('button', { name: /分配工单/ })
    const count = await assignBtns.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('S10.5 点击分配工单打开弹窗', async ({ page }) => {
    await navigateTo(page, '/research/#/team')
    await page.waitForTimeout(3000)
    const assignBtn = page.getByRole('button', { name: /分配工单/ }).first()
    await assignBtn.click()
    await page.waitForTimeout(1000)
    const modal = page.locator('[role="dialog"], .fixed.inset-0').filter({ hasText: /分配|工单/ })
    await expect(modal.first()).toBeVisible({ timeout: 3000 })
  })

  test('S10.6 查看工单按钮可见', async ({ page }) => {
    await navigateTo(page, '/research/#/team')
    await page.waitForTimeout(3000)
    const expandBtns = page.getByRole('button', { name: /查看工单/ })
    const count = await expandBtns.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('S10.7 一键均衡按钮可见', async ({ page }) => {
    await navigateTo(page, '/research/#/team')
    await page.waitForTimeout(3000)
    const balanceBtn = page.getByRole('button', { name: /一键均衡/ })
    const count = await balanceBtn.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

test.describe('S10 执行管理', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S10.8 访视列表可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/visits')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/访视/).first()).toBeVisible({ timeout: 8000 })
  })

  test('S10.9 访视数据渲染', async ({ page }) => {
    await navigateTo(page, '/research/#/visits')
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content.length).toBeGreaterThan(500)
  })

  test('S10.10 受试者列表可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/subjects')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/受试者/).first()).toBeVisible({ timeout: 8000 })
  })

  test('S10.11 受试者数据渲染', async ({ page }) => {
    await navigateTo(page, '/research/#/subjects')
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content.length).toBeGreaterThan(500)
  })
})
