import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('场景3: 报名管理全流程', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupApiMocks(page)
    await navigateTo(page, '/recruitment/registrations', 'REG-2026-0001')
  })

  test.afterAll(async () => { await page?.context().close() })

  test('3.1 报名列表展示完整信息', async () => {
    await expect(page.getByRole('heading', { name: '报名管理' })).toBeVisible()
    await expect(page.getByText('张三')).toBeVisible()
    await expect(page.getByText('13800138001')).toBeVisible()

    const table = page.locator('table')
    await expect(table).toBeVisible()
    await expect(table.locator('th', { hasText: '报名编号' })).toBeVisible()
    await expect(table.locator('th', { hasText: '姓名' })).toBeVisible()
    await expect(table.locator('th', { hasText: '手机' })).toBeVisible()
    await expect(table.locator('th', { hasText: '状态' })).toBeVisible()
  })

  test('3.2 报名状态筛选', async () => {
    const statusSelect = page.locator('select[title="状态筛选"]')
    await expect(statusSelect).toBeVisible()

    const options = statusSelect.locator('option')
    const texts = await options.allTextContents()
    expect(texts).toContain('已报名')
    expect(texts).toContain('已联系')
    expect(texts).toContain('筛选中')
    expect(texts).toContain('已入组')
    expect(texts).toContain('已退出')
  })

  test('3.3 搜索框可用', async () => {
    const searchInput = page.getByPlaceholder('搜索姓名/编号/手机')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('张三')
    await searchInput.press('Enter')
    await expect(page.getByText('张三')).toBeVisible()
    await searchInput.clear()
    await searchInput.press('Enter')
    await expect(page.getByText('REG-2026-0001')).toBeVisible()
  })

  test('3.4 新建报名按钮打开创建弹窗', async () => {
    await page.getByRole('button', { name: '新建报名' }).click()
    await expect(page.getByRole('heading', { name: '新建报名' })).toBeVisible()

    await expect(page.locator('.fixed').getByText('招募计划')).toBeVisible()
    await expect(page.locator('.fixed').getByText('姓名')).toBeVisible()
    await expect(page.locator('.fixed').getByText('手机')).toBeVisible()
    await expect(page.getByRole('button', { name: '提交报名' })).toBeVisible()
  })

  test('3.5 报名创建弹窗可关闭', async () => {
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('heading', { name: '新建报名' })).not.toBeVisible({ timeout: 3000 })
  })

  test('3.6 操作列包含跟进按钮', async () => {
    await expect(page.getByText('跟进').first()).toBeVisible()
  })

  test('3.7 跟进抽屉可打开并展示记录', async () => {
    const row = page.locator('tr', { hasText: 'REG-2026-0001' })
    await row.getByText('跟进').click()

    await expect(page.getByRole('heading', { name: '跟进记录' })).toBeVisible()
    await expect(page.getByText('+ 添加跟进')).toBeVisible()
  })

  test('3.8 跟进抽屉可关闭', async () => {
    await page.locator('button[title="关闭"]').click()
    await expect(page.getByRole('heading', { name: '跟进记录' })).not.toBeVisible({ timeout: 3000 })
  })

  test('3.9 已报名状态显示筛选按钮', async () => {
    const row = page.locator('tr', { hasText: '张三' })
    await expect(row.getByText('筛选')).toBeVisible()
  })

  test('3.10 退出按钮在可退出状态下可见', async () => {
    const row = page.locator('tr', { hasText: '张三' })
    await expect(row.getByText('退出')).toBeVisible()
  })

  test('3.11 退出对话框要求填写原因', async () => {
    const row = page.locator('tr', { hasText: '张三' })
    await row.getByText('退出').click()

    await expect(page.getByRole('heading', { name: '退出报名' })).toBeVisible()
    await expect(page.getByText('退出原因 *')).toBeVisible()

    const confirmBtn = page.getByRole('button', { name: '确认退出' })
    await expect(confirmBtn).toBeDisabled()

    await page.getByPlaceholder('请详细说明退出原因...').fill('个人原因')
    await expect(confirmBtn).toBeEnabled()

    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('heading', { name: '退出报名' })).not.toBeVisible({ timeout: 3000 })
  })

  test('3.12 导出按钮可见', async () => {
    await expect(page.getByRole('button', { name: '导出' })).toBeVisible()
  })

  test('3.13 退出状态显示退出原因', async () => {
    const withdrawnRow = page.locator('tr', { hasText: '刘洋' })
    await expect(withdrawnRow.getByText('已退出')).toBeVisible()
    await expect(withdrawnRow.getByText(/个人时间安排冲突/)).toBeVisible()
  })
})
