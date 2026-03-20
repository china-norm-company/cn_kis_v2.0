/**
 * 场景 02：人员档案管理 — 查看和管理人员信息
 *
 * 钱子衿需要查看人员档案，管理人员信息，包括：
 * - 查看人员列表和统计信息
 * - 筛选和搜索人员
 * - 查看人员详细信息
 * - 新增人员档案
 *
 * 8 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('人员档案管理 — 查看和管理人员信息', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('2.1 看到人员档案页面标题和统计卡片', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await expect(page.locator('main h2')).toContainText('人员档案')
    await expect(page.locator('[data-stat="total"]')).toBeVisible()
    await expect(page.locator('[data-stat="active"]')).toBeVisible()
    await expect(page.locator('[data-stat="gcp_warning"]')).toBeVisible()
    await expect(page.locator('[data-stat="high_level"]')).toBeVisible()
  })

  test('2.2 看到人员卡片，包含姓名、工号、角色、能力等级标识', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    const staffCard = page.locator('.staff-card').first()
    await expect(staffCard).toBeVisible()
    await expect(staffCard).toContainText('王皮测')
    await expect(staffCard).toContainText('EMP-001')
  })

  test('2.3 按角色筛选"仪器操作员"，显示更少的结果', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await page.locator('select[aria-label="实验室角色"]').selectOption('instrument_operator')
    await page.waitForTimeout(500)
    const cards = page.locator('.staff-card')
    const count = await cards.count()
    expect(count).toBeLessThan(12)
  })

  test('2.4 按能力等级筛选"L4 专家期"，王皮测可见', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await page.locator('select[aria-label="能力等级"]').selectOption('L4')
    await page.waitForTimeout(500)
    await expect(page.locator('.staff-card').getByText('王皮测')).toBeVisible()
  })

  test('2.5 点击人员卡片，打开详情抽屉，显示姓名和标识', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await page.locator('.staff-card').first().click()
    await expect(page).toHaveURL(/\/lab-personnel\/staff\/\d+$/)
    await expect(page.getByRole('heading', { name: '王皮测' })).toBeVisible()
    await expect(page.getByText('EMP-001').first()).toBeVisible()
  })

  test('2.6 详情抽屉显示证书部分', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await page.locator('.staff-card').first().click()
    await page.getByRole('button', { name: '资质证书' }).click()
    await expect(page.locator('[data-section="certificates"]')).toBeVisible()
    await expect(page.locator('[data-section="certificates"]').getByText(/证书|培训证/).first()).toBeVisible()
  })

  test('2.7 详情抽屉显示方法资质部分', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await page.locator('.staff-card').first().click()
    await page.getByRole('button', { name: '方法资质' }).click()
    await expect(page.locator('[data-section="methods"]')).toBeVisible()
    await expect(page.locator('[data-section="methods"]').getByText(/累计执行|暂无方法资质/).first()).toBeVisible()
  })

  test('2.8 点击"新增档案"按钮，打开模态框，包含角色、雇佣类型、能力等级选择', async ({ page }) => {
    await page.goto('/lab-personnel/staff')
    await page.getByRole('button', { name: /新增档案/ }).click()
    await expect(page.getByText('新增实验室人员档案')).toBeVisible()
    await expect(page.locator('select[aria-label="新增实验室角色"]')).toBeVisible()
    await expect(page.locator('select[aria-label="用工类型"]')).toBeVisible()
  })
})
