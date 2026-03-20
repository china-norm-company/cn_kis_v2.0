/**
 * Headed 测试 — 共享 setup
 *
 * 复用主 e2e/helpers 中的认证和 API mock 基础设施，
 * 并增加飞书 API 调用追踪能力。
 */
import { type Page } from '@playwright/test'
import { injectAuth, setupApiMocks } from '../../helpers/setup'

export { injectAuth }

export interface FeishuCallRecord {
  api: string
  payload: unknown
  timestamp: number
}

/**
 * 设置所有 API mock + 飞书调用追踪
 */
export async function setupHeadedMocks(page: Page) {
  const rsm = await setupApiMocks(page)
  const feishuCalls: FeishuCallRecord[] = []

  // 拦截导出 API — 返回空文件而非触发下载
  await page.route('**/api/v1/lab-personnel/export/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: Buffer.from('mock-xlsx-content'),
      headers: { 'Content-Disposition': 'attachment; filename="export.xlsx"' },
    })
  })

  // 拦截授权日志 API
  await page.route('**/api/v1/lab-personnel/delegation-logs/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [], total: 0 } } })
  })

  // 拦截审计日志 API
  await page.route('**/api/v1/lab-personnel/audit-logs/**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: { items: [], total: 0 } } })
  })

  return { rsm, feishuCalls }
}

/**
 * 等待页面完全加载
 */
export async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
}
