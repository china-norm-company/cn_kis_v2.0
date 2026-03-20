/**
 * 排程图片识别 - Headed 验证测试
 *
 * 验证流程：导入图片 → 选择文件 → 识别并导入 → 等待结果
 * 需后端运行在 8001，前端 Vite 代理会将 /api 转发到后端
 *
 * 运行：cd apps/evaluator && pnpm test:e2e:headed -- e2e/12-schedule-image-import-headed.spec.ts
 * 或：pnpm --filter @cn-kis/evaluator exec playwright test --headed e2e/12-schedule-image-import-headed.spec.ts
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { injectAuth, setupApiMocks } from './helpers/setup'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.describe('排程图片识别 - Headed 验证', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('完整流程：点击导入图片 → 选择测试图 → 识别并导入 → 验证无网络失败', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto('/evaluator/schedule')
    await page.waitForLoadState('networkidle')

    // 1. 点击「导入图片」
    await page.getByRole('button', { name: '导入图片' }).click()

    // 2. 等待弹窗打开，标题为「识别排程图片」
    await expect(page.getByText('识别排程图片').first()).toBeVisible({ timeout: 5000 })

    // 3. 填写人员姓名（可选）
    const personInput = page.getByPlaceholder(/林紫倩/)
    await personInput.fill('林紫倩')

    // 4. 选择测试图片
    const fixturePath = path.resolve(__dirname, 'fixtures', 'schedule-test.jpg')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(fixturePath)

    // 5. 等待缩略图显示
    await expect(page.getByText('schedule-test.jpg')).toBeVisible({ timeout: 3000 })

    // 6. 点击「识别并导入」
    await page.getByRole('button', { name: '识别并导入' }).click()

    // 7. 等待结果（成功或业务错误均可，排除「网络连接失败」）。弹窗成功后会约 1.5s 自动关闭，需在关闭前捕获
    const resultArea = page.locator('.bg-green-50, .bg-amber-50')
    await expect(resultArea).toBeVisible({ timeout: 15000 })

    const resultText = await resultArea.textContent()
    expect(resultText).not.toContain('网络连接失败')
    expect(resultText).not.toContain('请检查网络后重试')
  })
})
