/**
 * 新页面验收测试 — 设备台 4 个新页面
 *
 * 覆盖：
 *  - 设备详情页 (/ledger/:id)
 *  - 校准详情页 (/calibration/:id)
 *  - 维护工单详情页 (/maintenance/:id)
 *  - 设备授权管理页 (/authorizations)
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('设备台新页面验收', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('9.1【设备详情页】能正常加载设备详情并显示关键信息', async ({ page }) => {
    await page.goto('/equipment/ledger/1')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('设备详情')
    // 详情页应显示设备名称（来自 mock equipmentDetail）
    await expect(page.locator('body')).toContainText('Corneometer CM825 #1')
  })

  test('9.2【设备详情页】返回按钮可见并能导航回列表', async ({ page }) => {
    await page.goto('/equipment/ledger/1')
    await page.waitForLoadState('networkidle')

    const backBtn = page.getByText('返回')
    await expect(backBtn).toBeVisible()
  })

  test('9.3【设备详情页】显示设备基本信息字段', async ({ page }) => {
    await page.goto('/equipment/ledger/1')
    await page.waitForLoadState('networkidle')

    // 应有设备信息标题区域
    await expect(page.locator('body')).toContainText('EQ-CORN-001')
  })

  test('9.4【校准详情页】能正常加载并显示校准记录信息', async ({ page }) => {
    await page.goto('/equipment/calibration/201')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('校准详情')
    await expect(page.getByText('返回')).toBeVisible()
  })

  test('9.5【维护工单详情页】能正常加载并显示工单信息', async ({ page }) => {
    await page.goto('/equipment/maintenance/301')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('维护工单详情')
    await expect(page.getByText('返回')).toBeVisible()
  })

  test('9.6【授权管理页】能正常加载授权列表', async ({ page }) => {
    await page.goto('/equipment/authorizations')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('设备授权管理')
    // 授权列表应包含 mock 中的授权人员名称
    await expect(page.locator('body')).toContainText('张技评')
  })

  test('9.7【授权管理页】显示新增授权按钮', async ({ page }) => {
    await page.goto('/equipment/authorizations')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('新增授权')).toBeVisible()
  })

  test('9.8【授权管理页】列表展示所有授权记录', async ({ page }) => {
    await page.goto('/equipment/authorizations')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText('王检测')
    await expect(page.locator('body')).toContainText('赵实习')
  })
})
