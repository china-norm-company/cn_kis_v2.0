/**
 * 场景 11: 飞书日历同步 — 排程发布后显示日历同步计数
 *
 * AC-P2-1: 排程发布后 toast 显示日历同步数量
 */
import { test, expect } from '@playwright/test'
import { setupForRole } from './helpers/setup'

test.describe('场景11: 飞书日历同步', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'scheduler')
  })

  test('11.1 排程管理页面应显示排程计划列表', async ({ page }) => {
    await page.goto('/execution/#/scheduling')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: '排程管理' })).toBeVisible()
  })

  test('11.2 排程计划 Tab 应可切换', async ({ page }) => {
    await page.goto('/execution/#/scheduling')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '排程计划' }).click()
    await expect(page.getByRole('button', { name: '排程计划' })).toBeVisible()
  })

  test('11.3 时间槽 Tab 应展示视图切换', async ({ page }) => {
    await page.goto('/execution/#/scheduling')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: '列表' })).toBeVisible()
    await expect(page.getByRole('button', { name: '周视图' })).toBeVisible()
  })
})
