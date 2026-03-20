/**
 * 场景 10：批次管理 — 产品批次登记、入库、放行与追踪
 *
 * 业务背景：
 *   产品批次是物料管理的核心单元，从供应商到货登记、入库验收、
 *   隔离放行到效期追踪，每个环节都需严格记录。批次管理页面支持
 *   管理员完成全流程操作。
 *
 * 验证目标：
 *   工作台是否能支持批次从"待入库 → 入库 → 隔离 → 放行"的
 *   完整生命周期管理，并提供统计、筛选、搜索与详情查看能力。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景10: 批次管理 — 产品批次登记、入库、放行与追踪', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('10.1【批次概况】展示批次统计', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    // batchList: total 4, released 1, pending 1, expired 1
    await expect(page.getByText('总批次数').first()).toBeVisible()
    await expect(page.getByText('已放行').first()).toBeVisible()
    await expect(page.getByText('待入库').first()).toBeVisible()
  })

  test('10.2【批次列表】展示完整批次信息', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    const tbody = page.locator('tbody')
    await expect(tbody.getByText('BAT-20260115-0001').first()).toBeVisible()
    await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()
    await expect(tbody.getByText('已放行').first()).toBeVisible()
    await expect(tbody.getByText('100').first()).toBeVisible()
    await expect(tbody.getByText('2026-01-10').first()).toBeVisible()
    await expect(tbody.getByText('2027-01-10').first()).toBeVisible()
  })

  test('10.3【状态筛选】按状态筛选批次', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    const statusFilter = page.locator('select[aria-label="状态筛选"]')
    await statusFilter.selectOption('pending')
    await page.waitForLoadState('networkidle')

    // 筛选后应只看到待入库批次
    await expect(page.getByText('BAT-20260116-0001').first()).toBeVisible()
    await expect(page.getByText('待入库').first()).toBeVisible()
  })

  test('10.4【搜索批次】按关键词搜索', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder('搜索批号、产品...')
    await searchInput.fill('BAT-20260115')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('BAT-20260115-0001').first()).toBeVisible()
  })

  test('10.5【新建批次】打开创建弹窗', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '新建批次' }).click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('新建批次').first()).toBeVisible()
    await expect(modal.getByText('产品').first()).toBeVisible()
    await expect(modal.getByText('批号').first()).toBeVisible()
    await expect(modal.getByText('数量').first()).toBeVisible()
  })

  test('10.6【新建批次】提交创建表单', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '新建批次' }).click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await modal.locator('select').first().selectOption({ index: 1 })
    await modal.getByPlaceholder('如 BATCH-2024-001').fill('BAT-E2E-001')
    await modal.getByRole('spinbutton', { name: '数量 *' }).fill('50')
    await modal.getByRole('button', { name: '提交' }).click()
    await page.waitForLoadState('networkidle')

    // 创建成功后弹窗关闭
    await expect(modal.filter({ hasText: '批号 *' })).not.toBeVisible({ timeout: 3000 })
  })

  test('10.7【入库操作】待入库批次可执行入库', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    // 待入库批次 BAT-20260116-0001 有入库按钮
    const receiveBtn = page.locator('button[title="入库"]').first()
    await receiveBtn.click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('批次入库').first()).toBeVisible()
    await modal.getByRole('button', { name: '确认入库' }).click()
    await page.waitForLoadState('networkidle')

    // 入库成功后弹窗关闭
    await expect(modal.getByText('批次入库')).not.toBeVisible({ timeout: 3000 })
  })

  test('10.8【放行操作】隔离批次可执行放行', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    // 隔离批次 BAT-20260117-0001 有放行按钮
    const releaseBtn = page.locator('button[title="放行"]').first()
    await releaseBtn.click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('批次放行').first()).toBeVisible()
    await modal.getByPlaceholder('放行说明（可选）').fill('E2E 放行备注')
    await modal.getByRole('button', { name: '确认放行' }).click()
    await page.waitForLoadState('networkidle')

    await expect(modal.getByText('批次放行')).not.toBeVisible({ timeout: 3000 })
  })

  test('10.9【查看详情】查看批次详情', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    const viewBtn = page.locator('button[title="查看"]').first()
    await viewBtn.click()
    await page.waitForTimeout(500)

    const drawer = page.locator('.fixed')
    await expect(drawer.getByText('批次详情').first()).toBeVisible()
    await expect(drawer.getByText('BAT-20260115-0001').first()).toBeVisible()
  })

  test('10.10【状态标签】各状态显示正确颜色标签', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    // pending = yellow
    const pendingBadge = page.locator('tbody tr').filter({ hasText: '待入库' }).first().locator('span').filter({ hasText: '待入库' })
    await expect(pendingBadge).toHaveClass(/yellow/)

    // released = green
    const releasedBadge = page.locator('tbody tr').filter({ hasText: '已放行' }).first().locator('span').filter({ hasText: '已放行' })
    await expect(releasedBadge).toHaveClass(/green/)

    // expired = red
    const expiredBadge = page.locator('tbody tr').filter({ hasText: '已过期' }).first().locator('span').filter({ hasText: '已过期' })
    await expect(expiredBadge).toHaveClass(/red/)
  })
})
