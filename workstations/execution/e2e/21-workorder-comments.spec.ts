/**
 * 场景 21: 工单评论 — 查看和发表评论
 *
 * AC-P4-3: 工单详情页可查看和发表评论
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景21: 工单评论', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc_supervisor')
    await page.goto('/execution/#/workorders/202')
    await page.waitForLoadState('networkidle')
  })

  test('21.1 工单详情页应包含评论区', async ({ page }) => {
    await expect(page.getByTestId('comments-section')).toBeVisible()
    await expect(page.getByText(/评论/)).toBeVisible()
  })

  test('21.2 评论区应显示已有评论', async ({ page }) => {
    await expect(page.getByText('请注意受试者皮肤敏感情况')).toBeVisible()
    await expect(page.getByText('已确认，将额外关注')).toBeVisible()
  })

  test('21.3 应显示评论作者', async ({ page }) => {
    const comments = page.getByTestId('comments-section')
    await expect(comments.getByText('陈主管')).toBeVisible()
    await expect(comments.getByText('李协调')).toBeVisible()
  })

  test('21.4 应有评论输入框', async ({ page }) => {
    await expect(page.getByPlaceholder('添加评论...')).toBeVisible()
  })

  test('21.5 评论数量应正确显示', async ({ page }) => {
    await expect(page.getByText('评论 (2)')).toBeVisible()
  })
})
