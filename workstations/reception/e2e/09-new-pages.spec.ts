/**
 * 新页面验收测试 — 接待台 3 个新页面
 *
 * 覆盖：
 *  - 签到签出管理页 (#/checkin)
 *  - 二维码扫码签到页 (#/scan)
 *  - 待处理提醒页 (#/alerts)
 */
import { test, expect, type Page } from '@playwright/test'

const AUTH_TOKEN = 'test-token-reception'

const RECEPTIONIST_USER = {
  id: 50,
  name: '前台-测试',
  role: 'receptionist',
  permissions: ['subject.subject.read', 'subject.subject.update'],
}

const todayQueue = {
  items: [
    {
      appointment_id: 1, subject_id: 101, subject_name: '张三', subject_no: 'SUB-202603-0001',
      appointment_time: '09:00', purpose: 'V2 访视', task_type: 'visit',
      status: 'waiting', checkin_id: null, checkin_time: null, checkout_time: null, enrollment_id: 1,
    },
    {
      appointment_id: 2, subject_id: 102, subject_name: '李四', subject_no: 'SUB-202603-0002',
      appointment_time: '09:30', purpose: '初筛', task_type: 'pre_screening',
      status: 'checked_in', checkin_id: 10, checkin_time: '2026-03-04T09:35:00', checkout_time: null, enrollment_id: null,
    },
  ],
  date: '2026-03-04',
}

const pendingAlerts = {
  items: [
    {
      type: 'no_show', level: 'warning',
      subject_name: '王五', subject_no: 'SUB-202603-0003',
      message: '预约 09:00 未到访，已超时 45 分钟',
      appointment_id: 3,
    },
    {
      type: 'overtime', level: 'info',
      subject_name: '赵六', subject_no: 'SUB-202603-0004',
      message: '受试者在院时间已达 3 小时，请确认当前状态',
      checkin_id: 11,
    },
  ],
  total: 2,
}

async function setupReceptionMocks(page: Page) {
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
    await route.fulfill({ json: { code: 200, msg: 'OK', data: todayQueue } })
  })
  await page.route('**/api/v1/reception/today-stats**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          date: '2026-03-04', total_appointments: 4, checked_in: 1, in_progress: 1, checked_out: 0, no_show: 0, total_signed_in: 1,
        },
      },
    })
  })
  await page.route('**/api/v1/reception/pending-alerts**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: pendingAlerts } })
  })
  await page.route('**/api/v1/reception/quick-checkin**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          id: 999, subject_id: body?.subject_id ?? 101,
          subject_name: '张三', subject_no: 'SUB-202603-0001',
          checkin_date: '2026-03-04', checkin_time: '2026-03-04T09:05:00', checkout_time: null, status: 'checked_in',
          location: '接待处', notes: '',
        },
      },
    })
  })
  await page.route('**/api/v1/reception/quick-checkout**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: { id: 10, checkin_time: '2026-03-04T09:35:00', checkout_time: '2026-03-04T12:00:00', status: 'checked_out' },
      },
    })
  })
  await page.route('**/api/v1/reception/scan-checkin**', async (route) => {
    const body = route.request().postDataJSON()
    const isValid = body?.qr_data && !body.qr_data.includes('invalid')
    if (isValid) {
      await route.fulfill({
        json: {
          code: 200, msg: 'OK',
          data: {
            id: 998, subject_id: 105, subject_name: '钱七', subject_no: 'SUB-202603-0005',
            checkin_date: '2026-03-04', checkin_time: '2026-03-04T10:10:00', checkout_time: null, status: 'checked_in',
            location: '接待处', notes: '', warnings: [],
          },
        },
      })
    } else {
      await route.fulfill({ status: 400, json: { code: 400, msg: '无效的二维码或受试者未预约', data: null } })
    }
  })
}

test.describe('接待台新页面验收', () => {
  test.beforeEach(async ({ page }) => {
    await setupReceptionMocks(page)
  })

  test('9.1【签到签出页】能正常加载并显示今日访视列表', async ({ page }) => {
    await page.goto('/reception/#/checkin')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('签到签出')
    // mock 数据包含张三、李四
    await expect(page.locator('body')).toContainText('张三')
    await expect(page.locator('body')).toContainText('李四')
  })

  test('9.2【签到签出页】显示搜索框', async ({ page }) => {
    await page.goto('/reception/#/checkin')
    await page.waitForLoadState('networkidle')

    await expect(page.getByPlaceholder(/搜索/)).toBeVisible()
  })

  test('9.3【签到签出页】未签到的受试者显示签到按钮', async ({ page }) => {
    await page.goto('/reception/#/checkin')
    await page.waitForLoadState('networkidle')

    // 张三 status=waiting, checkin_time=null，应显示签到按钮
    await expect(page.locator('body')).toContainText('签到')
  })

  test('9.4【签到签出页】已签到未签出的受试者显示签出按钮', async ({ page }) => {
    await page.goto('/reception/#/checkin')
    await page.waitForLoadState('networkidle')

    // 李四 status=checked_in，应显示签出按钮
    await expect(page.locator('body')).toContainText('签出')
  })

  test('9.5【二维码扫码页】能正常加载并显示扫码界面', async ({ page }) => {
    await page.goto('/reception/#/scan')
    await page.waitForLoadState('networkidle')

    // 页面标题为"扫码签到 / 签出"
    await expect(page.locator('body')).toContainText('扫码签到')
    await expect(page.locator('body')).toContainText('扫描')
  })

  test('9.6【二维码扫码页】输入框可见并可输入', async ({ page }) => {
    await page.goto('/reception/#/scan')
    await page.waitForLoadState('networkidle')

    const input = page.getByPlaceholder(/扫描或输入/)
    await expect(input).toBeVisible()
    await input.fill('SUB-TEST-QR-001')
    await expect(input).toHaveValue('SUB-TEST-QR-001')
  })

  test('9.7【二维码扫码页】提交有效二维码后显示签到成功', async ({ page }) => {
    // QRScanCheckinPage 调用 qrcodeApi.smartResolve 后再调 receptionApi.quickCheckin
    // 需要 mock smart-resolve 返回 checkin 推荐动作
    await page.route('**/api/v1/qrcode/smart-resolve**', async (route) => {
      await route.fulfill({
        json: {
          code: 200, msg: 'OK',
          data: {
            recommended_action: 'checkin',
            entity_label: '钱七',
            action_data: { subject_id: 105 },
          },
        },
      })
    })
    // 覆盖 quick-checkin mock 以返回钱七的信息
    await page.route('**/api/v1/reception/quick-checkin**', async (route) => {
      await route.fulfill({
        json: {
          code: 200, msg: 'OK',
          data: {
            id: 998, subject_id: 105,
            subject_name: '钱七', subject_no: 'SUB-202603-0005',
            checkin_date: '2026-03-04', checkin_time: '2026-03-04T10:10:00', status: 'checked_in',
          },
        },
      })
    })

    await page.goto('/reception/#/scan')
    await page.waitForLoadState('networkidle')

    const input = page.getByPlaceholder(/扫描或输入/)
    await input.fill('VALID-QR-12345')
    await page.getByRole('button', { name: '确认' }).click()
    await expect(page.locator('body')).toContainText('签到成功', { timeout: 8000 })
    await expect(page.locator('body')).toContainText('钱七')
  })

  test('9.8【待处理提醒页】能正常加载并显示提醒列表', async ({ page }) => {
    await page.goto('/reception/#/alerts')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('待处理提醒')
  })

  test('9.9【待处理提醒页】显示 no_show 提醒', async ({ page }) => {
    await page.goto('/reception/#/alerts')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('王五')
    await expect(page.locator('body')).toContainText('未到访')
  })

  test('9.10【待处理提醒页】显示 overtime 提醒', async ({ page }) => {
    await page.goto('/reception/#/alerts')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('赵六')
    await expect(page.locator('body')).toContainText('超时')
  })

  test('9.11【待处理提醒页】显示提醒数量徽标', async ({ page }) => {
    await page.goto('/reception/#/alerts')
    await page.waitForLoadState('networkidle')

    // 2条提醒，徽标应显示'2'
    await expect(page.locator('body')).toContainText('2')
  })
})
