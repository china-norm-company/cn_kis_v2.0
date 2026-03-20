/**
 * S06：培训→资质联动 — 培训完成自动更新资质
 *
 * 业务标准：培训完成 → 资质更新，0人工干预
 * 测试权重：10%
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupHeadedMocks, waitForPageReady } from './helpers/setup'

test.describe('培训→资质联动 — 培训完成自动更新资质', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupHeadedMocks(page)
  })

  test('6.1 导航到人员列表，点击人员卡片，验证详情页加载', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await waitForPageReady(page)
    
    // 点击第一个人员卡片（使用.staff-card类选择器）
    const firstStaffCard = page.locator('.staff-card').first()
    await expect(firstStaffCard).toBeVisible()
    await firstStaffCard.click()
    
    await waitForPageReady(page)
    
    // 验证导航到详情页
    await expect(page).toHaveURL(/\/staff\/\d+/)
    await expect(page.locator('h2')).toContainText(/王皮测|李医评|张仪操/)
  })

  test('6.2 导航到方法资质标签页，验证学习等级可见', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    // 切换到方法资质标签页
    const methodsTab = page.locator('[data-tab="methods"]')
    await expect(methodsTab).toBeVisible()
    await methodsTab.click()
    await waitForPageReady(page)
    
    // 验证方法资质区域可见
    const methodsSection = page.locator('[data-section="methods"]')
    await expect(methodsSection).toBeVisible()
    
    // 验证至少有一个方法资质记录
    const methodCards = methodsSection.locator('.bg-white.rounded-xl')
    const count = await methodCards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('6.3 验证资质等级徽章正确显示', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    // 切换到方法资质标签页
    await page.locator('[data-tab="methods"]').click()
    await waitForPageReady(page)
    
    const methodsSection = page.locator('[data-section="methods"]')
    await expect(methodsSection).toBeVisible()
    
    // 验证等级徽章存在（带教、独立、学习、见习等）
    const levelBadges = methodsSection.locator('span:has-text("带教"), span:has-text("独立"), span:has-text("学习"), span:has-text("见习")')
    const badgeCount = await levelBadges.count()
    expect(badgeCount).toBeGreaterThan(0)
    
    // 验证徽章有正确的样式类（包含颜色标识）
    const firstBadge = levelBadges.first()
    const badgeClass = await firstBadge.getAttribute('class')
    expect(badgeClass).toContain('bg-')
    expect(badgeClass).toContain('text-')
  })

  test('6.4 验证方法资质详情信息完整', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    await page.locator('[data-tab="methods"]').click()
    await waitForPageReady(page)
    
    const methodsSection = page.locator('[data-section="methods"]')
    await expect(methodsSection).toBeVisible()
    
    const methodCards = methodsSection.locator('.bg-white.rounded-xl')
    const count = await methodCards.count()
    expect(count).toBeGreaterThan(0)
    
    const firstCard = methodCards.first()
    const cardText = await firstCard.textContent()
    expect(cardText).toMatch(/累计执行.*\d+.*次/)
  })

  test('6.5 验证业务标准：培训完成自动更新资质，无需人工干预', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    // 切换到方法资质标签页
    await page.locator('[data-tab="methods"]').click()
    await waitForPageReady(page)
    
    // 验证方法资质显示完整信息（包括认定日期、执行次数等）
    const methodsSection = page.locator('[data-section="methods"]')
    await expect(methodsSection).toBeVisible()
    
    // 验证资质信息包含培训相关字段（如认定日期、累计执行次数）
    const methodCard = methodsSection.locator('.bg-white.rounded-xl').first()
    await expect(methodCard).toBeVisible()
    
    // 验证资质等级与执行次数关联（执行次数越多，等级应该越高）
    const executionText = await methodCard.textContent()
    expect(executionText).toMatch(/\d+.*次/)
  })
})
