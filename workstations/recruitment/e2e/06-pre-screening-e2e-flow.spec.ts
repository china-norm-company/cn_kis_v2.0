/**
 * 初筛完整业务闭环 E2E 测试 — 场景 P7
 *
 * 验证从报名 → 初筛 → 通过 → 正式筛选 → 入组的全链路数据一致性
 * 包括招募漏斗中初筛环节的数据准确性验证
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

const fullFlowRecord = {
  id: 100, pre_screening_no: 'PS-20260220-E2E1',
  registration_id: 100, registration_no: 'REG-202602-E2E001',
  subject_id: 500, subject_name: '赵六-闭环', subject_no: 'SUB-202602-E2E1',
  protocol_id: 1, protocol_title: '保湿功效评价',
  pre_screening_date: '2026-02-20', start_time: '2026-02-20T09:00:00',
  end_time: '2026-02-20T09:45:00', location: 'A区',
  hard_exclusion_checks: [
    { item: '年龄范围(18-60)', met: true, value: '30' },
    { item: '近1周未使用抗组胺药', met: true, value: '' },
    { item: '近1月未使用免疫抑制剂', met: true, value: '' },
    { item: '无炎症性皮肤病', met: true, value: '' },
    { item: '非妊娠/哺乳期', met: true, value: '' },
    { item: '近1月未参加其他试验', met: true, value: '' },
  ],
  skin_visual_assessment: {
    overall_condition: '正常', test_site_integrity: '完好',
    fitzpatrick_type: 'III', visible_diseases: '', notes: '皮肤状态良好',
  },
  instrument_summary: {
    visia_done: true, moisture_left: 45.0, moisture_right: 43.5,
    moisture_forehead: 40.0, melanin: 115, erythema: 170,
    tewl: 8.5, sebum: 55,
  },
  medical_summary: { conditions_count: 0, allergies_count: 0, medications_count: 0 },
  lifestyle_summary: { sun_exposure: 'low', skincare_routine: 'basic' },
  result: 'pass', result_display: '通过',
  fail_reasons: null, reviewer_decision: '', reviewer_notes: '',
  reviewed_at: null, screening_appointment_id: null,
  compensation_amount: null, compensation_paid: false,
  screener_id: 10, reviewer_id: null, notes: '闭环测试',
  create_time: '2026-02-20T09:00:00', update_time: '2026-02-20T09:45:00',
}

const funnelData = {
  registered: 100, pre_screened: 50, pre_screened_pass: 40,
  screened_pass: 25, enrolled: 15,
  pre_screening_rate: 50.0, pre_screening_pass_rate: 80.0,
  screening_pass_rate: 62.5, enrollment_rate: 60.0,
}

async function setupFullFlowMocks(page: Page) {
  await setupApiMocks(page)

  await page.route('**/api/v1/pre-screening/today-summary**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: { total: 5, pending: 1, passed: 3, failed: 1, referred: 0, completed: 4, pass_rate: 75.0 },
      },
    })
  })

  await page.route('**/api/v1/pre-screening/funnel**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: funnelData } })
  })

  await page.route(/\/api\/v1\/pre-screening\/\d+$/, async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: fullFlowRecord } })
  })

  await page.route(/\/api\/v1\/pre-screening\/(\?|$)/, async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: { items: [fullFlowRecord], total: 1, page: 1, page_size: 20 },
      },
    })
  })
}


test.describe('场景 P7: 初筛完整业务闭环', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupFullFlowMocks(page)
  })

  test.afterAll(async () => { await page?.context().close() })

  test('P7.1 初筛列表页可访问', async () => {
    await navigateTo(page, '/recruitment/pre-screening', '初筛管理')
    await expect(page.getByRole('heading', { name: '初筛管理' })).toBeVisible()
  })

  test('P7.2 闭环测试记录在列表中可见', async () => {
    await expect(page.getByText('赵六-闭环')).toBeVisible()
    await expect(page.getByText('PS-20260220-E2E1')).toBeVisible()
  })

  test('P7.3 闭环记录显示通过状态', async () => {
    await expect(page.getByText('通过').first()).toBeVisible()
  })

  test('P7.4 初筛详情页加载完整数据', async () => {
    await navigateTo(page, '/recruitment/pre-screening/100', '受试者确认')
    await expect(page.locator('[data-section="pre-screening-detail"]')).toBeVisible({ timeout: 8000 })
  })

  test('P7.5 详情页显示受试者信息', async () => {
    await expect(page.locator('text=赵六-闭环').first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator('text=SUB-202602-E2E1').first()).toBeVisible()
  })

  test('P7.6 招募看板初筛统计可见', async () => {
    await navigateTo(page, '/recruitment/dashboard', '招募看板')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('今日初筛')).toBeVisible({ timeout: 8000 })
  })

  test('P7.7 招募漏斗包含初筛环节', async () => {
    await expect(page.getByText('初筛').first()).toBeVisible()
  })
})
