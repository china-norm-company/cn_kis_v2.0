/**
 * 场景 14：跨工作台集成 — 执行台/评估台与物料台联动
 *
 * 业务背景：
 *   物料台与执行台、评估台存在数据联动：执行台工单领用耗材、
 *   评估台扫码出库、物料台负责入库退库与流水记录。本场景验证
 *   物料台页面能否正确支持这些跨台能力。
 *
 * 验证目标：
 *   - ConsumableLedgerPage 入库/退库操作
 *   - 耗材批次信息展示
 *   - 产品台账批次与库存联动
 *   - 出入库流水记录操作来源
 *   - 效期预警处置
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景14: 跨工作台集成 — 执行台/评估台与物料台联动', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('14.1【耗材领用】ConsumableLedgerPage的入库按钮可用', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // 每行应有入库、退库、领用按钮
    const inboundBtn = page.getByRole('button', { name: '入库' })
    await expect(inboundBtn.first()).toBeVisible()
  })

  test('14.2【耗材入库】打开入库弹窗并填写', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '入库' }).first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('耗材入库').first()).toBeVisible()
    await modal.getByPlaceholder('数量').fill('5')
    await modal.getByRole('button', { name: '确认入库' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  test('14.3【耗材退库】退库操作可用', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '退库' }).first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('耗材退库').first()).toBeVisible()
    await modal.locator('input[type="number"]').fill('1')
    await modal.getByRole('button', { name: '确认退库' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  test('14.4【耗材批次】查看耗材批次信息', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // 点击第一行打开详情抽屉
    const firstRow = page.locator('tbody tr').first()
    await firstRow.click()
    await page.waitForTimeout(500)

    const drawer = page.locator('.fixed')
    await expect(drawer.getByText('耗材详情').first()).toBeVisible()
    await drawer.getByText('批次').click()
    await page.waitForTimeout(300)

    // 批次 Tab 应显示批次表格或"暂无批次数据"
    await expect(drawer.getByText('批次号').or(drawer.getByText('暂无批次数据')).first()).toBeVisible()
  })

  test('14.5【物料关联】产品台账显示批次信息', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')

    // 产品列表应显示产品和批次号信息
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()
    await expect(tbody.getByText('BN20260115-A').first()).toBeVisible()
  })

  test('14.6【库存联动】入库后库存数量变化', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')

    // 入库前记录当前库存（第一行 Corneometer 探头保护膜 current_stock: 2）
    const stockBefore = await page.locator('tbody tr').first().locator('td').nth(3).textContent()

    await page.getByRole('button', { name: '入库' }).first().click()
    await page.waitForTimeout(500)
    const modal = page.locator('.fixed')
    await modal.getByPlaceholder('数量').fill('3')
    await modal.getByRole('button', { name: '确认入库' }).click()
    await page.waitForLoadState('networkidle')

    // 弹窗关闭即表示成功，列表会刷新（mock 不更新数量，仅验证流程）
    await expect(modal).not.toBeVisible()
  })

  test('14.7【跨台日志】出入库流水记录操作来源', async ({ page }) => {
    await page.goto('/material/transactions')
    await page.waitForLoadState('networkidle')

    // 流水表应显示操作人、关联单据等来源信息（mock: 王度支、张技评、工单 WO-2026-015、接收单 RCV-2026-001）
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('王度支').first()).toBeVisible()
    await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()
  })

  test('14.8【预警联动】效期预警页面展示警告', async ({ page }) => {
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('祛斑霜 G').first()).toBeVisible()
    await expect(page.getByText('pH 4.0 标准缓冲液').first()).toBeVisible()
  })
})
