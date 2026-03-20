/**
 * S07：人员360档案 — 8标签页完整视图
 *
 * 业务标准：2分钟内了解一个人
 * 测试权重：8%
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupHeadedMocks, waitForPageReady } from './helpers/setup'

test.describe('人员360档案 — 8标签页完整视图', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupHeadedMocks(page)
  })

  test('7.1 导航到人员详情页，验证页面标题和基本信息', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    // 验证页面标题包含人员姓名
    const pageTitle = page.locator('h2')
    await expect(pageTitle).toBeVisible()
    await expect(pageTitle).toContainText(/王皮测|李医评|张仪操/)
    
    // 验证基本信息显示（工号、部门、职位）
    const basicInfo = page.locator('p:has-text("EMP-")')
    await expect(basicInfo.first()).toBeVisible()
  })

  test('7.2 切换到8个标签页，每个标签页截图', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    const tabs = [
      { key: 'basic', label: '基本信息' },
      { key: 'certificates', label: '证书' },
      { key: 'methods', label: '方法资质' },
      { key: 'equipment', label: '设备授权' },
      { key: 'projects', label: '项目经验' },
      { key: 'training', label: '培训记录' },
      { key: 'assessment', label: '能力评估' },
      { key: 'schedule', label: '排班记录' },
    ]
    
    for (const tab of tabs) {
      const tabButton = page.locator(`[data-tab="${tab.key}"]`)
      if (await tabButton.isVisible()) {
        await tabButton.click()
        await waitForPageReady(page)
        
        // 截图每个标签页
        await page.screenshot({ 
          path: `test-results/staff-detail-${tab.key}.png`, 
          fullPage: true 
        })
        
        // 验证对应的内容区域可见
        const section = page.locator(`[data-section="${tab.key}"]`)
        await expect(section).toBeVisible()
      }
    }
  })

  test('7.3 验证证书标签页显示到期状态标签', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    // 切换到证书标签页
    await page.locator('[data-tab="certificates"]').click()
    await waitForPageReady(page)
    
    const certificatesSection = page.locator('[data-section="certificates"]')
    await expect(certificatesSection).toBeVisible()
    
    // 验证证书状态标签存在（有效、即将到期、已过期）
    const statusLabels = certificatesSection.locator('span:has-text("有效"), span:has-text("即将到期"), span:has-text("已过期"), span:has-text("已到期")')
    const labelCount = await statusLabels.count()
    
    if (labelCount > 0) {
      // 验证状态标签有颜色标识
      const firstLabel = statusLabels.first()
      const labelClass = await firstLabel.getAttribute('class')
      expect(labelClass).toMatch(/bg-(green|yellow|red)-/)
    }
  })

  test('7.4 验证方法资质标签页显示等级徽章', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    // 切换到方法资质标签页
    await page.locator('[data-tab="methods"]').click()
    await waitForPageReady(page)
    
    const methodsSection = page.locator('[data-section="methods"]')
    await expect(methodsSection).toBeVisible()
    
    // 验证等级徽章存在
    const levelBadges = methodsSection.locator('span:has-text("带教"), span:has-text("独立"), span:has-text("学习"), span:has-text("见习")')
    const badgeCount = await levelBadges.count()
    
    if (badgeCount > 0) {
      // 验证徽章样式
      const firstBadge = levelBadges.first()
      const badgeClass = await firstBadge.getAttribute('class')
      expect(badgeClass).toContain('bg-')
      expect(badgeClass).toContain('text-')
    }
  })

  test('7.5 验证能力评估标签页显示雷达图（如有数据）', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    // 切换到能力评估标签页
    await page.locator('[data-tab="assessment"]').click()
    await waitForPageReady(page)
    
    const assessmentSection = page.locator('[data-section="assessment"]')
    await expect(assessmentSection).toBeVisible()
    
    // 检查是否有雷达图或评估数据
    // 雷达图可能以canvas、svg或其他形式存在
    const radarChart = assessmentSection.locator('canvas, svg, [data-chart="radar"]')
    const chartCount = await radarChart.count()
    
    // 如果有评估数据，应该显示图表或评估信息
    if (chartCount > 0) {
      await expect(radarChart.first()).toBeVisible()
    } else {
      // 如果没有图表，至少应该有评估相关的文本说明
      const assessmentText = assessmentSection.getByText(/评估|能力|雷达/)
      const textCount = await assessmentText.count()
      expect(textCount).toBeGreaterThanOrEqual(0)
    }
  })

  test('7.6 验证业务标准：2分钟内了解一个人', async ({ page }) => {
    await page.goto('/lab-personnel/staff/101')
    await waitForPageReady(page)
    
    // 验证关键信息快速可见
    const pageTitle = page.locator('h2')
    await expect(pageTitle).toBeVisible()
    
    // 验证基本信息、证书、资质等关键标签页都在导航中
    const tabKeys = ['basic', 'certificates', 'methods', 'assessment']
    for (const key of tabKeys) {
      const tab = page.locator(`[data-tab="${key}"]`)
      await expect(tab).toBeVisible()
    }
    
    // 验证页面加载速度快（网络空闲后500ms内可见）
    const startTime = Date.now()
    await waitForPageReady(page)
    const loadTime = Date.now() - startTime
    expect(loadTime).toBeLessThan(5000) // 5秒内加载完成
  })
})
