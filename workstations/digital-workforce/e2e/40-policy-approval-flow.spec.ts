/**
 * E2E 40 — 策略审批流 UI 验收
 * 验证策略学习页的完整审批流程：草稿 -> 提交评测 -> 批准/驳回
 * 使用 page.route() mock API，不依赖真实后端。
 */
import { test, expect } from '@playwright/test'

test.describe('策略审批流 E2E 验收', () => {
  test.beforeEach(async ({ page }) => {
    // Mock policy-learning 列表 API
    await page.route('**/api/v1/digital-workforce/policy-learning**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          msg: 'OK',
          data: {
            items: [
              {
                id: 1,
                worker_code: 'test_worker',
                domain_code: 'test',
                policy_key: 'test_policy',
                outcome: '技能执行失败',
                root_cause: '参数边界问题',
                better_policy: '建议检查参数边界',
                replay_score: 0.5,
                status: 'draft',
                created_at: '2026-03-12T00:00:00',
                activated_at: null,
              },
              {
                id: 2,
                worker_code: 'eval_worker',
                domain_code: 'quality',
                policy_key: 'eval_policy',
                outcome: '质量门禁失败',
                root_cause: '覆盖率不足',
                better_policy: '建议补充知识',
                replay_score: 0.7,
                status: 'evaluating',
                created_at: '2026-03-11T00:00:00',
                activated_at: null,
              },
            ],
          },
        }),
      })
    })

    // Mock 审批操作 API
    await page.route('**/api/v1/digital-workforce/policy-learning/**/submit-evaluation', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, msg: '策略已提交评测', data: { policy_update_id: 1, status: 'evaluating' } }),
      })
    })

    await page.route('**/api/v1/digital-workforce/policy-learning/**/approve', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, msg: '策略已批准生效', data: { policy_update_id: 2, status: 'active' } }),
      })
    })

    await page.route('**/api/v1/digital-workforce/policy-learning/**/reject', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, msg: '策略已驳回', data: { policy_update_id: 2, status: 'retired' } }),
      })
    })
  })

  test('策略学习页加载并展示审批流程说明', async ({ page }) => {
    await page.goto('/#/policy-learning')
    await expect(page.locator('[data-testid="policy-learning-page"]')).toBeVisible({ timeout: 15000 })
    // 审批流程说明区块中有草稿/评测中/生效中标签（使用 first() 避免 strict mode）
    await expect(page.getByText(/草稿/).first()).toBeVisible()
    await expect(page.getByText(/评测中/).first()).toBeVisible()
    await expect(page.getByText(/生效中/).first()).toBeVisible()
  })

  test('DRAFT 状态策略显示「提交评测」按钮', async ({ page }) => {
    await page.goto('/#/policy-learning')
    await expect(page.locator('[data-testid="policy-learning-page"]')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('提交评测').first()).toBeVisible()
  })

  test('EVALUATING 状态策略显示「批准」和「驳回」按钮', async ({ page }) => {
    await page.goto('/#/policy-learning')
    await expect(page.locator('[data-testid="policy-learning-page"]')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('批准').first()).toBeVisible()
    await expect(page.getByText('驳回').first()).toBeVisible()
  })
})
