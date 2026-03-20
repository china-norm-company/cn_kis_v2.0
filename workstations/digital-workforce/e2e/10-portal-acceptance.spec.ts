/**
 * Phase 1 门户验收 — 中书·数字员工中心
 * L2 有头 UI 验收：访问门户页，断言主结构存在（真实后端时展示数据，否则空/错态）
 * 按计划不使用 page.route() mock，需后端 /api/v1 可用时数据才完整。
 */
import { test, expect } from '@playwright/test'

test.describe('数字员工门户', () => {
  test('门户页加载并展示主结构', async ({ page }) => {
    await page.goto('/#/portal')
    // 先等待布局主区域出现（FeishuAuthProvider + 侧栏 + main）
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="portal-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /数字员工门户/ })).toBeVisible()
    // 页面应出现描述或分层标题（有数据时为编排中枢/数字人等，无数据时仍有描述）
    const portalHints = page.getByText(/组织内数字员工一览|编排中枢|数字人|智能体|自动化引擎|加载中|加载失败/)
    await expect(portalHints.first()).toBeVisible({ timeout: 5000 })
  })
})
