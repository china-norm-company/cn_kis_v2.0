/**
 * 场景 11：套件管理、分发流程、销毁审批
 *
 * 业务背景：
 *   套件管理支持随机化方案下的产品套件创建、分配与分发。
 *   分发记录跟踪备货→分发→确认三步流程。
 *   销毁审批支持样品销毁申请、审批与执行，需填写见证人、证明等。
 *
 * 验证目标：
 *   工作台是否能支持套件全生命周期、分发三步流程、
 *   以及销毁申请→审批→执行的完整闭环。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景11: 套件管理、分发流程、销毁审批', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  // ===== 套件管理 (4 tests) =====

  test('11.1【套件列表】展示套件信息', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')

    const tbody = page.locator('tbody')
    await expect(tbody.getByText('KIT-001').first()).toBeVisible()
    await expect(tbody.getByText('RAND-001').first()).toBeVisible()
    await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()
    await expect(tbody.getByText('可用').first()).toBeVisible()
  })

  test('11.2【新建套件】创建新套件', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '新建套件' }).click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('新建套件').first()).toBeVisible()
    await modal.locator('select').filter({ hasText: '请选择产品' }).selectOption('1')
    await modal.getByPlaceholder('随机化编码').fill('RAND-NEW-001')
    await modal.getByPlaceholder('盲态编码').fill('BLD-NEW')
    await modal.getByRole('button', { name: '提交' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  test('11.3【分配套件】将套件分配给受试者', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '分配' }).first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('分配套件').first()).toBeVisible()
    await modal.getByPlaceholder('受试者ID').fill('101')
    await modal.getByPlaceholder('如 S001').fill('S001')
    await modal.getByRole('button', { name: '确认分配' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  test('11.4【套件状态】各状态显示正确', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')

    const tbody = page.locator('tbody')
    // available=green, assigned=blue, distributed=purple
    await expect(tbody.locator('span.bg-green-50').filter({ hasText: '可用' })).toBeVisible()
    await expect(tbody.locator('span.bg-blue-50').filter({ hasText: '已分配' })).toBeVisible()
    await expect(tbody.locator('span.bg-purple-50').filter({ hasText: '已分发' })).toBeVisible()
  })

  // ===== 分发记录 (3 tests) =====

  test('11.5【分发记录】切换到分发记录Tab', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '分发记录' }).click()
    await page.waitForLoadState('networkidle')

    const tbody = page.locator('tbody')
    await expect(tbody.getByText('DSP-20260116-0001').first()).toBeVisible()
    await expect(tbody.getByText('S001').first()).toBeVisible()
    await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()
  })

  test('11.6【备货操作】对待备货分发执行备货', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '分发记录' }).click()
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '备货' }).first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('备货').first()).toBeVisible()
    await expect(modal.getByText('确认对此分发单执行备货？').first()).toBeVisible()
    await modal.getByRole('button', { name: '确认' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  test('11.7【分发确认】分发三步流程', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '分发记录' }).click()
    await page.waitForLoadState('networkidle')

    const tbody = page.locator('tbody')
    // 计划中→备货，已备货→分发，已分发→确认
    await expect(tbody.getByText('计划中').first()).toBeVisible()
    await expect(tbody.getByText('已备货').first()).toBeVisible()
    await expect(tbody.getByText('已确认').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '备货' })).toBeVisible()
    await expect(page.getByRole('button', { name: '分发', exact: true })).toBeVisible()
  })

  // ===== 销毁审批 (3 tests) =====

  test('11.8【销毁申请】创建销毁申请', async ({ page }) => {
    await page.goto('/material/destructions')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '申请销毁' }).click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('申请销毁').first()).toBeVisible()
    await modal.getByPlaceholder('输入样品ID，多个用逗号或空格分隔，如：1, 2, 3').fill('201, 202')
    await modal.getByPlaceholder('请输入销毁原因').fill('过期废弃')
    await modal.getByRole('button', { name: '提交申请' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  test('11.9【销毁审批】审批待审批销毁单', async ({ page }) => {
    await page.goto('/material/destructions')
    await page.waitForLoadState('networkidle')

    const approveBtn = page.locator('button[title="审批"]')
    await approveBtn.first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('审批销毁').first()).toBeVisible()
    await modal.getByPlaceholder('审批备注（可选）').fill('同意销毁')
    await modal.getByRole('button', { name: '批准' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  test('11.10【销毁执行】执行已批准销毁单', async ({ page }) => {
    await page.goto('/material/destructions')
    await page.waitForLoadState('networkidle')

    const executeBtn = page.locator('button[title="执行销毁"]')
    await executeBtn.first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('执行销毁').first()).toBeVisible()
    await modal.getByPlaceholder('销毁见证人姓名').fill('李质检')
    await modal.getByPlaceholder('销毁证明编号或说明').fill('CERT-2026-001')
    await modal.getByRole('button', { name: '确认执行' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  // ===== 唯一约束场景 (1 test) =====

  test('11.11【重复分发拦截】同访视点重复创建分发单时显示错误', async ({ page }) => {
    await page.goto('/material/kits')
    await page.waitForLoadState('networkidle')

    // 切到分发记录 Tab
    await page.getByRole('button', { name: '分发记录' }).click()
    await page.waitForLoadState('networkidle')

    // Mock: 第二次提交时 API 返回 400 唯一约束错误
    await page.route('**/product-management/dispensings/create', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 400,
          msg: '该访视点已有活跃的分发记录（PD-20260316-0001），请勿重复创建。如需重新发放，请先取消原记录。',
        }),
      })
    })

    await page.getByRole('button', { name: '新建分发' }).click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('新建分发').first()).toBeVisible()

    // 填写表单
    await modal.getByPlaceholder('受试者ID').fill('101')
    await modal.getByPlaceholder('如 S001').fill('S001')
    await modal.getByPlaceholder('如 V1').fill('V01')
    await modal.locator('select').filter({ hasText: '请选择产品' }).selectOption('1')
    await modal.getByPlaceholder('数量').fill('2')

    await modal.getByRole('button', { name: '提交' }).click()
    await page.waitForTimeout(1000)

    // 错误提示应该出现
    await expect(modal.getByText(/已有活跃的分发记录/).first()).toBeVisible()
  })
})
