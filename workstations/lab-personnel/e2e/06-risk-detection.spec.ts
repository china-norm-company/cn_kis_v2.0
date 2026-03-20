/**
 * 场景 06：风险预警 — 8 类风险检测与管理
 *
 * 钱子衿需要监控 8 类风险预警（证书到期、单点依赖、过度疲劳、能力萎缩、
 * 培训欠账、产能瓶颈、质量下滑、人员流失），及时确认和处理风险。
 *
 * 10 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('风险预警 — 8 类风险检测与管理', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('6.1 打开风险预警页面，看到页面标题和 8 类风险描述', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    await expect(page.locator('main h2')).toContainText('风险预警')
    await expect(page.locator('main p').first()).toContainText(/证书到期/)
  })

  test('6.2 看到风险统计卡片（红色2、黄色3、蓝色3、本月已解决3）', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    await expect(page.locator('[data-stat="red"]')).toContainText('2')
    await expect(page.locator('[data-stat="yellow"]')).toContainText('3')
    await expect(page.locator('[data-stat="blue"]')).toContainText('3')
    await expect(page.locator('[data-stat="resolved"]')).toContainText('3')
  })

  test('6.3 风险列表显示 8 条记录，每条有彩色左边框', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    const riskCards = page.locator('.risk-card')
    await expect(riskCards).toHaveCount(8)
    const firstCard = riskCards.first()
    await expect(firstCard).toBeVisible()
  })

  test('6.4 红色风险：赵现辅 GCP证书 25天后到期', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    const riskCard = page.locator('.risk-card').filter({ hasText: '赵现辅 GCP证书' })
    await expect(riskCard).toBeVisible()
    await expect(riskCard.getByText('红色')).toBeVisible()
    await expect(riskCard.getByText('证书到期')).toBeVisible()
  })

  test('6.5 红色风险：皮肤黑素测定仅1人具备独立资质', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    const riskCard = page.locator('.risk-card').filter({ hasText: '皮肤黑素测定仅1人' })
    await expect(riskCard).toBeVisible()
    await expect(riskCard).toContainText('红色')
    await expect(riskCard).toContainText('单点依赖')
  })

  test('6.6 黄色风险：王皮测本周利用率达95%', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    const riskCard = page.locator('.risk-card').filter({ hasText: '王皮测本周利用率' })
    await expect(riskCard).toBeVisible()
    await expect(riskCard.getByText('黄色')).toBeVisible()
    await expect(riskCard.getByText('过度疲劳')).toBeVisible()
  })

  test('6.7 按类型筛选"证书到期"，仅显示证书到期风险', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    await page.locator('select[aria-label="风险类型"]').selectOption('cert_expiry')
    await page.waitForTimeout(500)
    const riskCards = page.locator('.risk-card')
    await expect(riskCards).toHaveCount(1)
    await expect(riskCards.first()).toContainText('证书到期')
  })

  test('6.8 按级别筛选"红色"，仅显示红色风险', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    await page.locator('select[aria-label="风险等级"]').selectOption('red')
    await page.waitForTimeout(500)
    const riskCards = page.locator('.risk-card')
    await expect(riskCards).toHaveCount(2)
    await expect(riskCards.first()).toContainText('红色')
  })

  test('6.9 点击"确认风险"按钮，确认开放风险', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    const openRisk = page.locator('.risk-card').filter({ hasText: '赵现辅 GCP证书' })
    await openRisk.getByRole('button', { name: '确认风险' }).click()
    await page.waitForTimeout(500)
    await expect(openRisk.getByText('已确认')).toBeVisible()
  })

  test('6.10 点击"立即扫描"按钮，扫描完成', async ({ page }) => {
    await page.goto('/lab-personnel/risks')
    await page.getByRole('button', { name: /立即扫描/ }).click()
    await page.waitForTimeout(1000)
    await expect(page.locator('[data-section="scan-result"]')).toBeVisible()
    await expect(page.getByText(/扫描完成/)).toBeVisible()
  })
})
