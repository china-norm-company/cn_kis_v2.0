/**
 * Phase 1 全局运营页验收 — 运行总览、动作中心、回放、策略中心
 * L2 有头 UI：断言各页主结构存在，不 mock API。
 */
import { test, expect } from '@playwright/test'

test.describe('运行总览', () => {
  test('运行总览页加载', async ({ page }) => {
    await page.goto('/#/ops-overview')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="ops-overview-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /运行总览/ })).toBeVisible()
  })
})

test.describe('动作中心', () => {
  test('动作中心页加载', async ({ page }) => {
    await page.goto('/#/actions')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="actions-center-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /动作中心/ })).toBeVisible()
  })
})

test.describe('执行回放', () => {
  test('执行回放页加载', async ({ page }) => {
    await page.goto('/#/replay')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="replay-center-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /执行回放/ })).toBeVisible()
  })
})

test.describe('策略中心', () => {
  test('策略中心页加载', async ({ page }) => {
    await page.goto('/#/policies')
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="policy-center-page"]')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /策略中心/ })).toBeVisible()
  })
})
