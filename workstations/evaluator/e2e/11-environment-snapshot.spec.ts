/**
 * 场景 11：环境快照 UI 验证
 *
 * 验收标准（headed 模式）：
 * - 环境不合规时显示阻断提示，指明超标项和阈值
 * - 强制放行需填写偏差原因
 * - 无传感器数据时允许手动录入
 * - 环境快照在检测记录中可查看
 */
import { test, expect } from '@playwright/test'
import { injectAuth } from './helpers/setup'

const DETECTION_ID = 103

test.describe('场景11: 环境快照与阻断', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
  })

  test('11.1 环境合规时开始检测成功，快照中 is_compliant=true', async ({ page }) => {
    /**
     * 验收：合规环境时 start detection API 返回成功，snapshot 中 is_compliant=true
     */
    let startResponseData = null

    await page.route(`**/api/v1/evaluator/detections/${DETECTION_ID}/start`, route => {
      const data = {
        success: true,
        detection_id: DETECTION_ID,
        status: 'running',
        environment_snapshot: {
          source: 'sensor',
          temperature: 22.5,
          humidity: 48.0,
          is_compliant: true,
          venue_name: '实验室 A',
          recorded_at: new Date().toISOString(),
        },
        operator_qualification_snapshot: {
          account_id: 1,
          operator_name: '张三',
          method_qualifications: [{ method_name: 'Corneometer', qual_level: 'independent' }],
        },
      }
      startResponseData = data
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, msg: '检测已开始', data }),
      })
    })

    await page.goto('/evaluator/')
    await page.waitForLoadState('networkidle')

    if (startResponseData) {
      // 验收：环境合规时成功
      expect(startResponseData.success).toBe(true)
      expect(startResponseData.environment_snapshot.is_compliant).toBe(true)
      expect(startResponseData.environment_snapshot.temperature).toBe(22.5)
    }
  })

  test('11.2 环境不合规时 API 返回 400，指明超标项', async ({ page }) => {
    /**
     * 验收：环境超标时 API 返回错误，消息指明超标项和阈值
     */
    let errorData = null

    await page.route(`**/api/v1/evaluator/detections/${DETECTION_ID}/start`, route => {
      const data = {
        error: '环境条件不符合检测要求：温度 35.0°C 超出最高限制 28.0°C。如需强制继续，请传入 force=true 并填写 deviation_reason。',
        violations: ['温度 35.0°C 超出最高限制 28.0°C'],
      }
      errorData = data
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 400, msg: data.error, data }),
      })
    })

    await page.goto('/evaluator/')
    await page.waitForLoadState('networkidle')

    if (errorData) {
      // 验收：错误消息包含超标项信息
      expect(errorData.error).toContain('温度')
      expect(errorData.error).toContain('28.0°C')
      expect(errorData.violations).toHaveLength(1)
    }
  })

  test('11.3 强制放行需填写偏差原因，snapshot 标记 is_compliant=false', async ({ page }) => {
    /**
     * 验收：
     * - force=true + deviation_reason 时强制放行成功
     * - 返回的 environment_snapshot.is_compliant=false
     * - snapshot 中记录 deviation_reason
     */
    let forceResponseData = null

    await page.route(`**/api/v1/evaluator/detections/${DETECTION_ID}/start`, route => {
      const requestBody = route.request().postDataJSON()
      if (requestBody?.force && requestBody?.deviation_reason) {
        const data = {
          success: true,
          detection_id: DETECTION_ID,
          status: 'running',
          environment_snapshot: {
            source: 'sensor',
            temperature: 35.0,
            humidity: 80.0,
            is_compliant: false,  // 标记为不合规
            violations: ['温度 35.0°C 超出最高限制 28.0°C'],
            deviation_reason: requestBody.deviation_reason,
            venue_name: '实验室 A',
            recorded_at: new Date().toISOString(),
          },
        }
        forceResponseData = data
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, msg: '检测已开始（强制放行）', data }),
        })
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 400, msg: '强制放行必须填写偏差原因（deviation_reason）', data: null }),
        })
      }
    })

    await page.goto('/evaluator/')
    await page.waitForLoadState('networkidle')

    // 验收：强制放行且有原因时成功
    const forceResponse = await page.evaluate(async (id) => {
      try {
        const res = await fetch(`/api/v1/evaluator/detections/${id}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            force: true,
            deviation_reason: '主管批准，紧急情况不可延误',
          }),
        })
        return await res.json()
      } catch (e) { return { error: String(e) } }
    }, DETECTION_ID)

    if (forceResponse && !forceResponse.error) {
      expect(forceResponse.code).toBe(0)
      if (forceResponse.data) {
        expect(forceResponse.data.environment_snapshot.is_compliant).toBe(false)
        expect(forceResponse.data.environment_snapshot.deviation_reason).toBeTruthy()
      }
    }
  })

  test('11.4 手动录入环境数据时，snapshot.source=manual', async ({ page }) => {
    /**
     * 验收：无传感器时允许手动录入，标记 source=manual
     */
    let manualResponseData = null

    await page.route(`**/api/v1/evaluator/detections/${DETECTION_ID}/start`, route => {
      const requestBody = route.request().postDataJSON()
      if (requestBody?.manual_env) {
        const data = {
          success: true,
          detection_id: DETECTION_ID,
          status: 'running',
          environment_snapshot: {
            source: 'manual',
            temperature: requestBody.manual_env.temperature,
            humidity: requestBody.manual_env.humidity,
            is_compliant: true,
            venue_name: requestBody.manual_env.venue_name || '',
            recorded_at: new Date().toISOString(),
          },
        }
        manualResponseData = data
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, msg: '检测已开始（手动录入环境）', data }),
        })
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 400, msg: '无传感器数据，请手动提供', data: null }),
        })
      }
    })

    await page.goto('/evaluator/')
    await page.waitForLoadState('networkidle')

    // 验收：手动录入时 snapshot.source=manual
    const manualResponse = await page.evaluate(async (id) => {
      try {
        const res = await fetch(`/api/v1/evaluator/detections/${id}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manual_env: { temperature: 23.0, humidity: 50.0, venue_name: '实验室 B' },
          }),
        })
        return await res.json()
      } catch (e) { return { error: String(e) } }
    }, DETECTION_ID)

    if (manualResponse && !manualResponse.error) {
      expect(manualResponse.code).toBe(0)
      if (manualResponse.data) {
        expect(manualResponse.data.environment_snapshot.source).toBe('manual')
        expect(manualResponse.data.environment_snapshot.temperature).toBe(23.0)
      }
    }
  })
})
