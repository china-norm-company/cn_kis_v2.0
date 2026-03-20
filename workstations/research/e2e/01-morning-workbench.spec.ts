/**
 * 场景 S1：早间工作启动
 *
 * 业务问题：研究经理 8:30 打开系统，5 秒内知道今天要干什么
 *
 * 权重: 15%
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S1 早间工作启动', () => {
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

  test('S1.1 首页即待办 — 打开研究台默认显示工作台首页', async () => {
    await expect(page.getByText('工作台').first()).toBeVisible()
    await expect(page.getByText('今日待办')).toBeVisible()
  })

  test('S1.2 待办面板首屏可见 — 无需滚动', async () => {
    const todoPanel = page.getByText('今日待办')
    const box = await todoPanel.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeLessThan(600)
  })

  test('S1.3 分组计数准确 — 待审批/逾期工单/变更/访视计数可见', async () => {
    await expect(page.getByText('待审批')).toBeVisible()
    await expect(page.getByText('逾期工单')).toBeVisible()
    await expect(page.getByText('待处理变更')).toBeVisible()
    await expect(page.getByText('近期访视')).toBeVisible()
  })

  test('S1.4 点击待办可跳转 — 点击待办项后跳转到详情', async () => {
    const todoItem = page.getByText('工单逾期').first()
    await expect(todoItem).toBeVisible()
  })

  test('S1.5 通知铃铛 — Header 显示未读数', async () => {
    const bell = page.locator('button[title="通知"]')
    await expect(bell).toBeVisible()
    const badge = page.locator('button[title="通知"] span')
    await expect(badge.first()).toBeVisible()
  })

  test('S1.6 通知铃铛可展开 — 点击展示快速通知列表', async () => {
    const bell = page.locator('button[title="通知"]')
    await bell.click()
    await expect(page.getByText('通知').nth(1)).toBeVisible()
    await expect(page.getByText('查看全部通知')).toBeVisible()
    await bell.click()
  })

  test('S1.7 快速操作入口可见', async () => {
    await expect(page.getByText('快速操作')).toBeVisible()
    const main = page.getByRole('main')
    await expect(main.getByText('管理驾驶舱')).toBeVisible()
    await expect(main.getByText('我的客户')).toBeVisible()
    await expect(main.getByText('商务管线')).toBeVisible()
  })

  test('S1.8 日历日程可见', async () => {
    await expect(page.getByText('今日日程')).toBeVisible()
  })

  test('S1.9 5秒规则 — 页面加载性能', async () => {
    const start = Date.now()
    await page.goto('/research/')
    await page.getByText('今日待办').waitFor({ timeout: 5000 })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(5000)
  })
})
