/**
 * S12: 知识与AI — 知识库 + AI助手 + 研究概览
 *
 * 验证研究经理的知识检索和AI辅助能力
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S12 知识与AI', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S12.1 知识库页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/knowledge')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/知识/).first()).toBeVisible({ timeout: 8000 })
  })

  test('S12.2 知识库页面渲染正常', async ({ page }) => {
    await navigateTo(page, '/research/#/knowledge')
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content.length).toBeGreaterThan(500)
  })

  test('S12.3 AI助手页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/ai-assistant')
    await page.waitForTimeout(3000)
    const content = await page.content()
    const hasAI = content.includes('助手') || content.includes('Agent') || content.includes('对话') || content.includes('通用')
    expect(hasAI).toBeTruthy()
  })

  test('S12.4 AI助手页面渲染正常', async ({ page }) => {
    await navigateTo(page, '/research/#/ai-assistant')
    await page.waitForTimeout(3000)
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(10)
  })

  test('S12.5 研究概览页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/overview')
    await page.waitForTimeout(3000)
    const content = await page.content()
    expect(content.length).toBeGreaterThan(500)
  })
})
