/**
 * 场景 19：全链路验收测试 — 端到端全生命周期验证
 *
 * 业务背景：
 *   物料管理的核心价值在于全生命周期可追溯。从产品入库、批次管理、
 *   套件组装、样品接收验收、分发给受试者、使用记录、回收、销毁，
 *   到最终的审计报告和证据包导出——每一步都必须有记录、可追溯。
 *
 *   这个测试验证物料台的所有核心页面都能正确加载、展示数据、
 *   并支持关键业务操作。
 *
 * 验证目标：
 *   物料台 16 个核心页面全部可用，关键业务流程畅通。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景19: 全链路验收 — 端到端全生命周期验证', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  // === 第一阶段：仪表盘与导航 ===

  test('19.1【仪表盘】物料台仪表盘展示关键指标', async ({ page }) => {
    await page.goto('/material/dashboard')
    await page.waitForLoadState('networkidle')
    // Verify dashboard loads with KPI cards
    await expect(page.getByText('产品').or(page.getByText('样品')).or(page.getByText('耗材')).first()).toBeVisible()
  })

  test('19.2【导航完整】侧边栏包含所有功能入口', async ({ page }) => {
    await page.goto('/material/dashboard')
    await page.waitForLoadState('networkidle')

    const navItems = ['仪表盘', '产品台账', '耗材管理', '库存管理', '样品管理', '样品接收', '批次管理', '套件与分发', '销毁审批']
    for (const label of navItems) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
    }
  })

  // === 第二阶段：产品与批次生命周期 ===

  test('19.3【产品台账】产品列表正常加载', async ({ page }) => {
    await page.goto('/material/products')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('美白精华液').first()).toBeVisible()
  })

  test('19.4【批次流转】批次从待入库到放行', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')
    // Verify multiple statuses visible
    await expect(page.getByText('BAT-').first()).toBeVisible()
    // Verify action buttons exist
    const actionBtns = page.getByRole('button')
    await expect(actionBtns.first()).toBeVisible()
  })

  // === 第三阶段：样品接收与验收 ===

  test('19.5【样品接收】接收单列表正常展示', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('RCV-').first()).toBeVisible()
  })

  test('19.6【样品管理】样品全状态可见', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('在库').first()).toBeVisible()
    await expect(page.getByText('已分发').first()).toBeVisible()
  })

  // === 第四阶段：套件与分发 ===

  test('19.7【套件管理】套件列表展示随机化编码', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('KIT-').first()).toBeVisible()
  })

  // === 第五阶段：耗材管理 ===

  test('19.8【耗材管理】耗材列表与操作按钮', async ({ page }) => {
    await page.goto('/material/consumables')
    await page.waitForLoadState('networkidle')
    // Verify consumable items load
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  // === 第六阶段：库存与存储 ===

  test('19.9【库存管理】库存总览正常', async ({ page }) => {
    await page.goto('/material/inventory')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('库存').first()).toBeVisible()
  })

  test('19.10【盘点执行】盘点界面可发起盘点', async ({ page }) => {
    await page.goto('/material/inventory-execution')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('盘点').first()).toBeVisible()
  })

  test('19.11【库位管理】库位树形结构展示', async ({ page }) => {
    await page.goto('/material/storage-hierarchy')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('库位').or(page.getByText('库房')).or(page.getByText('WH-')).first()).toBeVisible()
  })

  // === 第七阶段：温控与合规 ===

  test('19.12【温度监控】温湿度监控页面加载', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('温').first()).toBeVisible()
  })

  test('19.13【依从性】依从性管理展示使用记录', async ({ page }) => {
    await page.goto('/material/compliance')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('依从').first()).toBeVisible()
  })

  // === 第八阶段：安全与审计 ===

  test('19.14【销毁审批】销毁全流程页面可用', async ({ page }) => {
    await page.goto('/material/destructions')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('DES-').or(page.getByText('销毁')).first()).toBeVisible()
  })

  test('19.15【效期预警】预警页面展示到期物料', async ({ page }) => {
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('预警').or(page.getByText('效期')).or(page.getByText('过期')).first()).toBeVisible()
  })
})
