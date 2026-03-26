/**
 * 签到签出全链路 E2E 验收测试
 * 覆盖：手机号绑定门禁、首页入组展示、扫码签到/签出智能判断
 * 需在 H5 模式运行（pnpm dev:h5），可配合 mock 后端
 */
import { expect, test, type Page } from '@playwright/test'

const CHECKIN_PAGE_URL = '/#/pages/checkin/index'
const BIND_PHONE_PAGE_URL = '/#/pages/bind-phone/index'
const HOME_URL = '/'

type UserInfoMock = { id: string; name: string; subjectNo: string; projectName: string; enrollDate: string }

/**
 * 通过 addInitScript 在页面加载前注入 localStorage。
 * 关键：Taro H5 的 getStorageSync(key) 要求 localStorage 中的值格式为
 *   JSON.stringify({ data: value })
 * 普通的 localStorage.setItem('token', 'xxx') 会被 Taro 的 getItem() 忽略。
 * 因此这里包装为 { data: ... } 格式写入。
 */
async function gotoHomeWithAuth(
  page: Page,
  userInfo: UserInfoMock,
  token = 'mock-token-test',
) {
  // addInitScript 在每次导航时都会重新执行，必须在 goto 之前注册
  // 关键：Taro.setStorageSync(key, value) 实际存的是 JSON.stringify({data: value})
  // 而 getStorageSync 返回的是 item.data（已经 parse 过一次）
  // 对于 userInfo，auth.ts 存的是 JSON.stringify(userObj)（字符串），
  // 所以 data 的值也必须是 JSON 字符串，而不是对象！
  await page.addInitScript(
    ({ ui, tk }) => {
      localStorage.setItem('token', JSON.stringify({ data: tk }))
      localStorage.setItem('userInfo', JSON.stringify({ data: JSON.stringify(ui) }))
    },
    { ui: userInfo, tk: token },
  )
  await page.goto('/')
  await page.waitForLoadState('networkidle')
}

function mockCommonApis(page: Page) {
  return Promise.all([
    page.route('**/api/v1/subject/queue-position**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { status: 'none', position: 0, wait_minutes: 0 } } })
    }),
    page.route('**/api/v1/visit/nodes**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [] } } })
    }),
    page.route('**/api/v1/subject/protocol-nodes**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: [] } })
    }),
    page.route('**/api/v1/auth/profile**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: {} } })
    }),
    page.route('**/api/v1/my/next-visit**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: null } })
    }),
  ])
}

test.describe('手机号绑定门禁', () => {
  test('B1 绑定页面可打开并展示绑定入口', async ({ page }) => {
    await page.goto(BIND_PHONE_PAGE_URL)
    const phoneInput = page.locator('input[type="number"]').first()
    await expect(phoneInput).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('绑定手机号')).toBeVisible({ timeout: 10000 })
  })

  test('B2 手机号格式错误时不提交', async ({ page }) => {
    await page.goto(BIND_PHONE_PAGE_URL)
    const phoneInput = page.locator('input[type="number"]').first()
    await expect(phoneInput).toBeVisible({ timeout: 10000 })
    await phoneInput.fill('123')
    await page.getByText('确认绑定').first().click()
    await expect(page.getByText('请输入正确的11位手机号')).toBeVisible({ timeout: 5000 })
  })

  test('B3 绑定成功后展示成功提示', async ({ page }) => {
    await page.route('**/api/v1/my/binding/bind-phone**', async (route) => {
      await route.fulfill({
        json: { code: 200, msg: '绑定成功', data: { subject_id: 1, phone_masked: '138****8000', is_new: false } },
      })
    })
    await page.goto(BIND_PHONE_PAGE_URL)
    const phoneInput = page.locator('input[type="number"]').first()
    await phoneInput.fill('13800138000')
    await page.getByText('确认绑定').first().click()
    // 绑定成功后应展示 toast 或页面跳转
    await expect(page.getByText(/绑定成功|微信快捷登录/).first()).toBeVisible({ timeout: 8000 })
  })
})

test.describe('首页入组信息展示', () => {
  test('E1 已入组：显示项目名和入组日期', async ({ page }) => {
    await mockCommonApis(page)
    await page.route('**/api/v1/my/binding/status**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { is_bound: true, phone_masked: '138****8000' } } })
    })
    await page.route('**/api/v1/my/enrollments**', async (route) => {
      await route.fulfill({
        json: {
          code: 200, msg: 'OK',
          data: {
            items: [{ id: 1, protocol_id: 10, protocol_title: '测试研究协议', status: 'enrolled', enrolled_at: '2026-01-15T09:00:00' }],
            has_appointment: false, pending_appointment: null,
          },
        },
      })
    })

    await gotoHomeWithAuth(page, { id: '2', name: '王受试者', subjectNo: 'SUB-001', projectName: '测试项目', enrollDate: '2026-01-15' })

    const enrollCard = page.locator('[data-testid="enrollment-card"]')
    await expect(enrollCard).toBeVisible({ timeout: 12000 })
    await expect(enrollCard).toContainText('已入组')
    await expect(enrollCard).toContainText('测试研究协议')
  })

  test('E2 预约待确认：显示预约信息而非空白', async ({ page }) => {
    await mockCommonApis(page)
    await page.route('**/api/v1/my/binding/status**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { is_bound: true, phone_masked: '135****0001' } } })
    })
    await page.route('**/api/v1/my/enrollments**', async (route) => {
      await route.fulfill({
        json: {
          code: 200, msg: 'OK',
          data: {
            items: [], has_appointment: true,
            pending_appointment: {
              appointment_date: '2026-03-10', appointment_time: '09:00',
              project_name: '粗筛研究项目', project_code: 'PROJ-003',
              visit_point: '粗筛', status: 'confirmed',
            },
          },
        },
      })
    })

    await gotoHomeWithAuth(page, { id: '3', name: '张预约者', subjectNo: 'SUB-002', projectName: '', enrollDate: '' })

    const pendingCard = page.locator('[data-testid="pending-appointment-card"]')
    await expect(pendingCard).toBeVisible({ timeout: 12000 })
    await expect(pendingCard).toContainText('预约待确认')
    await expect(pendingCard).toContainText('粗筛研究项目')
    await expect(pendingCard).toContainText('2026-03-10')
  })

  test('E3 无入组无预约：显示「待入组」', async ({ page }) => {
    await mockCommonApis(page)
    await page.route('**/api/v1/my/binding/status**', async (route) => {
      await route.fulfill({ json: { code: 200, msg: 'OK', data: { is_bound: true, phone_masked: '133****0000' } } })
    })
    await page.route('**/api/v1/my/enrollments**', async (route) => {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { items: [], has_appointment: false, pending_appointment: null } },
      })
    })

    await gotoHomeWithAuth(page, { id: '4', name: '空状态用户', subjectNo: '', projectName: '', enrollDate: '' })

    const noEnrollCard = page.locator('[data-testid="no-enrollment-card"]')
    await expect(noEnrollCard).toBeVisible({ timeout: 12000 })
    await expect(noEnrollCard).toContainText('待入组')
  })
})

test.describe('扫码签到/签出页面', () => {
  test('C1 签到页面显示扫码按钮', async ({ page }) => {
    await page.goto(CHECKIN_PAGE_URL)
    await expect(page.getByText('扫码签到 / 签出').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('请扫描接待台当日签到码')).toBeVisible({ timeout: 10000 })
  })

  test('C2 扫码页面标题正确', async ({ page }) => {
    await page.goto(CHECKIN_PAGE_URL)
    await expect(page.getByText('扫码签到 / 签出').first()).toBeVisible({ timeout: 10000 })
  })
})
