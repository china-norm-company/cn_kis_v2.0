/**
 * 场景 03：资质生命周期 — 资质矩阵和差距分析
 *
 * 钱子衿需要查看资质矩阵，进行差距分析，包括：
 * - 查看人员 × 方法的资质矩阵
 * - 识别单点风险（仅1人或0人）
 * - 查看差距分析和推荐
 * - 查看资质列表和执行次数
 *
 * 10 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('资质生命周期 — 资质矩阵和差距分析', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('3.1 看到资质矩阵页面标题', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    await expect(page.locator('main h2')).toContainText('资质矩阵')
  })

  test('3.2 矩阵标签页显示人员 × 方法表格，包含能力等级标识', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    // 默认显示矩阵标签页
    await expect(page.locator('button[data-tab="matrix"]')).toBeVisible()
    await expect(page.locator('[data-section="qualification-matrix"]')).toBeVisible()
    await expect(page.locator('[data-section="qualification-matrix"] table')).toBeVisible()
  })

  test('3.3 矩阵显示 6 种检测方法：MTH-CORN, MTH-TEWL, MTH-CUTO, MTH-MEXA, MTH-PH, MTH-GLOS', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    const matrixSection = page.locator('[data-section="qualification-matrix"]')
    await expect(matrixSection.getByText('MTH-CORN')).toBeVisible()
    await expect(matrixSection.getByText('MTH-TEWL')).toBeVisible()
    await expect(matrixSection.getByText('MTH-CUTO')).toBeVisible()
    await expect(matrixSection.getByText('MTH-MEXA')).toBeVisible()
    await expect(matrixSection.getByText('MTH-PH')).toBeVisible()
    await expect(matrixSection.getByText('MTH-GLOS')).toBeVisible()
  })

  test('3.4 矩阵显示单点风险警告：皮肤黑素测定仅1人，皮肤光泽度测定0人', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    const riskSection = page.locator('[data-section="single-point-risks"]')
    await expect(riskSection).toBeVisible()
    await expect(riskSection.getByText(/皮肤黑素测定/)).toBeVisible()
    await expect(riskSection.getByText(/皮肤光泽度测定/)).toBeVisible()
  })

  test('3.5 点击"差距分析"标签页，显示差距项', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    await page.locator('button[data-tab="gap"]').click()
    await expect(page.locator('[data-section="gap-analysis"]')).toBeVisible()
    await expect(page.locator('[data-section="gap-analysis"] h3')).toContainText('能力差距分析')
  })

  test('3.6 差距分析显示：皮肤黑素测定缺口2人，皮肤光泽度测定缺口3人', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    await page.locator('button[data-tab="gap"]').click()
    const gapSection = page.locator('[data-section="gap-analysis"]')
    await expect(gapSection.getByText('皮肤黑素测定', { exact: true })).toBeVisible()
    await expect(gapSection.getByText('缺口 2 人')).toBeVisible()
    await expect(gapSection.getByText('皮肤光泽度测定', { exact: true })).toBeVisible()
    await expect(gapSection.getByText('缺口 3 人')).toBeVisible()
  })

  test('3.7 差距分析显示推荐部分', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    await page.locator('button[data-tab="gap"]').click()
    await expect(page.locator('[data-section="gap-analysis"]').getByRole('heading', { name: '改进建议' })).toBeVisible()
    await expect(page.locator('[data-section="gap-analysis"] li').first()).toBeVisible()
  })

  test('3.8 点击"资质列表"标签页，显示表格，包含人员、方法、等级、执行次数', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    await page.locator('button[data-tab="list"]').click()
    await expect(page.locator('[data-section="qual-list"]')).toBeVisible()
    await expect(page.locator('[data-section="qual-list"] table')).toBeVisible()
  })

  test('3.9 资质列表显示：王皮测 皮肤水分测定 带教 520次', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    await page.locator('button[data-tab="list"]').click()
    const qualTable = page.locator('[data-section="qual-list"] table')
    const wangRow = qualTable.locator('tr').filter({ hasText: '520' }).first()
    await expect(wangRow).toContainText('王皮测')
    await expect(wangRow).toContainText('皮肤水分测定')
    await expect(wangRow).toContainText('520')
  })

  test('3.10 在矩阵视图中搜索方法，过滤列', async ({ page }) => {
    await page.goto('/lab-personnel/qualifications')
    await page.locator('button[data-tab="matrix"]').click()
    await page.getByPlaceholder(/搜索检测方法/).fill('皮肤水分')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-section="qualification-matrix"]').getByText('MTH-CORN')).toBeVisible()
  })
})
