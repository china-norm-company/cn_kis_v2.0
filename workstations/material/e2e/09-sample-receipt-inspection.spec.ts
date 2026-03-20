/**
 * 场景 9：样品接收验收 — 6项检查+温度记录
 *
 * 业务背景：
 *   样品接收是 CRO 物料管理的入口环节。供应商或申办方寄送的样品
 *   到达后，物料管理员需要按 SOP 进行验收：包装、标签、数量、
 *   文件、温度、外观共 6 项检查，并记录到货温度。合格则入库，
 *   不合格则拒收并填写原因。
 *
 * 验证目标：
 *   工作台是否能支持样品接收单的创建、验收（6项检查+温度）、
 *   拒收原因填写、详情查看及搜索筛选。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景9: 样品接收验收 — 6项检查+温度记录', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('9.1【接收概况】展示各状态统计', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    // receiptList: 1 pending, 2 accepted, 1 rejected
    await expect(page.getByText('待验收').first()).toBeVisible()
    await expect(page.getByText('已接收').first()).toBeVisible()
    await expect(page.getByText('已拒收').first()).toBeVisible()
  })

  test('9.2【接收列表】展示所有接收单信息', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    const tbody = page.locator('tbody')
    await expect(tbody.getByText('RCV-20260115-0001').first()).toBeVisible()
    await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()
    await expect(tbody.getByText('华研美妆科技').first()).toBeVisible()
    await expect(tbody.getByText('20').first()).toBeVisible()
  })

  test('9.3【状态筛选】按状态筛选接收单', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    const statusFilter = page.locator('select[aria-label="状态筛选"]')
      .or(page.locator('select').filter({ hasText: '全部状态' }))
    await statusFilter.first().selectOption('pending')
    await page.waitForLoadState('networkidle')

    // 筛选后应只看到待验收的保湿面膜 B
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('RCV-20260116-0001').first()).toBeVisible()
    await expect(tbody.getByText('保湿面膜 B').first()).toBeVisible()
  })

  test('9.4【新建接收单】打开创建弹窗', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '新建接收单' }).click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('新建接收单').first()).toBeVisible()
    await expect(modal.getByText('产品选择').first()).toBeVisible()
    await expect(modal.getByText('供应商').first()).toBeVisible()
    await expect(modal.getByText('物流公司').first()).toBeVisible()
  })

  test('9.5【新建接收单】提交创建表单', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '新建接收单' }).click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await modal.locator('select').filter({ hasText: '请选择产品' }).selectOption('1')
    await modal.getByPlaceholder('供应商名称').fill('华研美妆科技')
    await modal.getByPlaceholder('预期到货数量').fill('10')
    await modal.getByRole('button', { name: '提交' }).click()
    await page.waitForLoadState('networkidle')

    // 创建成功应关闭弹窗，列表刷新
    await expect(modal).not.toBeVisible()
  })

  test('9.6【验收检查】打开验收弹窗', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    // 点击待验收项的验收按钮（ClipboardCheck 图标，title="验收"）
    const inspectBtn = page.locator('button[title="验收"]')
    await expect(inspectBtn.first()).toBeVisible()
    await inspectBtn.first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('验收检查').first()).toBeVisible()
    // 6 项检查
    await expect(modal.getByText('包装完好').first()).toBeVisible()
    await expect(modal.getByText('标签正确').first()).toBeVisible()
    await expect(modal.getByText('数量正确').first()).toBeVisible()
    await expect(modal.getByText('文件齐全').first()).toBeVisible()
    await expect(modal.getByText('温度符合').first()).toBeVisible()
    await expect(modal.getByText('外观正常').first()).toBeVisible()
  })

  test('9.7【验收检查】完成6项验收', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    const inspectBtn = page.locator('button[title="验收"]')
    await inspectBtn.first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    // 勾选全部 6 项
    for (const label of ['包装完好', '标签正确', '数量正确', '文件齐全', '温度符合', '外观正常']) {
      await modal.getByText(label).first().click()
    }
    await modal.getByPlaceholder('如 2.5').fill('4.5')
    await modal.getByPlaceholder('验收合格数量').fill('15')
    await modal.getByPlaceholder('拒收数量').fill('0')
    await modal.getByRole('button', { name: '提交验收' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal).not.toBeVisible()
  })

  test('9.8【验收拒收】拒收时需填写原因', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    const inspectBtn = page.locator('button[title="验收"]')
    await inspectBtn.first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    // 不勾选全部，或填写不合格数量，应出现拒收原因框
    await modal.getByPlaceholder('拒收数量').fill('5')
    await page.waitForTimeout(200)

    await expect(modal.getByText('拒收原因').first()).toBeVisible()
    await expect(modal.getByPlaceholder('请说明拒收或部分拒收原因').first()).toBeVisible()
  })

  test('9.9【查看详情】查看接收单详情', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    const viewBtn = page.locator('button[title="查看"]')
    await viewBtn.first().click()
    await page.waitForLoadState('networkidle')

    const drawer = page.locator('.fixed')
    await expect(drawer.getByText('接收单详情').first()).toBeVisible()
    await expect(drawer.getByText('RCV-20260115-0001').first()).toBeVisible()
    await expect(drawer.getByText('美白精华液 A').first()).toBeVisible()
    await expect(drawer.getByText('华研美妆科技').first()).toBeVisible()
  })

  test('9.10【搜索功能】搜索接收单', async ({ page }) => {
    await page.goto('/material/receipts')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder('搜索接收单号、产品、供应商、物流单号...')
    await searchInput.fill('保湿面膜')
    await page.waitForLoadState('networkidle')

    const tbody = page.locator('tbody')
    await expect(tbody.getByText('保湿面膜 B').first()).toBeVisible()
    await expect(tbody.getByText('RCV-20260116-0001').first()).toBeVisible()
  })
})
