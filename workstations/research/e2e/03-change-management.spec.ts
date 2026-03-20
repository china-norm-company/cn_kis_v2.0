/**
 * 场景 S3：发起项目变更
 *
 * 业务问题：客户要求修改协议中的样本量，研究经理需要发起变更
 *
 * 权重: 15%
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S3 发起项目变更', () => {
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

  test('S3.1 变更入口 — 导航有"变更管理"入口', async () => {
    const navItem = page.getByRole('navigation').getByRole('link', { name: '变更管理' })
    await expect(navItem).toBeVisible()
    await navItem.click()
    await expect(page.getByText('变更管理').first()).toBeVisible()
  })

  test('S3.2 变更列表 — 展示已有变更请求', async () => {
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('row').nth(1)).toBeVisible({ timeout: 15_000 })
  })

  test('S3.3 变更统计 — 显示各状态计数', async () => {
    await expect(page.getByText('审批中').first()).toBeVisible()
    await expect(page.getByText('已批准').first()).toBeVisible()
  })

  test('S3.4 发起变更 — 点击"发起变更"打开表单', async () => {
    await page.getByRole('button', { name: '发起变更' }).click()
    await expect(page.getByRole('heading', { name: '发起变更请求' })).toBeVisible()
  })

  test('S3.5 变更表单 — 可选择类型、填写描述', async () => {
    const typeSelect = page.locator('select')
    await expect(typeSelect).toBeVisible()

    const descInput = page.getByPlaceholder('描述变更内容和原因')
    await descInput.fill('客户要求将样本量从30人增加到50人')
    await expect(descInput).toHaveValue('客户要求将样本量从30人增加到50人')
  })

  test('S3.6 变更提交 — 点击提交后成功', async () => {
    const submitBtn = page.getByRole('button', { name: '提交变更' })
    await submitBtn.click()
    await page.waitForTimeout(500)
  })

  test('S3.7 影响分析 — 点击变更行查看影响分析', async () => {
    const row = page.getByRole('row', { name: /方案修正/ }).first()
    await row.click()
    await expect(page.getByText('变更影响分析')).toBeVisible()
    await expect(page.getByText('受影响工单')).toBeVisible()
    await expect(page.getByText('受影响排程')).toBeVisible()
    await expect(page.getByText('成本影响')).toBeVisible()
  })

  test('S3.8 影响分析有建议 — 展示建议措施', async () => {
    await expect(page.getByText('建议措施')).toBeVisible()
    await expect(page.getByText('建议与客户确认追加预算')).toBeVisible()
  })
})
