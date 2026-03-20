/**
 * P0 四工作台深度触点 — 执行台
 * 1. 进入中书：执行仪表盘展示「进入中书·数字员工中心」入口并指向 digital-workforce
 * 2. 本台数字员工深度触点：执行台数字员工摘要卡（工单与排程建议）可见
 * 使用 technician 角色以渲染 DefaultDashboard（含中书入口与摘要卡）
 */
import { test, expect, type Page } from '@playwright/test'
import { setupForRole } from './helpers/setup'

const REPLAY_RUN = {
  task_id: 'ORCH-DW-EXECUTION-001',
  role_code: 'workorder_matcher',
  workstation_key: 'execution',
  status: 'success',
  query: '工单与排程建议',
  created_at: new Date().toISOString(),
}

async function mockDigitalWorkforce(page: Page) {
  await page.route(/digital-workforce\/replay-runs/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: [REPLAY_RUN], total: 1 } },
    })
  })
}

test.describe('执行台-中书触点', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'technician')
    await mockDigitalWorkforce(page)
  })

  test('进入中书: 执行仪表盘展示进入中书入口且指向 digital-workforce', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('执行仪表盘')).toBeVisible()
    const link = page.getByRole('link', { name: '进入中书·数字员工中心' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /digital-workforce.*portal/)
  })

  test('本台数字员工深度触点: 执行台有工单与排程（执行回放）入口或摘要卡', async ({ page }) => {
    await page.goto('/execution/#/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('执行仪表盘')).toBeVisible()
    const card = page.getByTestId('execution-digital-workforce-card')
    const link = page.getByRole('link', { name: /工单与排程（执行回放）/ })
    await expect(card.or(link)).toBeVisible({ timeout: 15000 })
  })
})
