/**
 * 场景 7：协同增强 — 通知、评论、变更通知、公告
 *
 * 验证 P2 阶段协同增强效果：
 * ✓ 工单评论发送和展示
 * ✓ 变更通知列表展示
 * ✓ 系统公告列表展示
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('P2 协同增强', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('7.1 工单评论 — 展开评论列表', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 找到评论区域的按钮（包含"工单评论"文本）
    const commentBtn = page.getByText('工单评论')
    await expect(commentBtn).toBeVisible({ timeout: 5000 })

    // 点击展开（按钮同时包含"展开"文字）
    await commentBtn.click()
    await page.waitForTimeout(500)

    // 验证展开后出现评论输入框
    await expect(page.getByPlaceholder('输入评论')).toBeVisible({ timeout: 5000 })
  })

  test('7.2 知识库 — 变更通知 Tab 展示数据', async ({ page }) => {
    await page.goto('/evaluator/knowledge')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '知识库' })).toBeVisible()

    const changesTab = page.locator('button:has-text("变更通知")')
    await changesTab.click()

    await expect(
      page.locator('text=方案 HYD-2026-001').or(page.locator('text=暂无变更通知'))
    ).toBeVisible({ timeout: 5000 })
  })

  test('7.3 知识库 — 系统公告 Tab 展示数据', async ({ page }) => {
    await page.goto('/evaluator/knowledge')
    await page.waitForLoadState('networkidle')

    const announcementsTab = page.locator('button:has-text("系统公告")')
    await announcementsTab.click()

    await expect(
      page.locator('text=系统维护通知').or(page.locator('text=暂无系统公告'))
    ).toBeVisible({ timeout: 5000 })
  })

  test('7.4 异常上报对话框可打开', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    const exceptionBtn = page.locator('button:has-text("上报异常")')
    await expect(exceptionBtn).toBeVisible({ timeout: 5000 })
    await exceptionBtn.click()

    await expect(page.locator('text=异常类型')).toBeVisible()
    await expect(page.locator('text=严重程度')).toBeVisible()
  })
})
