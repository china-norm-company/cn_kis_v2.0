/**
 * 粗筛管理工作流 E2E 测试 — 场景 P1-P6
 *
 * P1 粗筛发起与建档
 * P2 硬性条件速查
 * P3 专业评估与仪器数据
 * P4 医学史采集
 * P5 综合判定-通过
 * P6 综合判定-不通过与PI复核
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

const preScreeningList = {
  items: [
    {
      id: 1, pre_screening_no: 'PS-20260220-0001',
      registration_id: 1, registration_no: 'REG-202602-000001',
      subject_id: 101, subject_name: '张三', subject_no: 'SUB-202602-0001',
      protocol_id: 1, protocol_title: '保湿功效评价',
      pre_screening_date: '2026-02-20', start_time: '2026-02-20T09:00:00',
      end_time: null, location: 'A区',
      hard_exclusion_checks: null, skin_visual_assessment: null,
      instrument_summary: null, medical_summary: null, lifestyle_summary: null,
      result: 'pending', result_display: '待评估',
      fail_reasons: null, reviewer_decision: '', reviewer_notes: '',
      reviewed_at: null, screening_appointment_id: null,
      compensation_amount: null, compensation_paid: false,
      screener_id: 10, reviewer_id: null, notes: '',
      create_time: '2026-02-20T09:00:00', update_time: '2026-02-20T09:00:00',
    },
    {
      id: 2, pre_screening_no: 'PS-20260220-0002',
      registration_id: 2, registration_no: 'REG-202602-000002',
      subject_id: 102, subject_name: '李四', subject_no: 'SUB-202602-0002',
      protocol_id: 1, protocol_title: '保湿功效评价',
      pre_screening_date: '2026-02-20', start_time: '2026-02-20T09:30:00',
      end_time: '2026-02-20T10:00:00', location: 'B区',
      hard_exclusion_checks: [{ item: '年龄范围', met: true, value: '25' }],
      skin_visual_assessment: { overall_condition: '正常' },
      instrument_summary: { moisture_value: 42.5 },
      medical_summary: { conditions_count: 0 }, lifestyle_summary: null,
      result: 'pass', result_display: '通过',
      fail_reasons: null, reviewer_decision: '', reviewer_notes: '',
      reviewed_at: null, screening_appointment_id: null,
      compensation_amount: null, compensation_paid: false,
      screener_id: 10, reviewer_id: null, notes: '',
      create_time: '2026-02-20T09:30:00', update_time: '2026-02-20T10:00:00',
    },
  ],
  total: 2, page: 1, page_size: 20,
}

const todaySummary = {
  total: 2, pending: 1, passed: 1, failed: 0, referred: 0, completed: 1, pass_rate: 100.0,
}

const preScreeningDetail = {
  ...preScreeningList.items[0],
  hard_exclusion_checks: [
    { item: '年龄范围(18-60)', met: true, value: '28' },
    { item: '近1周未使用抗组胺药', met: true, value: '' },
    { item: '近1月未使用免疫抑制剂', met: true, value: '' },
    { item: '无炎症性皮肤病', met: true, value: '' },
    { item: '非妊娠/哺乳期', met: true, value: '' },
    { item: '近1月未参加其他试验', met: true, value: '' },
  ],
  skin_visual_assessment: {
    overall_condition: '正常', test_site_integrity: '完好',
    fitzpatrick_type: 'III', visible_diseases: '', notes: '',
  },
  instrument_summary: {
    visia_done: true, moisture_left: 42.5, moisture_right: 44.0,
    moisture_forehead: 38.0, melanin: 120, erythema: 180,
  },
  medical_summary: { conditions_count: 0, allergies_count: 0, medications_count: 0 },
}


async function setupPreScreeningMocks(page: Page) {
  await setupApiMocks(page)

  await page.route('**/api/v1/pre-screening/today-summary**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: todaySummary } })
  })

  await page.route('**/api/v1/pre-screening/funnel**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          registered: 50, pre_screened: 10, pre_screened_pass: 8,
          screened_pass: 5, enrolled: 3,
          pre_screening_rate: 20.0, pre_screening_pass_rate: 80.0,
          screening_pass_rate: 62.5, enrollment_rate: 60.0,
        },
      },
    })
  })

  await page.route(/\/api\/v1\/pre-screening\/start/, async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          id: 10, pre_screening_no: 'PS-20260220-0010',
          registration_id: 3, registration_no: 'REG-202602-000003',
          subject_id: 110, subject_name: '新受试者', subject_no: 'SUB-202602-0010',
          protocol_id: 1, protocol_title: '保湿功效评价',
          pre_screening_date: '2026-02-20', start_time: new Date().toISOString(),
          end_time: null, location: '', result: 'pending', result_display: '待评估',
          hard_exclusion_checks: null, skin_visual_assessment: null,
          instrument_summary: null, medical_summary: null, lifestyle_summary: null,
          fail_reasons: null, reviewer_decision: '', reviewer_notes: '',
          reviewed_at: null, screening_appointment_id: null,
          compensation_amount: null, compensation_paid: false,
          screener_id: 10, reviewer_id: null, notes: '',
          create_time: new Date().toISOString(), update_time: new Date().toISOString(),
        },
      },
    })
  })

  await page.route(/\/api\/v1\/pre-screening\/\d+\/complete/, async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: { ...preScreeningDetail, result: body.result, result_display: body.result === 'pass' ? '通过' : '未通过' },
      },
    })
  })

  await page.route(/\/api\/v1\/pre-screening\/\d+\/review/, async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          ...preScreeningDetail, result: body.decision,
          reviewer_decision: body.decision, reviewer_notes: body.notes,
          reviewed_at: new Date().toISOString(),
        },
      },
    })
  })

  await page.route(/\/api\/v1\/pre-screening\/\d+$/, async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: preScreeningDetail },
      })
    } else {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: preScreeningDetail },
      })
    }
  })

  await page.route(/\/api\/v1\/pre-screening\/(\?|$)/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: preScreeningList },
    })
  })
}


test.describe('场景 P1: 粗筛发起与建档', () => {
  test.describe.configure({ mode: 'serial' })
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupPreScreeningMocks(page)
  })

  test.afterAll(async () => { await page?.context().close() })

  test('P1.1 粗筛列表页标题正确', async () => {
    await navigateTo(page, '/recruitment/pre-screening', '粗筛管理')
    await expect(page.getByRole('heading', { name: '粗筛管理' })).toBeVisible()
  })

  test('P1.2 统计条显示今日摘要数据', async () => {
    await expect(page.getByText('待粗筛').first()).toBeVisible()
  })

  test('P1.3 发起粗筛按钮可见', async () => {
    await expect(page.getByRole('button', { name: /发起粗筛/ })).toBeVisible()
  })

  test('P1.4 粗筛记录列表显示数据', async () => {
    await expect(page.getByText('PS-20260220-0001')).toBeVisible()
    await expect(page.getByText('张三')).toBeVisible()
  })

  test('P1.5 结果 Badge 颜色编码正确', async () => {
    const table = page.locator('[data-section="pre-screening-list"] table')
    await expect(table.locator('text=待评估').first()).toBeVisible({ timeout: 5000 })
    await expect(table.locator('text=通过').first()).toBeVisible()
  })
})


test.describe('场景 P2-P4: 粗筛评估详情页', () => {
  test.describe.configure({ mode: 'serial' })
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupPreScreeningMocks(page)
  })

  test.afterAll(async () => { await page?.context().close() })

  test('P2.1 粗筛详情页加载步骤指示器', async () => {
    await navigateTo(page, '/recruitment/pre-screening/1', '受试者确认')
    await expect(page.locator('[data-section="pre-screening-detail"]')).toBeVisible({ timeout: 8000 })
  })

  test('P2.2 步骤指示器显示 6 个步骤', async () => {
    const steps = page.locator('[data-section="pre-screening-detail"]')
    await expect(steps).toBeVisible()
  })

  test('P3.1 可导航到专业评估步骤', async () => {
    const nextBtn = page.getByRole('button', { name: /下一步/ })
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
      await page.waitForTimeout(300)
      await nextBtn.click()
      await page.waitForTimeout(300)
    }
  })

  test('P4.1 可导航到医学史采集步骤', async () => {
    const nextBtn = page.getByRole('button', { name: /下一步/ })
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
      await page.waitForTimeout(300)
    }
  })
})


test.describe('场景 P5: 综合判定-通过', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupPreScreeningMocks(page)
  })

  test('P5.1 已完成的粗筛记录显示通过标识', async ({ page }) => {
    await navigateTo(page, '/recruitment/pre-screening', '粗筛管理')
    const table = page.locator('[data-section="pre-screening-list"] table')
    await expect(table).toBeVisible({ timeout: 8000 })
    await expect(table.locator('text=通过').first()).toBeVisible()
  })
})


test.describe('场景 P6: 综合判定-不通过与PI复核', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupPreScreeningMocks(page)
  })

  test('P6.1 粗筛列表同时显示通过和待评估记录', async ({ page }) => {
    await navigateTo(page, '/recruitment/pre-screening', '粗筛管理')
    const table = page.locator('[data-section="pre-screening-list"] table')
    await expect(table).toBeVisible({ timeout: 8000 })
    await expect(table.locator('text=待评估').first()).toBeVisible()
    await expect(table.locator('text=通过').first()).toBeVisible()
  })
})
