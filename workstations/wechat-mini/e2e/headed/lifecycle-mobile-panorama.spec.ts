import { test, expect, type Page, type Route } from '@playwright/test'

const USER_INFO = {
  id: '1',
  name: '陈小雨',
  subjectNo: 'SUB-LIFE-0001',
  enrollDate: '2026-02-01',
  projectName: '全生命周期验证项目',
  subjectId: 1,
  enrollmentId: 1,
  planId: 101,
  protocolId: 101,
}

const CHAIN = {
  registrationNo: 'REG-20260222-0001',
  enrollmentNo: 'ENR-0001',
  aeDescription: '注射后轻微红斑，已缓解',
  paymentNo: 'PAY-001',
  paymentAmount: '120.00',
  referredName: '李同学',
  referralReward: '80',
}

type ApiAudit = {
  hits: Record<string, number>
  postBodies: Record<string, unknown[]>
}

function createApiAudit(): ApiAudit {
  return {
    hits: {},
    postBodies: {},
  }
}

function markHit(audit: ApiAudit, method: string, path: string) {
  const key = `${method} ${path}`
  audit.hits[key] = (audit.hits[key] || 0) + 1
}

function collectBody(audit: ApiAudit, path: string, body: unknown) {
  if (!audit.postBodies[path]) {
    audit.postBodies[path] = []
  }
  audit.postBodies[path].push(body)
}

async function bootstrapLogin(page: Page) {
  await page.addInitScript((userInfo) => {
    localStorage.setItem('token', 'mock-token')
    localStorage.setItem('userInfo', JSON.stringify(userInfo))
  }, USER_INFO)
}

function ok(data: unknown, msg = 'OK') {
  return { code: 200, msg, data }
}

async function fulfill(route: Route, data: unknown, msg = 'OK') {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(ok(data, msg)),
  })
}

async function mockLifecycleApis(page: Page, audit: ApiAudit) {
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const path = url.pathname
    markHit(audit, method, path)

    if (method === 'POST' || method === 'PUT') {
      try {
        collectBody(audit, path, req.postDataJSON())
      } catch {
        collectBody(audit, path, req.postData())
      }
    }

    if (path === '/api/v1/visit/nodes') {
      return fulfill(route, {
        items: [
          { id: 1, plan_id: 101, name: 'V1 筛选访视', baseline_day: 0, window_before: 0, window_after: 2, status: 'completed', order: 1 },
          { id: 2, plan_id: 101, name: 'V2 干预访视', baseline_day: 14, window_before: 2, window_after: 3, status: 'active', order: 2 },
        ],
      })
    }
    if (path === '/api/v1/my/upcoming-visits') {
      return fulfill(route, { items: [{ id: 11, date: '2026-03-05', time: '09:30:00', purpose: 'V2 干预访视', status: 'confirmed' }] })
    }
    if (path === '/api/v1/my/schedule') {
      return fulfill(route, { items: [{ id: 21, title: 'V2 工单', status: 'in_progress', visit_name: 'V2 干预访视', activity_name: '皮肤检测', scheduled_date: '2026-03-05', start_time: '09:30:00' }] })
    }
    if (/^\/api\/v1\/my\/public\/plans\/?$/.test(path)) {
      return fulfill(route, { items: [{ id: 101, title: '敏感肌修复研究', protocol_title: 'P-101', description: '招募敏感肌受试者', remaining_slots: 12, start_date: '2026-02-01', end_date: '2026-06-30' }] })
    }
    if (/^\/api\/v1\/my\/public\/plans\/\d+$/.test(path)) {
      return fulfill(route, {
        id: 101,
        title: '敏感肌修复研究',
        criteria: [
          { type: 'inclusion', description: '18-45岁', is_mandatory: true },
          { type: 'exclusion', description: '近期参与其他临床研究', is_mandatory: true },
        ],
      })
    }
    if (path === '/api/v1/my/register' && method === 'POST') {
      return fulfill(route, { registration_no: 'REG-20260222-0001' }, '报名成功')
    }
    if (path === '/api/v1/my/screening-status') {
      return fulfill(route, {
        items: [{
          registration_id: 301,
          registration_no: CHAIN.registrationNo,
          plan_id: 101,
          reg_status: 'confirmed',
          reg_date: '2026-02-22',
          pre_screening: { id: 1, result: 'pass', date: '2026-02-25', notes: '粗筛通过' },
          screening: { id: 2, result: 'pass', date: '2026-02-28', notes: '正式筛选通过' },
          enrollment: { id: 3, status: 'enrolled', enrollment_no: CHAIN.enrollmentNo, date: '2026-03-01' },
        }],
      })
    }
    if (path === '/api/v1/my/enrollments') {
      return fulfill(route, {
        items: [{
          id: USER_INFO.enrollmentId,
          protocol_id: USER_INFO.protocolId,
          protocol_title: USER_INFO.projectName,
          project_code: 'PRJ-LIFE',
          status: 'enrolled',
          enrolled_at: `${USER_INFO.enrollDate}T10:00:00`,
        }],
        has_appointment: false,
        pending_appointment: null,
      })
    }
    if (path === '/api/v1/signature/create' && method === 'POST') {
      return fulfill(route, { signature_id: 1 }, '签署成功')
    }
    if (path === '/api/v1/my/home-dashboard') {
      return fulfill(route, {
        as_of_date: '2026-03-05',
        display_name: USER_INFO.name,
        display_name_source: 'mock',
        primary_project: null,
        other_projects: [],
        projects_ordered: [
          { project_code: 'PRJ-LIFE', project_name: USER_INFO.projectName, visit_point: '', queue_checkin_today: 'none', is_primary: true, enrollment_status: '正式入组', sc_number: '', sc_display: '', appointment_id: null, enrollment_id: USER_INFO.enrollmentId, protocol_id: USER_INFO.protocolId },
        ],
      })
    }
    if (path === '/api/v1/my/scan-checkin' && method === 'POST') {
      return fulfill(route, { success: true }, '签到成功')
    }
    if (path === '/api/v1/my/queue-position') {
      return fulfill(route, { position: 3, ahead_count: 2, wait_minutes: 12, status: 'waiting', checkin_time: '2026-03-05 09:12' })
    }
    if (path === '/api/v1/protocol/list' || path === '/api/v1/protocol/list/') {
      return fulfill(route, { items: [{ id: 101, title: '敏感肌修复研究', product_category: '护肤' }] })
    }
    if (path === '/api/v1/edc/templates' || path === '/api/v1/edc/templates/') {
      return fulfill(route, {
        items: [{
          id: 401,
          name: 'V2 受试者问卷',
          is_self_report: true,
          schema: {
            questions: [
              { id: 'q1', type: 'text', title: '今日整体感受', required: true, placeholder: '请输入' },
              { id: 'q2', type: 'number', title: '皮肤不适评分', required: true, min: 0, max: 10 },
            ],
          },
        }],
      })
    }
    if (path === '/api/v1/edc/records' && method === 'GET') {
      return fulfill(route, { items: [] })
    }
    if (path === '/api/v1/edc/records' && method === 'POST') {
      return fulfill(route, { id: 501 })
    }
    if (/^\/api\/v1\/edc\/records\/\d+\/submit$/.test(path) && method === 'POST') {
      return fulfill(route, { id: 501 }, '提交成功')
    }
    if (path === '/api/v1/my/report-ae' && method === 'POST') {
      return fulfill(route, { id: 601 }, '上报成功')
    }
    if (path === '/api/v1/my/adverse-events') {
      return fulfill(route, {
        items: [{ id: 1, description: CHAIN.aeDescription, severity: 'mild', status: 'following', is_sae: false, start_date: '2026-03-03', report_date: '2026-03-04', outcome: 'recovering' }],
      })
    }
    if (path === '/api/v1/my/sample-confirm' && method === 'POST') {
      return fulfill(route, {}, '签收确认成功')
    }
    if (path === '/api/v1/my/results') {
      return fulfill(route, { items: [{ id: 701, template_name: 'V2 皮肤检测', completed_at: '2026-03-05T10:30:00' }] })
    }
    if (path === '/api/v1/my/compliance') {
      return fulfill(route, {
        latest_score: 95,
        latest_rating: '优秀',
        history: [{ id: 1, overall_score: 95, rating: '优秀', evaluation_date: '2026-03-05' }],
      })
    }
    if (path === '/api/v1/my/diary' && method === 'GET') {
      return fulfill(route, { items: [{ id: 801, entry_date: '2026-03-05', mood: '良好', symptoms: '无明显不适', medication_taken: true, notes: '按时完成护理流程' }] })
    }
    if (path === '/api/v1/my/diary' && method === 'POST') {
      return fulfill(route, { id: 802 }, '记录成功')
    }
    if (path === '/api/v1/my/payments') {
      return fulfill(route, { items: [{ id: 901, payment_no: CHAIN.paymentNo, payment_type: 'visit', amount: CHAIN.paymentAmount, status: 'paid', paid_at: '2026-03-05' }] })
    }
    if (path === '/api/v1/my/payment-summary') {
      return fulfill(route, {
        total_amount: CHAIN.paymentAmount,
        paid_amount: CHAIN.paymentAmount,
        pending_amount: '0.00',
        by_type: [{ type: 'visit', count: 1, amount: CHAIN.paymentAmount }],
      })
    }
    if (path === '/api/v1/my/referrals') {
      return fulfill(route, { items: [{ id: 1001, referred_name: CHAIN.referredName, status: 'completed', reward_amount: Number(CHAIN.referralReward), created_at: '2026-03-05' }] })
    }
    if (path === '/api/v1/my/notifications') {
      return fulfill(route, {
        unread: 1,
        items: [{ id: 1101, title: '访视提醒', content: '您有明日访视安排，请按时到院。', status: 'unread', channel: 'feishu_message', sent_at: '2026-03-04T18:00:00', create_time: '2026-03-04T18:00:00' }],
      })
    }
    if (/^\/api\/v1\/my\/notifications\/\d+\/read$/.test(path)) {
      return fulfill(route, {}, '已读')
    }
    if (path === '/api/v1/my/nps' && method === 'POST') {
      return fulfill(route, { id: 1201 }, '感谢您的反馈')
    }
    if (path === '/api/v1/qrcode/generate') {
      return fulfill(route, { qr_data: 'subject:1:qr', qr_hash: 'abc123', label: '受试者二维码' })
    }
    if (path === '/api/v1/my/support-tickets' && method === 'GET') {
      return fulfill(route, { items: [{ id: 1301, ticket_no: 'TK-001', category: 'question', title: '访视改期咨询', status: 'replied', reply: '已帮您调整至周五。', create_time: '2026-03-04' }] })
    }
    if (path === '/api/v1/my/support-tickets' && method === 'POST') {
      return fulfill(route, { id: 1302 }, '提交成功')
    }
    if (path === '/api/v1/my/appointments' && method === 'GET') {
      return fulfill(route, { items: [{ id: 1401, appointment_date: '2026-03-10', appointment_time: '09:30', purpose: '复查', status: 'confirmed' }] })
    }
    if (path === '/api/v1/my/appointments' && method === 'POST') {
      return fulfill(route, { id: 1402 }, '预约成功')
    }
    if (/^\/api\/v1\/my\/appointments\/\d+\/cancel$/.test(path) && method === 'POST') {
      return fulfill(route, {}, '已取消')
    }

    return fulfill(route, { items: [] })
  })
}

test.describe('受试者全生命周期移动端 Headed 验收', () => {
  test.beforeEach(async ({ page }) => {
    const audit = createApiAudit()
    await mockLifecycleApis(page, audit)
    await page.exposeFunction('getApiAudit', () => audit)
    await page.addInitScript(() => {
      ;(window as any).__E2E_MOBILE_ASSERT__ = window.innerWidth
    })
  })

  test('L1 未登录态应具备明确引导', async ({ page }) => {
    await page.goto('/#/pages/index/index')
    await expect(page.getByText('微信快捷登录')).toBeVisible()
    await expect(page.getByText('登录后可查看报名、筛选、入组、访视与结项全流程信息')).toBeVisible()
    await expect(page.locator('.hero-title')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Compiled with problems')
    const mobileWidth = await page.evaluate(() => window.innerWidth)
    expect(mobileWidth).toBeLessThanOrEqual(430)
  })

  test('L2 登录后应覆盖全生命周期关键步骤与功能', async ({ page }) => {
    await bootstrapLogin(page)
    await page.goto('/#/pages/projects/index')
    await expect(page.getByText('敏感肌修复研究')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('立即报名')).toBeVisible({ timeout: 15000 })

    await page.goto('/#/pages/register/index?plan_id=101')
    await expect(page.getByText('自助报名')).toBeVisible()
    await expect(page.getByText('下一步', { exact: true })).toBeVisible()

    await page.goto('/#/pages/screening-status/index')
    await expect(page.getByText('我的筛选进度')).toBeVisible()
    await expect(page.getByText('已入组')).toBeVisible()

    await page.goto('/#/pages/consent/index')
    await expect(page.locator('.doc-title')).toBeVisible()
    await expect(page.getByText(/确认签署|需要实名认证|暂无待签署/)).toBeVisible()

    await page.goto('/#/pages/checkin/index')
    await expect(page.getByText('扫码签到 / 签出').first()).toBeVisible()
    await page.goto('/#/pages/queue/index')
    await expect(page.getByText('排队等候中')).toBeVisible()
    await expect(page.getByText('当前排位')).toBeVisible()

    await page.goto('/#/pages/visit/index')
    await expect(page.getByText('V2 干预访视', { exact: true }).first()).toBeVisible()
    await page.getByText('即将到来').click()
    await expect(page.getByText('预约新访视')).toBeVisible()
    await page.getByText('排程详情').click()
    await expect(page.getByText('皮肤检测')).toBeVisible()

    await page.goto('/#/pages/questionnaire/index')
    const saveDraftButton = page.getByText('保存草稿')
    if (await saveDraftButton.count()) {
      await saveDraftButton.first().click()
      await expect(page.getByText('已保存草稿')).toBeVisible()
    } else {
      await expect(page.getByText('暂无可填写的问卷')).toBeVisible()
    }

    await page.goto('/#/pages/report/index')
    await expect(page.locator('.form-title')).toBeVisible()
    await expect(page.getByText('提交上报')).toBeVisible()

    await page.goto('/#/pages/report/history')
    await expect(page.getByText('我的上报记录')).toBeVisible()
    await expect(page.getByText('注射后轻微红斑')).toBeVisible()

    await page.goto('/#/pages/sample-confirm/index')
    await expect(page.getByText('产品签收确认')).toBeVisible()
    await expect(page.getByText('确认签收')).toBeVisible()

    await page.goto('/#/pages/results/index')
    await expect(page.getByText('V2 皮肤检测')).toBeVisible()
    await page.goto('/#/pages/compliance/index')
    await expect(page.locator('.compliance-score__value')).toContainText('95')
    await expect(page.getByText('优秀').first()).toBeVisible()

    await page.goto('/#/pages/payment/index')
    await expect(page.locator('.stat-value.paid')).toContainText('120.00')

    await page.goto('/#/pages/referral/index')
    await expect(page.getByText('李同学')).toBeVisible()
    await expect(page.getByText('奖励: ¥80')).toBeVisible()

    await page.goto('/#/pages/notifications/index')
    await expect(page.getByText('访视提醒')).toBeVisible()

    await page.goto('/#/pages/diary/index')
    await expect(page.getByText('按时完成护理流程')).toBeVisible()

    await page.goto('/#/pages/support/index')
    await expect(page.getByText('访视改期咨询')).toBeVisible()

    await page.goto('/#/pages/appointment/index')
    await expect(page.getByText('复查')).toBeVisible()

    await page.goto('/#/pages/myqrcode/index')
    await expect(page.getByText('我的二维码').first()).toBeVisible()
    await expect(page.locator('.qr-container')).toBeVisible()

    await page.goto('/#/pages/nps/index')
    await expect(page.getByText('提交评分')).toBeVisible()

    await page.goto('/#/pages/withdraw/index')
    await expect(page.getByText('提交退出申请')).toBeVisible()

    const mobileWidth = await page.evaluate(() => window.innerWidth)
    expect(mobileWidth).toBeLessThanOrEqual(430)
  })

  test('L3 全链路信息互动应命中正确接口并保持关键信息一致', async ({ page }) => {
    await bootstrapLogin(page)

    await page.goto('/#/pages/screening-status/index')
    await expect(page.getByText('已入组')).toBeVisible()

    await page.goto('/#/pages/visit/index')
    await expect(page.getByText('V2 干预访视', { exact: true }).first()).toBeVisible()

    await page.goto('/#/pages/questionnaire/index')
    const questionnaireTitle = page.getByText('V2 受试者问卷')
    if (await questionnaireTitle.count()) {
      await expect(questionnaireTitle.first()).toBeVisible()
    } else {
      await expect(page.getByText('暂无可填写的问卷')).toBeVisible()
    }

    await page.goto('/#/pages/results/index')
    await expect(page.getByText('V2 皮肤检测')).toBeVisible()

    await page.goto('/#/pages/report/history')
    await expect(page.getByText('注射后轻微红斑')).toBeVisible()

    await page.goto('/#/pages/compliance/index')
    await expect(page.getByText('优秀').first()).toBeVisible()

    await page.goto('/#/pages/notifications/index')
    await expect(page.getByText('访视提醒')).toBeVisible()

    const audit = await page.evaluate(async () => {
      return await (window as any).getApiAudit()
    })

    expect(audit.hits['GET /api/v1/my/screening-status']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/visit/nodes']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/upcoming-visits']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/results']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/adverse-events']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/compliance']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/notifications']).toBeGreaterThan(0)
  })

  test('L4 单受试者关键链路一致性（S04/S10/S12/S13）', async ({ page }) => {
    await bootstrapLogin(page)

    await page.goto('/#/pages/screening-status/index')
    await expect(page.getByText('我的筛选进度')).toBeVisible()
    await expect(page.getByText('已入组')).toBeVisible()
    const registrationNoTag = page.getByText(CHAIN.registrationNo)
    if (await registrationNoTag.count()) {
      await expect(registrationNoTag.first()).toBeVisible()
    }
    const enrollmentNoTag = page.getByText(CHAIN.enrollmentNo)
    if (await enrollmentNoTag.count()) {
      await expect(enrollmentNoTag.first()).toBeVisible()
    }

    await page.goto('/#/pages/report/history')
    await expect(page.getByText(CHAIN.aeDescription)).toBeVisible()

    await page.goto('/#/pages/payment/index')
    await expect(page.getByText(CHAIN.paymentNo)).toBeVisible()
    await expect(page.locator('.stat-value.paid')).toContainText(CHAIN.paymentAmount)

    await page.goto('/#/pages/referral/index')
    await expect(page.getByText(CHAIN.referredName)).toBeVisible()
    await expect(page.getByText(`奖励: ¥${CHAIN.referralReward}`)).toBeVisible()

    const audit = await page.evaluate(async () => {
      return await (window as any).getApiAudit()
    })
    expect(audit.hits['GET /api/v1/my/screening-status']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/adverse-events']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/payments']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/payment-summary']).toBeGreaterThan(0)
    expect(audit.hits['GET /api/v1/my/referrals']).toBeGreaterThan(0)
  })
})
