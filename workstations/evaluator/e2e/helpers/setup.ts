/**
 * Playwright E2E 测试辅助 — 认证注入 + API 路由拦截
 *
 * 策略：
 * 1. 用 page.addInitScript 在页面 JS 执行前注入 localStorage
 *    → FeishuAuthProvider 读取后直接进入已登录态，跳过飞书 OAuth
 * 2. 用 page.route 拦截所有 /api/v1/ 请求，返回预设的模拟数据
 *    → 前端 axios 收到标准 {code, msg, data} 格式响应
 */
import { type Page } from '@playwright/test'
import {
  EVALUATOR_USER,
  AUTH_TOKEN,
  dashboardData,
  workOrderDetail,
  experimentSteps,
  buildScheduleData,
  sopList,
  profileData,
  scanResult,
  authProfileData,
  authProfileResponse,
  changeRequests,
  announcements,
  workOrderComments,
} from './mock-data'

/**
 * 向页面注入已登录状态
 * 使用 addInitScript，在页面 JS 执行前设置 localStorage
 */
export async function injectAuth(page: Page) {
  const token = AUTH_TOKEN
  const user = EVALUATOR_USER
  const profile = authProfileData

  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token, user, profile },
  )
}

// ============================================================================
// 工单状态管理器 — 模拟后端状态流转
// ============================================================================
class WorkOrderStateMachine {
  private status = 'pending'
  private steps: typeof experimentSteps = []
  private stepsInitialized = false

  getStatus() { return this.status }
  getSteps() { return this.steps }

  accept() {
    this.status = 'in_progress'
    return { success: true, status: this.status }
  }

  reject(reason: string) {
    this.status = 'rejected'
    return { success: true, status: this.status, reason }
  }

  prepare() {
    return { success: true }
  }

  initSteps() {
    this.steps = experimentSteps.map((s) => ({ ...s }))
    this.stepsInitialized = true
    return { step_count: this.steps.length, steps: this.steps }
  }

  startStep(stepId: number) {
    const step = this.steps.find((s) => s.id === stepId)
    if (step) {
      step.status = 'in_progress'
      step.started_at = new Date().toISOString()
    }
    return { success: true }
  }

  completeStep(stepId: number) {
    const step = this.steps.find((s) => s.id === stepId)
    if (step) {
      step.status = 'completed'
      step.completed_at = new Date().toISOString()
      step.actual_duration_minutes = step.estimated_duration_minutes
    }
    return { success: true }
  }

  skipStep(stepId: number, reason: string) {
    const step = this.steps.find((s) => s.id === stepId)
    if (step) {
      step.status = 'skipped'
      step.skip_reason = reason
    }
    return { success: true }
  }

  pause(reason: string) {
    this.status = 'suspended'
    return { success: true, reason }
  }

  resume() {
    this.status = 'in_progress'
    return { success: true }
  }
}

// ============================================================================
// API 路由拦截器
// ============================================================================
export async function setupApiMocks(page: Page) {
  const sm = new WorkOrderStateMachine()

  // Auth profile
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: authProfileResponse })
  })

  // Dashboard
  await page.route('**/api/v1/evaluator/my-dashboard**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: dashboardData } })
  })

  // My workorders
  await page.route('**/api/v1/evaluator/my-workorders**', async (route) => {
    await route.fulfill({
      json: {
        code: 0,
        msg: 'ok',
        data: { items: dashboardData.work_orders, total: dashboardData.work_orders.length },
      },
    })
  })

  // Schedule（支持 week_offset 与 month_offset，排程页用月份视图）
  await page.route('**/api/v1/evaluator/my-schedule**', async (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('month_offset') ?? url.searchParams.get('week_offset') ?? '0')
    const data = buildScheduleData(offset)
    if (!data.daily_notes) (data as Record<string, unknown>).daily_notes = {}
    if (!data.daily_attachments) (data as Record<string, unknown>).daily_attachments = {}
    if (!data.global_attachments) (data as Record<string, unknown>).global_attachments = []
    await route.fulfill({ json: { code: 0, msg: 'ok', data } })
  })

  // Profile
  await page.route('**/api/v1/evaluator/my-profile**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: profileData } })
  })

  // 图片识别 analyze-image：mock 成功响应，验证 UI 流程无网络失败
  await page.route('**/evaluator/schedule/analyze-image*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          msg: '成功识别并导入 1 条排程',
          data: { created: 1, items: [{ schedule_date: '2026-03-08', equipment: 'Corneometer', project_no: 'C25021007', room_no: 'D04-2', title: '设备:Corneometer | 项目:C25021007 | 房间:D04-2' }] },
        }),
      })
    } else {
      await route.continue()
    }
  })

  // Work order detail (GET) — need more specific pattern to avoid conflicts
  await page.route('**/api/v1/workorder/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    const match = route.request().url().match(/workorder\/(\d+)/)
    if (match) {
      const woId = Number(match[1])
      const detail = { ...workOrderDetail, id: woId, status: sm.getStatus() }
      await route.fulfill({ json: { code: 0, msg: 'ok', data: detail } })
    } else {
      await route.continue()
    }
  })

  // Accept work order
  await page.route('**/api/v1/evaluator/workorders/*/accept', async (route) => {
    const result = sm.accept()
    await route.fulfill({ json: { code: 0, msg: '工单已接受', data: result } })
  })

  // Reject work order
  await page.route('**/api/v1/evaluator/workorders/*/reject', async (route) => {
    const body = route.request().postDataJSON()
    const result = sm.reject(body?.reason ?? '')
    await route.fulfill({ json: { code: 0, msg: '工单已拒绝', data: result } })
  })

  // Prepare work order
  await page.route('**/api/v1/evaluator/workorders/*/prepare', async (route) => {
    const result = sm.prepare()
    await route.fulfill({ json: { code: 0, msg: '准备完成', data: result } })
  })

  // Init steps — must be before the generic steps route
  await page.route('**/api/v1/evaluator/workorders/*/steps/init', async (route) => {
    const result = sm.initSteps()
    await route.fulfill({ json: { code: 0, msg: '步骤已初始化', data: result } })
  })

  // Get steps
  await page.route('**/api/v1/evaluator/workorders/*/steps', async (route) => {
    if (route.request().method() === 'GET') {
      const steps = sm.getSteps()
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { items: steps, total: steps.length } },
      })
    } else {
      await route.continue()
    }
  })

  // Start step
  await page.route('**/api/v1/evaluator/steps/*/start', async (route) => {
    const match = route.request().url().match(/steps\/(\d+)\/start/)
    if (match) {
      const result = sm.startStep(Number(match[1]))
      await route.fulfill({ json: { code: 0, msg: '步骤已开始', data: result } })
    }
  })

  // Complete step
  await page.route('**/api/v1/evaluator/steps/*/complete', async (route) => {
    const match = route.request().url().match(/steps\/(\d+)\/complete/)
    if (match) {
      const result = sm.completeStep(Number(match[1]))
      await route.fulfill({ json: { code: 0, msg: '步骤已完成', data: result } })
    }
  })

  // Skip step
  await page.route('**/api/v1/evaluator/steps/*/skip', async (route) => {
    const match = route.request().url().match(/steps\/(\d+)\/skip/)
    if (match) {
      const body = route.request().postDataJSON()
      const result = sm.skipStep(Number(match[1]), body?.reason ?? '')
      await route.fulfill({ json: { code: 0, msg: '步骤已跳过', data: result } })
    }
  })

  // Pause
  await page.route('**/api/v1/evaluator/workorders/*/pause', async (route) => {
    const body = route.request().postDataJSON()
    const result = sm.pause(body?.reason ?? '')
    await route.fulfill({ json: { code: 0, msg: '工单已暂停', data: result } })
  })

  // Resume
  await page.route('**/api/v1/evaluator/workorders/*/resume', async (route) => {
    const result = sm.resume()
    await route.fulfill({ json: { code: 0, msg: '工单已恢复', data: result } })
  })

  // Exceptions (POST=create, GET=list)
  await page.route('**/api/v1/evaluator/workorders/*/exceptions', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: { code: 0, msg: '异常已上报', data: { exception_id: 9001 } },
      })
    } else {
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { items: [], total: 0 } },
      })
    }
  })

  // Detections (POST=create, GET=list)
  await page.route('**/api/v1/evaluator/workorders/*/detections', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: { code: 0, msg: '检测任务已创建', data: { detection_id: 5001 } },
      })
    } else {
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { items: [], total: 0 } },
      })
    }
  })

  // Start/Complete detection
  await page.route('**/api/v1/evaluator/detections/*/start', async (route) => {
    await route.fulfill({ json: { code: 0, msg: '检测已开始', data: { success: true } } })
  })
  await page.route('**/api/v1/evaluator/detections/*/complete', async (route) => {
    await route.fulfill({ json: { code: 0, msg: '检测已完成', data: { success: true } } })
  })

  // QR code resolve
  await page.route('**/api/v1/qrcode/resolve**', async (route) => {
    await route.fulfill({ json: { code: 0, msg: 'ok', data: scanResult } })
  })

  // Quality SOPs
  await page.route('**/api/v1/quality/sops**', async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { items: sopList, total: sopList.length } },
    })
  })

  // Signature create
  await page.route('**/api/v1/signature/sign', async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { id: 1, signed_at: new Date().toISOString() } },
    })
  })

  // Change requests (quality)
  await page.route('**/api/v1/quality/change-requests**', async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { items: changeRequests, total: changeRequests.length } },
    })
  })

  // Announcements
  await page.route('**/api/v1/notification/announcements**', async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { items: announcements, total: announcements.length } },
    })
  })

  // Work order comments
  await page.route('**/api/v1/workorder/*/comments', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { code: 0, msg: 'ok', data: { items: workOrderComments, total: workOrderComments.length } },
      })
    } else {
      await route.fulfill({
        json: { code: 0, msg: '评论已发送', data: { id: Date.now() } },
      })
    }
  })

  // Competency assessments
  await page.route('**/api/v1/hr/competency-assessments**', async (route) => {
    await route.fulfill({
      json: {
        code: 0,
        msg: 'ok',
        data: {
          items: [
            { assessment_name: 'Corneometer 操作能力', level: 'expert', score: 95, assessed_at: '2026-01-15' },
            { assessment_name: 'VISIA 成像分析', level: 'advanced', score: 88, assessed_at: '2025-12-20' },
            { assessment_name: '数据完整性管理', level: 'intermediate', score: 78, assessed_at: '2025-11-10' },
          ],
          total: 3,
        },
      },
    })
  })

  // Signature API
  await page.route('**/api/v1/signature/create', async (route) => {
    await route.fulfill({
      json: { code: 0, msg: 'ok', data: { id: 1, signed_at: new Date().toISOString() } },
    })
  })

  return sm
}
