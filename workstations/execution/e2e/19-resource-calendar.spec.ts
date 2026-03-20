/**
 * 场景 19: 资源日历 — 排程页面集成资源日历视图
 *
 * AC-P4-1: 排程页面可切换到资源日历视图
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景19: 资源日历', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'scheduler')
    await page.goto('/execution/#/scheduling')
    await page.waitForLoadState('networkidle')
  })

  test('19.1 排程页面应显示资源日历视图选项', async ({ page }) => {
    await expect(page.getByRole('button', { name: '资源日历' })).toBeVisible()
  })

  test('19.2 点击资源日历应切换到资源日历视图', async ({ page }) => {
    await page.getByRole('button', { name: '资源日历' }).click()
    await expect(page.getByText('人员')).toBeVisible()
  })

  test('19.3 列表视图应仍然可用', async ({ page }) => {
    await page.getByRole('button', { name: '资源日历' }).click()
    await page.getByRole('button', { name: '列表' }).click()
    await expect(page.getByRole('button', { name: '列表' })).toBeVisible()
  })
})
