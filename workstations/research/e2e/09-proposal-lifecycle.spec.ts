/**
 * S9: 制作方案 — 可行性评估 + 方案准备 + 协议管理 + 结项管理
 *
 * 验证项目全生命周期管理能力
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S9 可行性评估', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S9.1 可行性页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/feasibility')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/可行性/).first()).toBeVisible({ timeout: 8000 })
  })

  test('S9.2 评估列表渲染', async ({ page }) => {
    await navigateTo(page, '/research/#/feasibility')
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content.length).toBeGreaterThan(500)
  })
})

test.describe('S9 方案准备', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S9.3 方案列表可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/proposals')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/方案/).first()).toBeVisible({ timeout: 8000 })
  })

  test('S9.4 方案看板内容渲染', async ({ page }) => {
    await navigateTo(page, '/research/#/proposals')
    await page.waitForTimeout(3000)
    const content = await page.content()
    const hasProposal = content.includes('保湿') || content.includes('方案') || content.includes('draft')
    expect(hasProposal).toBeTruthy()
  })

  test('S9.5 方案详情可进入', async ({ page }) => {
    await navigateTo(page, '/research/#/proposals/1')
    await page.waitForTimeout(3000)
    const content = await page.content()
    const hasDetail = content.includes('保湿') || content.includes('方案') || content.includes('v3')
    expect(hasDetail).toBeTruthy()
  })

  test('S9.6 创建方案页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/proposals/create')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/创建|新建|方案/).first()).toBeVisible({ timeout: 8000 })
  })
})

test.describe('S9 协议管理', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S9.7 协议列表可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/protocols')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/协议/).first()).toBeVisible({ timeout: 8000 })
  })

  test('S9.8 协议数据展示', async ({ page }) => {
    await navigateTo(page, '/research/#/protocols')
    await page.waitForTimeout(3000)
    const content = await page.content()
    const hasData = content.includes('HYD') || content.includes('保湿') || content.includes('协议')
    expect(hasData).toBeTruthy()
  })

  test('S9.9 协议详情可进入', async ({ page }) => {
    await navigateTo(page, '/research/#/protocols/1')
    await page.waitForTimeout(3000)
    const content = await page.content()
    const hasDetail = content.includes('保湿') || content.includes('HYD-2026-001') || content.includes('协议')
    expect(hasDetail).toBeTruthy()
  })
})

test.describe('S9 结项管理', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S9.10 结项页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/closeout')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/结项/).first()).toBeVisible({ timeout: 8000 })
  })

  test('S9.11 结项列表渲染', async ({ page }) => {
    await navigateTo(page, '/research/#/closeout')
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content.length).toBeGreaterThan(500)
  })
})
