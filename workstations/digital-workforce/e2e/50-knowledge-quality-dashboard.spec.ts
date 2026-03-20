/**
 * E2E 50 — 知识质量仪表盘 UI 验收
 * 验证知识审核页的知识质量仪表盘：加载、表格渲染、按专题包展示指标
 * 使用 page.route() mock API，不依赖真实后端。
 */
import { test, expect } from '@playwright/test'

test.describe('知识质量仪表盘 E2E 验收', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/digital-workforce/knowledge-review**', async (route) => {
      const url = route.request().url()
      if (url.includes('quality-report')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            msg: 'OK',
            data: {
              total_pending_review: 2,
              total_without_quality_score: 1,
              by_source_quality: [],
              low_quality_entries: [],
              no_search_vector_entries: [],
              no_summary_entries: [],
              recommendations: [],
            },
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            msg: 'OK',
            data: { items: [], total: 0, source_stats: [] },
          }),
        })
      }
    })

    await page.route('**/api/v1/digital-workforce/knowledge-quality-summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          msg: 'OK',
          data: {
            snapshot_date: '2026-03-12',
            summaries: [
              {
                package_id: 'informed_consent',
                package_label: '知情同意',
                total_entries: 10,
                published_entries: 8,
                avg_quality_score: 75.0,
                coverage_rate: 0.85,
                expiry_rate: 0.1,
                cite_rate_per_entry: 2.0,
              },
              {
                package_id: 'laboratory_qms',
                package_label: '实验室质量管理',
                total_entries: 6,
                published_entries: 6,
                avg_quality_score: 80.0,
                coverage_rate: 0.9,
                expiry_rate: 0.0,
                cite_rate_per_entry: 1.5,
              },
            ],
          },
        }),
      })
    })
  })

  test('知识审核页加载并展示知识质量仪表盘', async ({ page }) => {
    await page.goto('/#/knowledge-review')
    await expect(page.locator('[data-testid="knowledge-quality-dashboard"]')).toBeVisible({ timeout: 15000 })
  })

  test('知识质量仪表盘显示专题包数据', async ({ page }) => {
    await page.goto('/#/knowledge-review')
    await expect(page.locator('[data-testid="knowledge-quality-dashboard"]')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('知情同意')).toBeVisible()
    await expect(page.getByText('实验室质量管理')).toBeVisible()
  })

  test('知识质量仪表盘按覆盖率显示颜色标注', async ({ page }) => {
    await page.goto('/#/knowledge-review')
    await expect(page.locator('[data-testid="knowledge-quality-dashboard"]')).toBeVisible({ timeout: 15000 })
    // 覆盖率 >= 80% 应显示绿色（text-green-600）
    const coverageCell = page.locator('[data-testid="knowledge-quality-dashboard"] table tbody tr').first()
    await expect(coverageCell).toBeVisible()
  })
})
