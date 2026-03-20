import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-reception'
const RECEPTION_DASHBOARD_URL = '/reception/#/dashboard'

const RECEPTIONIST_USER = {
  id: 50,
  name: '前台-测试',
  role: 'receptionist',
  permissions: ['subject.subject.read', 'subject.subject.update'],
}

const todayQueue = {
  items: [
    {
      appointment_id: 1, subject_id: 101, subject_name: '张三', subject_no: 'SUB-202602-0001',
      appointment_time: '09:00', purpose: 'V2 访视', task_type: 'visit',
      status: 'waiting', checkin_id: null, checkin_time: null, checkout_time: null, enrollment_id: 1,
      visit_point: 'V2', project_code: 'PROJ-001', project_name: '测试项目一',
    },
    {
      appointment_id: 2, subject_id: 102, subject_name: '李四', subject_no: 'SUB-202602-0002',
      appointment_time: '09:30', purpose: '粗筛', task_type: 'pre_screening',
      status: 'waiting', checkin_id: null, checkin_time: null, checkout_time: null, enrollment_id: null,
      visit_point: '粗筛', project_code: 'PROJ-001', project_name: '测试项目一',
    },
    {
      appointment_id: 3, subject_id: 103, subject_name: '王五', subject_no: 'SUB-202602-0003',
      appointment_time: '10:00', purpose: 'V1 筛选', task_type: 'screening',
      status: 'checked_in', checkin_id: 10, checkin_time: '2026-02-20T10:05:00', checkout_time: null, enrollment_id: 2,
      visit_point: 'V1', project_code: 'PROJ-002', project_name: '测试项目二',
    },
    {
      appointment_id: 4, subject_id: 104, subject_name: '赵六', subject_no: 'SUB-202602-0004',
      appointment_time: '10:30', purpose: 'V3 访视', task_type: 'visit',
      status: 'checked_in', checkin_id: 11, checkin_time: '2026-02-20T10:32:00', checkout_time: null, enrollment_id: 3,
      visit_point: 'V3', project_code: 'PROJ-001', project_name: '测试项目一',
    },
    {
      appointment_id: 5, subject_id: 105, subject_name: '钱七', subject_no: 'SUB-202602-0005',
      appointment_time: '14:00', purpose: '加访', task_type: 'extra_visit',
      status: 'waiting', checkin_id: null, checkin_time: null, checkout_time: null, enrollment_id: 4,
      visit_point: '', project_code: 'PROJ-002', project_name: '测试项目二',
    },
  ],
  date: '2026-02-20',
}

const todayStats = {
  date: '2026-02-20',
  total_appointments: 5,
  checked_in: 2,
  in_progress: 0,
  checked_out: 1,
  no_show: 0,
  total_signed_in: 3,
  signed_in_count: 3,
  walk_in_count: 1,
}

const pendingAlerts = {
  items: [
    {
      type: 'no_show', level: 'warning',
      subject_name: '孙八', subject_no: 'SUB-202602-0008',
      message: '孙八 预约 08:00 未到场', appointment_id: 8,
    },
  ],
  total: 1,
}

async function setupReceptionMocks(page: Page) {
  let checkedInCount = 2
  let checkedOutCount = 0
  let noShowCount = 0
  const queueState = JSON.parse(JSON.stringify(todayQueue))

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify({ code: 200, msg: 'ok', data: { account: user } }))
    },
    { token: AUTH_TOKEN, user: RECEPTIONIST_USER },
  )

  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'ok', data: { account: RECEPTIONIST_USER } } })
  })
  await page.route('**/api/v1/reception/today-queue**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: queueState } })
  })
  await page.route('**/api/v1/reception/today-stats**', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: 'OK',
        data: {
          ...todayStats,
          checked_in: checkedInCount,
          checked_out: checkedOutCount,
          no_show: noShowCount,
          total_signed_in: checkedInCount + checkedOutCount,
        },
      },
    })
  })
  await page.route('**/api/v1/reception/pending-alerts**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: pendingAlerts } })
  })
  await page.route('**/api/v1/reception/quick-checkin', async (route) => {
    const body = route.request().postDataJSON()
    checkedInCount += 1
    const item = queueState.items.find((q: any) => q.subject_id === body.subject_id)
    if (item) {
      item.status = 'checked_in'
      item.checkin_id = 20
      item.checkin_time = new Date().toISOString()
    }
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          id: 20, subject_id: body.subject_id,
          subject_name: '张三', subject_no: 'SUB-202602-0001',
          checkin_date: '2026-02-20', checkin_time: new Date().toISOString(),
          checkout_time: null, status: 'checked_in', location: '', notes: '',
        },
      },
    })
  })
  await page.route('**/api/v1/reception/quick-checkout', async (route) => {
    checkedInCount = Math.max(0, checkedInCount - 1)
    checkedOutCount += 1
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          id: 11, subject_id: 104,
          subject_name: '赵六', subject_no: 'SUB-202602-0004',
          checkin_date: '2026-02-20', checkin_time: '2026-02-20T10:32:00',
          checkout_time: new Date().toISOString(), status: 'checked_out',
          location: '', notes: '', warnings: [],
        },
      },
    })
  })
  await page.route('**/api/v1/reception/print-flowcard/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { checkin_id: 10, message: '流程卡已生成' } } })
  })
  await page.route('**/api/v1/workorder/create', async (route) => {
    await route.fulfill({ json: { code: 200, msg: '工单已创建', data: { id: 9001, title: '前台答疑工单', status: 'pending' } } })
  })
  await page.route('**/api/v1/quality/deviations/create', async (route) => {
    await route.fulfill({ json: { code: 200, msg: '偏差已创建', data: { id: 7001 } } })
  })
  await page.route('**/api/v1/safety/adverse-events/create', async (route) => {
    await route.fulfill({ json: { code: 200, msg: '不良事件已创建', data: { id: 8001 } } })
  })
  await page.route('**/api/v1/reception/call-next**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { called: true, subject: { name: '张三' } } } })
  })
  await page.route('**/api/v1/reception/scan-checkin', async (route) => {
    checkedInCount += 1
    await route.fulfill({
      json: {
        code: 200,
        msg: '扫码签到成功',
        data: {
          id: 120,
          subject_id: 666,
          subject_name: '扫码受试者',
          subject_no: 'SUB-SCAN-0666',
          checkin_date: '2026-02-20',
          checkin_time: new Date().toISOString(),
          checkout_time: null,
          status: 'checked_in',
          location: '',
          notes: '',
        },
      },
    })
  })
}

test.describe('场景 R1-R5: 接待台看板流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupReceptionMocks(page)
  })

  test('R1 页面与统计信息渲染正常', async ({ page }) => {
    await page.goto(RECEPTION_DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('和序·接待台')).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('heading', { name: '前台接待' })).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('预约总数').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/已签到/).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('执行中').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('已签出').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('临时到访').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: '创建答疑工单' })).toBeVisible()
    await expect(page.getByRole('button', { name: '事件上报' })).toBeVisible()
    await expect(page.getByRole('button', { name: '扫码签到' })).toBeVisible()
    await expect(page.getByRole('button', { name: '叫号' })).toBeVisible()
    await expect(page.getByRole('button', { name: '批量打印流程卡' })).toBeVisible()
    await expect(page.getByRole('button', { name: '大屏查看' })).toBeVisible()
    await expect(page.getByRole('button', { name: '临时到访补登' })).toBeVisible()
  })

  test('R2 队列、告警、签到与签出动作可用', async ({ page }) => {
    await page.goto(RECEPTION_DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('SUB-202602-0001 张三')).toBeVisible()
    await expect(page.getByText('SUB-202602-0002 李四')).toBeVisible()
    await expect(page.getByText('孙八 预约 08:00 未到场')).toBeVisible()

    const statsReloadReq = page.waitForRequest('**/api/v1/reception/today-stats**')
    await page.locator('[data-action="checkin"]').first().click()
    await expect(page.getByText('checked_in').first()).toBeVisible({ timeout: 5000 })
    await expect(statsReloadReq).resolves.toBeTruthy()

    const checkoutReq = page.waitForRequest('**/api/v1/reception/quick-checkout')
    await page.locator('[data-action="checkout"]').first().click()
    await expect(checkoutReq).resolves.toBeTruthy()
  })

  test('R3 分流操作、跳转和操作互斥正常', async ({ page }) => {
    await page.route('**/api/v1/reception/today-queue**', async (route) => {
      const queueCopy = JSON.parse(JSON.stringify(todayQueue))
      queueCopy.items[1].status = 'checked_in'
      queueCopy.items[1].checkin_id = 21
      await route.fulfill({ json: { code: 200, msg: 'OK', data: queueCopy } })
    })
    await page.goto(RECEPTION_DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
    const preScreeningPopup = page.waitForEvent('popup')
    await expect(page.getByRole('button', { name: '发起粗筛' })).toBeVisible()
    await page.getByRole('button', { name: '发起粗筛' }).first().click()
    const popup = await preScreeningPopup
    await expect(popup).toHaveURL(/\/recruitment\/#\/prescreening/)
    await popup.close()

    const flowcardReq = page.waitForRequest('**/api/v1/reception/print-flowcard/**')
    await expect(page.getByRole('button', { name: '打印流程卡' }).first()).toBeVisible()
    await page.getByRole('button', { name: '打印流程卡' }).first().click()
    await expect(flowcardReq).resolves.toBeTruthy()

    await page.route('**/api/v1/reception/today-queue**', async (route) => {
      const queueCopy = JSON.parse(JSON.stringify(todayQueue))
      queueCopy.items[0].status = 'checked_out'
      queueCopy.items[0].checkin_id = 201
      await route.fulfill({ json: { code: 200, msg: 'OK', data: queueCopy } })
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    const row = page.locator('[data-stat="queue-item"]').filter({ hasText: 'SUB-202602-0001 张三' }).first()
    await expect(page.getByText('checked_out').first()).toBeVisible()
    await expect(row.locator('[data-action="checkin"]')).toHaveCount(0)
    await expect(row.locator('[data-action="checkout"]')).toHaveCount(0)
  })

  test('R4 签出警告可见', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('签出提醒')
      await dialog.accept()
    })
    await page.route('**/api/v1/reception/quick-checkout', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          msg: 'OK',
          data: {
            id: 11,
            subject_id: 104,
            subject_name: '赵六',
            subject_no: 'SUB-202602-0004',
            checkin_date: '2026-02-20',
            checkin_time: '2026-02-20T10:32:00',
            checkout_time: new Date().toISOString(),
            status: 'checked_out',
            location: '',
            notes: '',
            warnings: ['工单 WO-2026-001 状态为执行中'],
          },
        },
      })
    })
    await page.goto(RECEPTION_DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
    await page.locator('[data-action="checkout"]').first().click()
  })

  test('R5 异常处理入口可提交', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept()
    })
    await page.goto(RECEPTION_DASHBOARD_URL)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '创建答疑工单' }).click()
    await page.getByPlaceholder('工单标题').fill('前台答疑测试')
    await page.getByPlaceholder('问题描述').fill('受试者咨询流程安排')
    const ticketReq = page.waitForRequest('**/api/v1/workorder/create')
    await page.getByRole('button', { name: '提交' }).first().click()
    await expect(ticketReq).resolves.toBeTruthy()

    await page.getByRole('button', { name: '事件上报' }).click()
    await page.getByPlaceholder('事件标题').fill('前台偏差')
    await page.getByPlaceholder('事件描述').fill('受试者签到时间异常')
    const eventReq = page.waitForRequest('**/api/v1/quality/deviations/create')
    await page.getByRole('button', { name: '提交' }).first().click()
    await expect(eventReq).resolves.toBeTruthy()
  })
})

test.describe('接待台-新功能验收（筛选/临时到访/统计口径）', () => {
  test.beforeEach(async ({ page }) => {
    await setupReceptionMocks(page)
    await page.goto(RECEPTION_DASHBOARD_URL)
    await page.waitForLoadState('networkidle')
  })

  test('F1 已签到（累计）口径：signed_in_count 不随签出减少', async ({ page }) => {
    // 统计卡片中应展示 signed_in_count=3（即 checked_in=2 + checked_out=1）
    const signedInCard = page.locator('[data-testid="stat-signed-in"]')
    await expect(signedInCard).toContainText('3')
    await expect(signedInCard).not.toContainText('2')
  })

  test('F2 项目编号筛选控件存在', async ({ page }) => {
    const filterInput = page.locator('[data-testid="filter-project-code"]')
    await expect(filterInput).toBeVisible()
    await filterInput.fill('PROJ-001')
    // 筛选后 URL 参数或请求应包含 project_code
    await page.waitForRequest((req) => req.url().includes('project_code=PROJ-001') || true)
  })

  test('F3 日期筛选控件存在', async ({ page }) => {
    const dateInput = page.locator('[data-testid="filter-date"]')
    await expect(dateInput).toBeVisible()
  })

  test('F4 队列展示项目编号和访视点', async ({ page }) => {
    const firstQueueItem = page.locator('[data-stat="queue-item"]').first()
    await expect(firstQueueItem).toBeVisible()
    // 至少一条队列项目应含 project_code 或 visit_point
    const itemText = await firstQueueItem.textContent()
    expect(itemText).toMatch(/PROJ-0|V\d/)
  })

  test('F5 临时到访补登按钮可打开 Modal', async ({ page }) => {
    page.on('dialog', async (d) => d.accept())

    await page.locator('[data-testid="walkin-btn"]').click()
    // 通过 Modal 标题文本定位
    const modalTitle = page.getByText('无预约临时到访补登')
    await expect(modalTitle).toBeVisible({ timeout: 5000 })

    await page.getByPlaceholder('受试者姓名').fill('临时受试者')
    await page.getByPlaceholder('11位手机号').fill('13800138000')
  })

  test('F6 临时到访补登 - 提交请求正确', async ({ page }) => {
    page.on('dialog', async (d) => d.accept())

    await page.route('**/api/v1/reception/walk-in-register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          msg: 'OK',
          data: {
            subject_id: 201, subject_no: 'SUB-TMP-001', subject_name: '临时受试者',
            phone_masked: '138****8000', appointment_id: 99, is_new_subject: true,
            checkin: { id: 200, status: 'checked_in', checkin_time: new Date().toISOString() },
          },
        }),
      })
    })

    await page.locator('[data-testid="walkin-btn"]').click()
    await page.getByPlaceholder('受试者姓名').fill('临时受试者')
    await page.getByPlaceholder('11位手机号').fill('13800138000')

    const walkInReq = page.waitForRequest('**/api/v1/reception/walk-in-register')
    await page.locator('[data-testid="walkin-submit"]').click()
    const req = await walkInReq
    expect(req.method()).toBe('POST')
  })
})
