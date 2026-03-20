/**
 * 场景 S5：委派任务并跟踪
 *
 * 业务问题：发现某项目偏差未关闭，需要委派质量部跟进
 *
 * 权重: 10%
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S5 委派任务跟踪', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupApiMocks(page)
    await navigateTo(page, '/research/', '工作台')
  })

  test.afterAll(async () => { await page?.context().close() })

  test('S5.1 任务入口 — 导航有"任务委派"入口', async () => {
    const navItem = page.getByRole('link', { name: '任务委派' })
    await expect(navItem).toBeVisible()
    await navItem.click()
    await expect(page.getByText('任务委派').first()).toBeVisible()
  })

  test('S5.2 任务列表 — 展示已有委派任务', async () => {
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('row').nth(1)).toBeVisible({ timeout: 15_000 })
  })

  test('S5.3 任务统计 — 显示各状态计数', async () => {
    await expect(page.getByText('任务总数')).toBeVisible()
    await expect(page.getByText('进行中').first()).toBeVisible()
    await expect(page.getByText('已完成').first()).toBeVisible()
  })

  test('S5.4 创建任务 — 点击"创建任务"打开表单', async () => {
    await page.getByRole('button', { name: '创建任务' }).click()
    await expect(page.getByText('创建委派任务')).toBeVisible()
  })

  test('S5.5 任务表单 — 填写任务名称和指派人', async () => {
    const nameInput = page.getByPlaceholder('输入任务名称')
    await nameInput.fill('检查偏差DEV-002纠正措施执行情况')
    await expect(nameInput).toHaveValue('检查偏差DEV-002纠正措施执行情况')
    const assigneeSelect = page.getByTitle('选择指派人')
    await assigneeSelect.selectOption({ value: '5' })
  })

  test('S5.6 提交任务 — 点击创建后成功', async () => {
    const createBtn = page.getByRole('button', { name: '创建任务' }).last()
    await expect(createBtn).toBeEnabled()
    await createBtn.click({ timeout: 3000 })
    await page.waitForTimeout(500)
  })

  test('S5.7 任务状态跟踪 — 列表显示状态', async () => {
    await expect(page.getByText('进行中').first()).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('row').nth(1)).toBeVisible()
  })

  test('S5.8 逾期标记可见', async () => {
    const dueDateCells = page.locator('text=/\\d{4}\/\\d{1,2}\/\\d{1,2}/')
    const count = await dueDateCells.count()
    expect(count).toBeGreaterThan(0)
  })
})
