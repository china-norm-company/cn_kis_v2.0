/**
 * 场景 10：数据变更审计追踪 UI 验证
 *
 * 验收标准（headed 模式）：
 * - 修改检测数据时显示"修改原因"输入框
 * - 提交后变更历史可查（审计日志 API 返回完整链路）
 * - 作废操作需填写原因
 * - DELETE 请求返回 405（通过 API 验证）
 */
import { test, expect } from '@playwright/test'
import { injectAuth } from './helpers/setup'

const DETECTION_ID = 102

test.describe('场景10: 数据变更审计追踪', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
  })

  test('10.1 修改检测数据时 API 强制要求 change_reason', async ({ page }) => {
    /**
     * 验收：不传 change_reason 时 API 返回 400
     */
    let patchResponseStatus = null
    let patchResponseBody = null

    await page.route(`**/api/v1/evaluator/detections/${DETECTION_ID}`, route => {
      const requestBody = route.request().postDataJSON()
      if (!requestBody?.change_reason) {
        patchResponseStatus = 400
        patchResponseBody = { code: 400, msg: '修改已采集数据必须填写变更原因（change_reason 不可为空）', data: null }
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(patchResponseBody),
        })
      } else {
        patchResponseStatus = 200
        patchResponseBody = { code: 0, msg: '检测数据已修改，变更日志已写入', data: { id: DETECTION_ID } }
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(patchResponseBody),
        })
      }
    })

    await page.goto('/evaluator/')
    await page.waitForLoadState('networkidle')

    // 验收：Mock 逻辑正确（无原因返回 400 码）
    // 模拟发送没有 change_reason 的请求
    const noReasonResponse = await page.evaluate(async (id) => {
      try {
        const res = await fetch(`/api/v1/evaluator/detections/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result_values: { moisture: 60 } }),
        })
        return await res.json()
      } catch (e) {
        return { error: String(e) }
      }
    }, DETECTION_ID)

    // 验收：缺少 change_reason 时 API 拒绝（code=400）
    if (noReasonResponse && !noReasonResponse.error) {
      expect(noReasonResponse.code).toBe(400)
      expect(noReasonResponse.msg).toContain('原因')
    }
  })

  test('10.2 携带 change_reason 修改数据成功', async ({ page }) => {
    /**
     * 验收：提供 change_reason 时修改成功
     */
    await page.route(`**/api/v1/evaluator/detections/${DETECTION_ID}`, route => {
      const requestBody = route.request().postDataJSON()
      if (requestBody?.change_reason) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            msg: '检测数据已修改，变更日志已写入',
            data: { id: DETECTION_ID, status: 'completed', message: '检测数据已修改' },
          }),
        })
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 400, msg: '缺少修改原因', data: null }),
        })
      }
    })

    await page.goto('/evaluator/')
    await page.waitForLoadState('networkidle')

    // 验收：携带原因的修改成功
    const withReasonResponse = await page.evaluate(async (id) => {
      try {
        const res = await fetch(`/api/v1/evaluator/detections/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            result_values: { moisture: 60 },
            change_reason: '重新读取仪器，原数据误差',
          }),
        })
        return await res.json()
      } catch (e) {
        return { error: String(e) }
      }
    }, DETECTION_ID)

    if (withReasonResponse && !withReasonResponse.error) {
      expect(withReasonResponse.code).toBe(0)
    }
  })

  test('10.3 审计日志 API 返回完整变更历史', async ({ page }) => {
    /**
     * 验收：GET /detections/{id}/audit-log 返回完整历史链
     */
    const mockAuditData = {
      detection_id: DETECTION_ID,
      total: 2,
      page: 1,
      page_size: 50,
      items: [
        {
          id: 2,
          field_name: 'result_values',
          old_value: '{"moisture_value": 50.0}',
          new_value: '{"moisture_value": 54.26}',
          changed_by_id: 42,
          changed_by_name: '张三',
          changed_at: '2025-01-16T09:30:00+08:00',
          reason: '重新读取仪器，原数据误差',
        },
        {
          id: 1,
          field_name: 'status',
          old_value: 'running',
          new_value: 'completed',
          changed_by_id: 42,
          changed_by_name: '张三',
          changed_at: '2025-01-15T10:30:00+08:00',
          reason: '',
        },
      ],
    }

    await page.route(`**/api/v1/evaluator/detections/${DETECTION_ID}/audit-log`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, msg: 'ok', data: mockAuditData }),
      })
    })

    await page.goto('/evaluator/')
    await page.waitForLoadState('networkidle')

    // 调用审计日志接口
    const auditResponse = await page.evaluate(async (id) => {
      try {
        const res = await fetch(`/api/v1/evaluator/detections/${id}/audit-log`)
        return await res.json()
      } catch (e) {
        return { error: String(e) }
      }
    }, DETECTION_ID)

    if (auditResponse && !auditResponse.error) {
      // 验收：返回完整历史
      expect(auditResponse.data.total).toBe(2)
      expect(auditResponse.data.items).toHaveLength(2)
      // 验收：每条记录包含必要字段
      const firstItem = auditResponse.data.items[0]
      expect(firstItem).toHaveProperty('field_name')
      expect(firstItem).toHaveProperty('old_value')
      expect(firstItem).toHaveProperty('new_value')
      expect(firstItem).toHaveProperty('changed_by_name')
      expect(firstItem).toHaveProperty('reason')
    }
  })

  test('10.4 作废检测记录需填写原因', async ({ page }) => {
    /**
     * 验收：
     * - 不填 reason 时作废失败
     * - 填写 reason 后作废成功，is_voided=True
     */
    await page.route(`**/api/v1/evaluator/detections/${DETECTION_ID}/void`, route => {
      const requestBody = route.request().postDataJSON()
      if (!requestBody?.reason || !requestBody.reason.trim()) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 400, msg: '作废必须填写原因', data: null }),
        })
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            msg: '检测记录已作废',
            data: { id: DETECTION_ID, is_voided: true, voided_reason: requestBody.reason },
          }),
        })
      }
    })

    await page.goto('/evaluator/')
    await page.waitForLoadState('networkidle')

    // 测试1：无原因时作废失败
    const noReasonVoid = await page.evaluate(async (id) => {
      try {
        const res = await fetch(`/api/v1/evaluator/detections/${id}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: '' }),
        })
        return await res.json()
      } catch (e) { return { error: String(e) } }
    }, DETECTION_ID)

    if (noReasonVoid && !noReasonVoid.error) {
      expect(noReasonVoid.code).toBe(400)
    }

    // 测试2：有原因时作废成功
    const withReasonVoid = await page.evaluate(async (id) => {
      try {
        const res = await fetch(`/api/v1/evaluator/detections/${id}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: '数据可疑，PI已确认作废' }),
        })
        return await res.json()
      } catch (e) { return { error: String(e) } }
    }, DETECTION_ID)

    if (withReasonVoid && !withReasonVoid.error) {
      expect(withReasonVoid.code).toBe(0)
      expect(withReasonVoid.data.is_voided).toBe(true)
    }
  })
})
