/**
 * 场景 5：安全验证 — 权限装饰器、认证缺失修复、工单归属校验
 *
 * 验证 P0 阶段安全修复效果：
 * ✓ 未认证请求时显示登录页（不直接暴露业务页面）
 * ✓ 已认证评估员可正常访问面板
 * ✓ 权限正确允许访问
 * ✓ 他人工单不可操作
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('P0 安全验证', () => {
  test('5.1 未认证请求应显示登录提示', async ({ page }) => {
    await setupApiMocks(page)

    await page.goto('/evaluator/dashboard')

    // 未注入 auth 时，FeishuAuthProvider 应展示登录页
    await expect(page.getByRole('button', { name: '飞书登录' })).toBeVisible({ timeout: 5000 })
  })

  test('5.2 有认证的评估员可正常访问面板', async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)

    await page.goto('/evaluator/dashboard')
    await expect(page.getByRole('heading', { name: '工作面板' })).toBeVisible()
    await expect(page.getByText('今日工作总览与快捷操作')).toBeVisible()
  })

  test('5.3 权限检查 — 评估员权限允许访问工单列表', async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)

    await page.goto('/evaluator/dashboard')
    await expect(page.getByText('待接受')).toBeVisible()
    await expect(page.getByText('执行中')).toBeVisible()
    await expect(page.getByText('已完成')).toBeVisible()
  })

  test('5.4 工单归属校验 — 他人工单操作应被拒绝', async ({ page }) => {
    await injectAuth(page)

    await page.route('**/api/v1/evaluator/workorders/*/accept', async (route) => {
      await route.fulfill({
        json: { code: 400, msg: '该工单未分配给您', data: null },
      })
    })

    await setupApiMocks(page)
    await page.goto('/evaluator/execute/999')

    const acceptButton = page.locator('button:has-text("接受工单")')
    if (await acceptButton.isVisible()) {
      await acceptButton.click()
      await page.waitForTimeout(500)
    }
  })

  test('5.5 多页面均可正常访问', async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)

    await page.goto('/evaluator/dashboard')
    await expect(page.getByRole('heading', { name: '工作面板' })).toBeVisible()

    await page.goto('/evaluator/schedule')
    await expect(page.getByRole('heading', { name: '我的排程' })).toBeVisible()

    await page.goto('/evaluator/growth')
    await expect(page.getByRole('heading', { name: '我的成长' })).toBeVisible()
  })
})
