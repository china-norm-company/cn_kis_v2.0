import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('场景2: 招募计划管理', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupApiMocks(page)
    await navigateTo(page, '/recruitment/plans', 'RP-2026-001')
  })

  test.afterAll(async () => { await page?.context().close() })

  test('2.1 计划列表展示完整信息', async () => {
    await expect(page.getByRole('heading', { name: '招募计划管理' })).toBeVisible()
    await expect(page.getByText('保湿功效评价招募')).toBeVisible()

    const table = page.locator('table')
    await expect(table).toBeVisible()
    await expect(table.locator('th', { hasText: '计划编号' })).toBeVisible()
    await expect(table.locator('th', { hasText: '标题' })).toBeVisible()
    await expect(table.locator('th', { hasText: '目标/入组' })).toBeVisible()
    await expect(table.locator('th', { hasText: '完成率' })).toBeVisible()
    await expect(table.locator('th', { hasText: '状态' })).toBeVisible()
  })

  test('2.2 计划状态筛选', async () => {
    const statusSelect = page.locator('select[title="状态筛选"]')
    await expect(statusSelect).toBeVisible()

    const options = statusSelect.locator('option')
    const optionTexts = await options.allTextContents()
    expect(optionTexts).toContain('全部状态')
    expect(optionTexts).toContain('草稿')
    expect(optionTexts).toContain('进行中')
  })

  test('2.3 搜索框可用', async () => {
    const searchInput = page.getByPlaceholder('搜索编号/标题')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('保湿')
    await searchInput.press('Enter')
    await expect(page.getByText('保湿功效评价招募')).toBeVisible()
    await searchInput.clear()
    await searchInput.press('Enter')
  })

  test('2.4 新建计划按钮打开创建弹窗', async () => {
    await page.getByRole('button', { name: '新建计划' }).click()
    await expect(page.getByRole('heading', { name: '新建招募计划' })).toBeVisible()

    await expect(page.getByText('计划标题')).toBeVisible()
    await expect(page.getByText('关联协议')).toBeVisible()
    await expect(page.getByText('目标人数')).toBeVisible()
    await expect(page.getByRole('button', { name: '创建' })).toBeVisible()
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible()
  })

  test('2.5 创建弹窗可以关闭', async () => {
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('heading', { name: '新建招募计划' })).not.toBeVisible({ timeout: 3000 })
  })

  test('2.6 计划列表提供状态流转操作', async () => {
    const draftRow = page.locator('tr', { hasText: '美白功效评价招募' })
    await expect(draftRow).toBeVisible()
    await expect(draftRow.getByRole('button', { name: '待审批' })).toBeVisible()
    await expect(draftRow.getByRole('button', { name: '删除' })).toBeVisible()
  })

  test('2.7 导出按钮可见', async () => {
    const exportBtn = page.getByRole('button', { name: '导出' })
    await expect(exportBtn).toBeVisible()
    await expect(exportBtn).toBeEnabled()
  })

  test('2.8 计划编号可点击', async () => {
    const planLink = page.getByRole('button', { name: 'RP-2026-001' })
    await expect(planLink).toBeVisible()
    await planLink.click()
    await expect(page).toHaveURL(/\/recruitment\/plans\/1/)
  })
})
