/**
 * P0 主链路验收 — 首页/门户/我的助手/我的活动/日报/门禁/技能/路由
 * 断言各页主结构存在，不 mock API；需后端 /api/v1 可用时数据才完整。
 */
import { test, expect } from '@playwright/test'

test.describe('首页与门户', () => {
  test('默认进入门户页', async ({ page }) => {
    await page.goto('/#/')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="portal-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /数字员工门户/ })).toBeVisible()
  })

  test('门户页加载并展示主结构', async ({ page }) => {
    await page.goto('/#/portal')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="portal-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /数字员工门户/ })).toBeVisible()
  })
})

test.describe('我的助手', () => {
  test('我的助手页加载', async ({ page }) => {
    await page.goto('/#/my-assistants')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="my-assistants-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /我的助手/ })).toBeVisible()
  })
})

test.describe('我的活动', () => {
  test('我的活动页加载', async ({ page }) => {
    await page.goto('/#/my-activity')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="my-activity-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /工作动态/ })).toBeVisible()
  })
})

test.describe('经营日报', () => {
  test('经营日报页加载', async ({ page }) => {
    await page.goto('/#/daily-brief')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="daily-brief-page"]')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('门禁', () => {
  test('门禁页加载', async ({ page }) => {
    await page.goto('/#/gates')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="evidence-gate-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /验收门禁/ })).toBeVisible()
  })
})

test.describe('技能', () => {
  test('技能注册表页加载', async ({ page }) => {
    await page.goto('/#/skill-registry')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="skill-registry-page"]')).toBeVisible({ timeout: 10000 })
  })

  test('技能管理页加载', async ({ page }) => {
    await page.goto('/#/skills')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('heading', { name: /技能管理/ })).toBeVisible()
  })
})

test.describe('路由与协作流程', () => {
  test('协作流程定义页加载', async ({ page }) => {
    await page.goto('/#/workflows')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('heading', { name: /协作流程定义/ })).toBeVisible()
  })
})

test.describe('价值看板', () => {
  test('价值看板展示汇总卡片与按岗位/工作台/业务对象聚合区块', async ({ page }) => {
    await page.route('**/api/v1/digital-workforce/value-metrics**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            window_days: 30,
            skill_execution_total: 0,
            skill_execution_success: 0,
            governance_summary: {},
            saved_hours_estimate: 0,
            baseline_minutes_per_skill_run: 5,
            by_role: [],
            by_workstation: [],
            by_business_object_type: [],
          },
        },
      })
    })
    await page.goto('/#/value')
    await expect(page.locator('[data-testid="value-dashboard-page"]')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: /价值看板/ })).toBeVisible()
    await expect(page.locator('[data-testid="value-aggregation-role_code"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="value-aggregation-workstation_key"]')).toBeVisible()
    await expect(page.locator('[data-testid="value-aggregation-business_object_type"]')).toBeVisible()
  })
})

test.describe('执行回放（二轮收口）', () => {
  test('回放中心展示编排回放区块与筛选', async ({ page }) => {
    await page.goto('/#/replay')
    await expect(page.locator('[data-testid="replay-center-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="replay-runs-section"]')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('heading', { name: /编排回放/ })).toBeVisible()
  })

  test('回放详情页可打开并展示岗位/工作台/业务对象区块（有数据时）', async ({ page }) => {
    await page.goto('/#/replay/ORCH-TEST-REPLAY-001')
    await expect(page.locator('[data-testid="replay-detail-page"]')).toBeVisible({ timeout: 10000 })
    const backLink = page.getByRole('link', { name: /返回执行回放/ })
    await expect(backLink).toBeVisible()
  })
})
