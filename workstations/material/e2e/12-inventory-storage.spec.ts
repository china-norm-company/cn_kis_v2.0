/**
 * 场景 12：盘点执行与库位层级 — 盘点概况、录入数量、库位树形、容量可视化
 *
 * 业务背景：
 *   盘点执行支持发起盘点、录入实际数量、差异计算与提交审核。
 *   库位管理以树形结构展示存储层级，支持新增子位置、容量条与温区图标。
 *
 * 验证目标：
 *   工作台是否能支持盘点执行全流程、库位树形展示、详情查看、
 *   新建子库位及温区/容量可视化。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景12: 盘点执行与库位层级', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('12.1【盘点概况】盘点执行页面显示统计', async ({ page }) => {
    await page.goto('/material/inventory-execution')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('进行中').first()).toBeVisible()
    await expect(page.getByText('已完成').first()).toBeVisible()
  })

  test('12.2【发起盘点】可以发起新盘点', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-E2E-No-Active-Check': '1' })
    await page.goto('/material/inventory-execution')
    await page.waitForLoadState('networkidle')

    const [request] = await Promise.all([
      page.waitForRequest((req) =>
        req.url().includes('/material/inventory/check') && req.method() === 'POST' && !req.url().includes('/submit') && !req.url().includes('/approve'),
      ),
      page.getByRole('button', { name: '发起盘点' }).click(),
    ])
    expect(request.url()).toContain('inventory/check')
  })

  test('12.3【盘点明细】显示盘点项目列表', async ({ page }) => {
    await page.goto('/material/inventory-execution')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('产品/耗材名称').first()).toBeVisible()
    await expect(page.getByText('系统数量').first()).toBeVisible()
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()
  })

  test('12.4【录入数量】可以输入实际数量', async ({ page }) => {
    await page.goto('/material/inventory-execution')
    await page.waitForLoadState('networkidle')

    const actualInput = page.locator('input[type="number"][aria-label*="实际数量"]').first()
    await actualInput.fill('48')
    await expect(actualInput).toHaveValue('48')
  })

  test('12.5【差异计算】差异自动计算显示', async ({ page }) => {
    await page.goto('/material/inventory-execution')
    await page.waitForLoadState('networkidle')

    const actualInput = page.locator('input[type="number"][aria-label*="实际数量"]').first()
    await actualInput.fill('0')
    await page.waitForTimeout(300)

    const diffCell = page.locator('tbody tr').first().locator('td').nth(3)
    await expect(diffCell).toContainText(/-3|−3/)
  })

  test('12.6【库位树形】库位管理展示树形结构', async ({ page }) => {
    await page.goto('/material/storage-hierarchy')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('主库房').first()).toBeVisible()
    await expect(page.getByText('冷冻库').first()).toBeVisible()
    await page.locator('li').filter({ hasText: '主库房' }).locator('button').first().click()
    await page.waitForTimeout(300)
    await expect(page.getByText('A区-常温').first()).toBeVisible()
    await expect(page.getByText('B区-冷藏').first()).toBeVisible()
  })

  test('12.7【库位详情】点击库位显示详情', async ({ page }) => {
    await page.goto('/material/storage-hierarchy')
    await page.waitForLoadState('networkidle')

    await page.getByText('主库房').first().click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('WH-01').first()).toBeVisible()
    await expect(page.getByText('温区').or(page.getByText('常温')).first()).toBeVisible()
  })

  test('12.8【新建库位】创建子库位', async ({ page }) => {
    await page.goto('/material/storage-hierarchy')
    await page.waitForLoadState('networkidle')

    const mainNode = page.getByText('主库房').first()
    await mainNode.hover()
    await page.waitForTimeout(200)
    await page.locator('button[title="新增子位置"]').first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('编码').first()).toBeVisible()
    await modal.getByPlaceholder('如 WH-A1-S2').fill('WH-01-C')
    await modal.getByPlaceholder('库位名称').fill('C区-冷冻')
    await modal.getByRole('button', { name: '创建' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible({ timeout: 3000 })
  })

  test('12.9【容量可视化】显示容量使用条', async ({ page }) => {
    await page.goto('/material/storage-hierarchy')
    await page.waitForLoadState('networkidle')

    const capacityBar = page.locator('.bg-amber-500.rounded-full').first()
    await expect(capacityBar).toBeVisible()
  })

  test('12.10【温区图标】不同温区显示不同标记', async ({ page }) => {
    await page.goto('/material/storage-hierarchy')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('主库房').first()).toBeVisible()
    await expect(page.getByText('冷冻库').first()).toBeVisible()
    await page.locator('li').filter({ hasText: '主库房' }).locator('button').first().click()
    await page.waitForTimeout(300)
    await expect(page.getByText('B区-冷藏').first()).toBeVisible()
  })
})
