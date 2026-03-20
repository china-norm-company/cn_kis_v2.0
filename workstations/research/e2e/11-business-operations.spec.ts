/**
 * S11: 跟进商务（操作化验证） — 快速创建商机/报价 + 合同抽屉 + 催回款
 *
 * 验证商务管线从只读升级为可操作的效果
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S11 商务操作化', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('S11.1 商务管线页面可访问', async ({ page }) => {
    await navigateTo(page, '/research/#/business')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/商务|管线|漏斗/).first()).toBeVisible({ timeout: 5000 })
  })

  test('S11.2 漏斗区域有快速创建按钮', async ({ page }) => {
    await navigateTo(page, '/research/#/business')
    await page.waitForTimeout(3000)
    const newOppBtn = page.getByRole('button', { name: /新建商机/ })
    const count = await newOppBtn.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('S11.3 新建报价按钮可见', async ({ page }) => {
    await navigateTo(page, '/research/#/business')
    await page.waitForTimeout(3000)
    const newQuoteBtn = page.getByRole('button', { name: /新建报价/ })
    const count = await newQuoteBtn.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('S11.4 点击新建商机打开弹窗', async ({ page }) => {
    await navigateTo(page, '/research/#/business')
    await page.waitForTimeout(3000)
    const btn = page.getByRole('button', { name: /新建商机/ }).first()
    await btn.click()
    await page.waitForTimeout(1000)
    const modal = page.locator('[role="dialog"], .fixed.inset-0').filter({ hasText: /商机|客户|金额/ })
    await expect(modal.first()).toBeVisible({ timeout: 3000 })
  })

  test('S11.5 点击新建报价打开弹窗', async ({ page }) => {
    await navigateTo(page, '/research/#/business')
    await page.waitForTimeout(3000)
    const btn = page.getByRole('button', { name: /新建报价/ }).first()
    await btn.click()
    await page.waitForTimeout(1000)
    const modal = page.locator('[role="dialog"], .fixed.inset-0').filter({ hasText: /报价|客户|金额/ })
    await expect(modal.first()).toBeVisible({ timeout: 3000 })
  })

  test('S11.6 项目商务卡片有操作按钮', async ({ page }) => {
    await navigateTo(page, '/research/#/business')
    await page.waitForTimeout(3000)
    const actionBtns = page.getByRole('button', { name: /查看合同|创建发票|催回款/ })
    const count = await actionBtns.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('S11.7 漏斗统计卡片完整展示', async ({ page }) => {
    await navigateTo(page, '/research/#/business')
    await page.waitForTimeout(3000)
    await expect(page.getByText(/商机/).first()).toBeVisible()
    await expect(page.getByText(/报价/).first()).toBeVisible()
    await expect(page.getByText(/合同/).first()).toBeVisible()
  })

  test('S11.8 项目商务卡片展示完整数据', async ({ page }) => {
    await navigateTo(page, '/research/#/business')
    await page.waitForTimeout(3000)
    await expect(page.getByText('保湿功效评价').first()).toBeVisible()
    const content = await page.content()
    const hasMetrics = content.includes('合同额') || content.includes('已开票') || content.includes('回款')
    expect(hasMetrics).toBeTruthy()
  })
})
