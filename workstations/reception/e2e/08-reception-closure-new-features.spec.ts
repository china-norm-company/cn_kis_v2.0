import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-reception-closure'
const DASHBOARD_URL = '/reception/#/dashboard'

const USER = {
  id: 51,
  name: '前台-闭环测试',
  role: 'receptionist',
  permissions: ['subject.subject.read', 'subject.subject.update'],
}

async function setupBaseMocks(page: Page) {
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user } }))
    },
    { token: AUTH_TOKEN, user: USER },
  )

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: USER } } })
  })
  await page.route('**/api/v1/reception/today-stats**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'OK',
        data: {
          date: '2026-02-23',
          total_appointments: 4,
          checked_in: 2,
          in_progress: 1,
          checked_out: 1,
          no_show: 0,
          total_signed_in: 3,
        },
      },
    })
  })
  await page.route('**/api/v1/reception/today-queue**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'OK',
        data: {
          date: '2026-02-23',
          items: [
            {
              appointment_id: 1,
              subject_id: 901,
              subject_name: '闭环受试者A',
              subject_no: 'SUB-202602-0901',
              appointment_time: '09:00',
              purpose: 'V1筛选',
              task_type: 'screening',
              status: 'checked_in',
              checkin_id: 3001,
              checkin_time: '2026-02-23T09:05:00',
              checkout_time: null,
              enrollment_id: 5001,
            },
          ],
        },
      },
    })
  })
  await page.route('**/api/v1/reception/pending-alerts**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [], total: 0 } } })
  })
  await page.route('**/api/v1/reception/print-flowcard/**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'OK',
        data: {
          checkin_id: 3001,
          subject_id: 901,
          subject_no: 'SUB-202602-0901',
          subject_name: '闭环受试者A',
          checkin_time: '2026-02-23T09:05:00',
          enrollment_id: 5001,
          estimate_minutes: 45,
          message: '流程卡已生成',
          steps: [
            { sequence: 1, workorder_id: 1, workorder_no: 'WO-1', title: '接待登记', status: 'done', scheduled_date: '2026-02-23', visit_node_id: null, visit_activity_id: null },
            { sequence: 2, workorder_id: 2, workorder_no: 'WO-2', title: '筛选检查', status: 'doing', scheduled_date: '2026-02-23', visit_node_id: null, visit_activity_id: null },
          ],
        },
      },
    })
  })
  await page.route('**/api/v1/reception/flowcard/*/progress', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'OK',
        data: {
          checkin_id: 3001,
          total_steps: 2,
          done_steps: 1,
          doing_steps: 1,
          pending_steps: 0,
          progress_percent: 50,
          current_step: { sequence: 2, workorder_id: 2, workorder_no: 'WO-2', title: '筛选检查', status: 'doing', scheduled_date: '2026-02-23', visit_node_id: null, visit_activity_id: null },
          steps: [
            { sequence: 1, workorder_id: 1, workorder_no: 'WO-1', title: '接待登记', status: 'done', scheduled_date: '2026-02-23', visit_node_id: null, visit_activity_id: null },
            { sequence: 2, workorder_id: 2, workorder_no: 'WO-2', title: '筛选检查', status: 'doing', scheduled_date: '2026-02-23', visit_node_id: null, visit_activity_id: null },
          ],
        },
      },
    })
  })
}

test.describe('场景 R7-R9: 接待闭环新增能力', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseMocks(page)
  })

  test('R7 答疑工单SLA看板可指派和关闭', async ({ page }) => {
    await page.route('**/api/v1/execution/support-tickets**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            items: [
              {
                id: 7101,
                ticket_no: 'TKT-202602-000001',
                category: 'question',
                title: '筛选流程咨询',
                status: 'open',
                priority: 'high',
                assigned_to_id: null,
                sla: { due_at: '2026-02-23T12:00:00', remaining_minutes: -10, is_overdue: true, first_response_minutes: null },
                create_time: '2026-02-23T10:00:00',
              },
            ],
          },
        },
      })
    })
    await page.route('**/api/v1/execution/support-tickets/*/assign', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { id: 7101, status: 'in_progress' } } })
    })
    await page.route('**/api/v1/execution/support-tickets/*/close', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { id: 7101, status: 'closed' } } })
    })

    await page.goto(DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '前台接待' })).toBeVisible()
    await expect(page.getByText('答疑工单SLA')).toBeVisible()
    await expect(page.getByText('TKT-202602-000001')).toBeVisible()
    await expect(page.getByText('已逾期')).toBeVisible()

    const assignReq = page.waitForRequest('**/api/v1/execution/support-tickets/*/assign')
    await page.getByPlaceholder('Account ID').first().fill('10086')
    await page.getByRole('button', { name: '指派' }).first().click()
    await expect(assignReq).resolves.toBeTruthy()

    const closeReq = page.waitForRequest('**/api/v1/execution/support-tickets/*/close')
    await page.getByRole('button', { name: '关闭' }).first().click()
    await expect(closeReq).resolves.toBeTruthy()
  })

  test('R8 受试者轨迹页可查询13阶段事件', async ({ page }) => {
    await page.route('**/api/v1/subject/*/journey', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            events: [
              { stage: 'registration', time: '2026-02-20T09:00:00', title: '提交报名 REG-001', status: 'submitted' },
              { stage: 'screening', time: '2026-02-21T09:30:00', title: '筛选结果', status: 'pass' },
              { stage: 'checkin', time: '2026-02-23T09:05:00', title: '签到', status: 'checked_in' },
            ],
            stage_stats: { registration: 1, screening: 1, checkin: 1, checkout: 0 },
          },
        },
      })
    })

    await page.goto(DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: '受试者轨迹' }).click()
    await expect(page.getByText('受试者轨迹查询')).toBeVisible()

    const journeyReq = page.waitForRequest('**/api/v1/subject/*/journey')
    await page.getByPlaceholder('输入 subject_id').fill('901')
    await page.getByRole('button', { name: '查询轨迹' }).click()
    await expect(journeyReq).resolves.toBeTruthy()

    await expect(page.getByText('提交报名 REG-001')).toBeVisible()
    await expect(page.getByText('筛选结果')).toBeVisible()
    await expect(page.getByText('签到 · 签到')).toBeVisible()
  })

  test('R9 全景分析页显示指标与洞察', async ({ page }) => {
    await page.route('**/api/v1/reception/analytics**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            window: { from: '2026-02-10', to: '2026-02-23' },
            metrics: {
              total_appointments: 120,
              sign_in_rate: 92.5,
              no_show_rate: 6.2,
              avg_wait_minutes: 18.4,
              process_completion_rate: 88.7,
              ticket_closure_rate: 84.3,
            },
            trend: [
              { date: '2026-02-22', appointments: 9, checked_out: 8, no_show: 1, completion_rate: 88.9 },
              { date: '2026-02-23', appointments: 10, checked_out: 9, no_show: 1, completion_rate: 90.0 },
            ],
          },
        },
      })
    })
    await page.route('**/api/v1/reception/insights**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            generated_at: '2026-02-23T12:00:00',
            metrics: {
              total_appointments: 120,
              sign_in_rate: 92.5,
              no_show_rate: 6.2,
              avg_wait_minutes: 18.4,
              process_completion_rate: 88.7,
              ticket_closure_rate: 84.3,
            },
            insights: ['缺席率可控，建议保持双提醒机制', '工单闭环率高于80%，建议持续监测逾期个案'],
          },
        },
      })
    })
    await page.route('**/api/v1/subject/journey/stats**', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            window: { from: '2026-01-24', to: '2026-02-23' },
            checkin_count: 321,
            checkout_count: 300,
            no_show_count: 21,
            support_open: 8,
            support_closed: 67,
            withdrawn_subjects: 2,
          },
        },
      })
    })

    await page.goto(DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: '全景分析' }).click()
    await expect(page.getByText('签到率')).toBeVisible()
    await expect(page.getByText('92.5%')).toBeVisible()
    await expect(page.getByText('缺席率可控，建议保持双提醒机制')).toBeVisible()
    await expect(page.getByText('签到总数：321')).toBeVisible()
  })
})

test.describe('接待台大屏-动态签到码验收', () => {
  const DISPLAY_URL = '/reception/#/display'

  const displayBoardWithQrcode = {
    serving: [],
    waiting: [],
    waiting_total: 0,
    completed_count: 5,
    date: '2026-03-06',
    checkin_qrcode: {
      content: 'ckiss-station:1:20260306:ab12cd34',
      valid_date: '2026-03-06',
      station_label: '接待前台签到点',
    },
  }

  async function setupDisplayMocks(page: Page) {
    await page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_user', JSON.stringify(user))
        localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user } }))
      },
      { token: AUTH_TOKEN, user: USER },
    )
    await page.route('**/api/v1/auth/profile**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: USER } } })
    })
  }

  test('D1 大屏展示当日签到二维码区域', async ({ page }) => {
    await setupDisplayMocks(page)
    await page.route('**/api/v1/reception/display-board-data**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: displayBoardWithQrcode } })
    })
    await page.route('**/api/v1/qrcode/image**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
      })
    })

    await page.goto(DISPLAY_URL)
    await page.waitForLoadState('networkidle')

    const qrcodeArea = page.locator('[data-testid="qrcode-area"]')
    await expect(qrcodeArea).toBeVisible({ timeout: 10000 })
    await expect(qrcodeArea).toContainText('接待前台签到点')
    await expect(qrcodeArea).toContainText('2026-03-06')
    await expect(qrcodeArea).toContainText('扫码签到 / 签出')
  })

  test('D2 大屏无签到码时展示占位提示', async ({ page }) => {
    await setupDisplayMocks(page)
    const boardWithoutQr = { ...displayBoardWithQrcode, checkin_qrcode: null }
    await page.route('**/api/v1/reception/display-board-data**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: boardWithoutQr } })
    })

    await page.goto(DISPLAY_URL)
    await page.waitForLoadState('networkidle')

    const placeholder = page.locator('[data-testid="qrcode-placeholder"]')
    await expect(placeholder).toBeVisible({ timeout: 10000 })
    await expect(placeholder).toContainText('暂无签到二维码')
  })

  test('D3 统计数字展示在大屏', async ({ page }) => {
    await setupDisplayMocks(page)
    await page.route('**/api/v1/reception/display-board-data**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: displayBoardWithQrcode } })
    })
    await page.route('**/api/v1/qrcode/image**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') })
    })

    await page.goto(DISPLAY_URL)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-stat="completed"]')).toContainText('5', { timeout: 10000 })
    await expect(page.locator('[data-stat="waiting"]')).toContainText('0', { timeout: 10000 })
  })
})
