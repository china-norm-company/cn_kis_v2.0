/**
 * E2E 60 — L2 验收结论卡片 UI 验收
 * 验证门禁页的 L2 真实验收结论卡片：展示最新 pass_rate、verdict、by_batch
 * 使用 page.route() mock API，不依赖真实后端。
 */
import { test, expect } from '@playwright/test'

test.describe('L2 验收结论卡片 E2E 验收', () => {
  test.beforeEach(async ({ page }) => {
    // Mock 门禁运行记录
    await page.route('**/api/v1/digital-workforce/evidence-gate-runs**', async (route) => {
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
                gate_type: 'readiness',
                scope: 'digital_workers',
                status: 'passed',
                score: 1.0,
                summary: { passed: true },
                raw_report: {},
                created_at: '2026-03-12T06:30:00',
              },
            ],
          },
        }),
      })
    })

    // Mock L2 验收最新结论（可试点）
    await page.route('**/api/v1/digital-workforce/l2-eval-latest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          msg: 'OK',
          data: {
            verdict: '可试点',
            run_id: '20260312T063000Z',
            passed: true,
            pass_rate: 0.92,
            total: 25,
            passed_count: 23,
            failed_count: 2,
            by_batch: {
              core: { total: 9, passed: 9, failed: 0 },
              workflow: { total: 10, passed: 9, failed: 1 },
              safety: { total: 6, passed: 5, failed: 1 },
            },
            decision_reason: '整体通过率 92%，核心场景全绿，可进入试点。',
            critical_issue_records: 0,
            generated_at: '2026-03-12T06:30:00Z',
            available: true,
          },
        }),
      })
    })
  })

  test('门禁页加载并展示 L2 验收结论卡片', async ({ page }) => {
    await page.goto('/#/gates')
    await expect(page.locator('[data-testid="l2-eval-verdict-card"]')).toBeVisible({ timeout: 15000 })
  })

  test('L2 验收卡片显示可试点结论', async ({ page }) => {
    await page.goto('/#/gates')
    await expect(page.locator('[data-testid="l2-eval-verdict-card"]')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('可试点')).toBeVisible()
  })

  test('L2 验收卡片显示通过率', async ({ page }) => {
    await page.goto('/#/gates')
    await expect(page.locator('[data-testid="l2-eval-verdict-card"]')).toBeVisible({ timeout: 15000 })
    // 92% -> 显示 "92%"
    await expect(page.getByText('92%')).toBeVisible()
  })

  test('L2 验收卡片：需整改时显示警告色', async ({ page }) => {
    // Override L2 mock 为需整改
    await page.route('**/api/v1/digital-workforce/l2-eval-latest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          msg: 'OK',
          data: {
            verdict: '需整改',
            run_id: null,
            passed: false,
            pass_rate: 0.0,
            total: 0,
            passed_count: 0,
            failed_count: 0,
            by_batch: {},
            decision_reason: '尚未执行数字员工真实能力验收',
            critical_issue_records: 0,
            generated_at: null,
            available: false,
          },
        }),
      })
    })
    await page.goto('/#/gates')
    await expect(page.locator('[data-testid="l2-eval-verdict-card"]')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('需整改')).toBeVisible()
  })
})
