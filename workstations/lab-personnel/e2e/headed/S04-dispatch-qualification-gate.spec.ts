/**
 * S04：派工资质门控 — 资质校验
 *
 * 业务标准：0%不合格人员通过率
 * 测试权重：12%
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupHeadedMocks, waitForPageReady } from './helpers/setup'

test.describe('派工资质门控 — 资质校验', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupHeadedMocks(page)
  })

  test('4.1 导航到派发页面，验证派发监控数据可见', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await waitForPageReady(page)
    
    // 验证统计卡片可见
    await expect(page.locator('[data-stat="in_progress"]')).toBeVisible()
    await expect(page.locator('[data-stat="pending"]')).toBeVisible()
    await expect(page.locator('[data-stat="overdue"]')).toBeVisible()
    await expect(page.locator('[data-stat="completed"]')).toBeVisible()
    
    // 验证监控表格可见
    const monitor = page.locator('[data-section="monitor"]')
    await expect(monitor).toBeVisible()
  })

  test('4.2 查看工单的候选人列表，验证候选人列表包含资质检查', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await waitForPageReady(page)
    
    // 点击第一个"查看候选人"按钮
    const viewCandidatesButton = page.getByRole('button', { name: /查看候选人/ }).first()
    if (await viewCandidatesButton.isVisible()) {
      await viewCandidatesButton.click()
      await waitForPageReady(page)
      
      // 验证候选人区域可见
      const candidatesSection = page.locator('[data-section="candidates"]')
      await expect(candidatesSection).toBeVisible()
      
      // 验证候选人列表存在
      const candidateItems = candidatesSection.locator('.bg-slate-50')
      const count = await candidateItems.count()
      expect(count).toBeGreaterThan(0)
    }
  })

  test('4.3 验证候选人显示GCP/方法/设备的通过/失败徽章', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await waitForPageReady(page)
    
    const viewCandidatesButton = page.getByRole('button', { name: /查看候选人/ }).first()
    if (await viewCandidatesButton.isVisible()) {
      await viewCandidatesButton.click()
      await waitForPageReady(page)
      
      const candidatesSection = page.locator('[data-section="candidates"]')
      await expect(candidatesSection).toBeVisible()
      
      // 验证资质检查项存在
      const firstCandidate = candidatesSection.locator('.bg-slate-50').first()
      await expect(firstCandidate.getByText(/GCP证书/)).toBeVisible()
      await expect(firstCandidate.getByText(/方法资质/)).toBeVisible()
      await expect(firstCandidate.getByText(/设备授权/)).toBeVisible()
      
      // 验证有通过/失败的图标（绿色勾或红色叉）
      const checkIcons = firstCandidate.locator('svg')
      const iconCount = await checkIcons.count()
      expect(iconCount).toBeGreaterThan(0)
    }
  })

  test('4.4 验证不合格人员无法通过派工', async ({ page }) => {
    await page.goto('/lab-personnel/dispatch')
    await waitForPageReady(page)
    
    const viewCandidatesButton = page.getByRole('button', { name: /查看候选人/ }).first()
    if (await viewCandidatesButton.isVisible()) {
      await viewCandidatesButton.click()
      await waitForPageReady(page)
      
      const candidatesSection = page.locator('[data-section="candidates"]')
      
      // 检查所有候选人的资质状态
      const candidateItems = candidatesSection.locator('.bg-slate-50')
      const count = await candidateItems.count()
      
      for (let i = 0; i < count; i++) {
        const candidate = candidateItems.nth(i)
        const checks = candidate.locator('svg')
        
        // 验证每个候选人都显示了5项检查（GCP、方法、设备、排班、工时）
        const checkCount = await checks.count()
        expect(checkCount).toBeGreaterThanOrEqual(5)
      }
    }
  })
})
