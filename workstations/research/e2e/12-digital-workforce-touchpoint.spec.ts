/**
 * P0 四工作台深度触点 — 研究台
 * 1. 进入中书：工作台页展示「进入中书·数字员工中心」入口并指向 digital-workforce
 * 2. 本台数字员工深度触点：研究台数字员工摘要卡（方案与协议结果）可见
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

const REPLAY_RUN = {
  task_id: 'ORCH-DW-RESEARCH-001',
  role_code: 'solution_designer',
  workstation_key: 'research',
  status: 'success',
  query: '方案与协议摘要',
  created_at: new Date().toISOString(),
}
const REPLAY_DETAIL = {
  task_id: REPLAY_RUN.task_id,
  structured_artifacts: { demand_summary: '需求摘要', solution_draft: '方案初稿内容' },
}

async function mockDigitalWorkforce(page: Page) {
  await page.route(/digital-workforce\/replay-runs/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: [REPLAY_RUN], total: 1 } },
    })
  })
  await page.route(/digital-workforce\/replay\/ORCH-DW-RESEARCH-001/, async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: REPLAY_DETAIL } })
  })
}

test.describe('研究台-中书触点', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
    await mockDigitalWorkforce(page)
  })

  test('进入中书: 工作台页展示进入中书入口且指向 digital-workforce', async ({ page }) => {
    await navigateTo(page, '/research/', '工作台')
    const link = page.getByRole('link', { name: '进入中书·数字员工中心' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /digital-workforce.*portal/)
  })

  test('本台数字员工深度触点: 研究台有方案与协议（数字员工）入口或摘要卡', async ({ page }) => {
    await navigateTo(page, '/research/', '工作台')
    const card = page.getByTestId('research-digital-workforce-card')
    const link = page.getByRole('link', { name: /方案与协议（数字员工）/ })
    await expect(card.or(link)).toBeVisible({ timeout: 15000 })
  })
})
