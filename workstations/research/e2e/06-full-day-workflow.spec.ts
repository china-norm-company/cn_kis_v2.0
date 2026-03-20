/**
 * 场景 S6：完整工作日闭环
 *
 * 核心集成测试：模拟研究经理一天的典型工作流
 *   打开工作台 → 查看待办 → 查客户信息 → 检查项目进展
 *   → 发现风险 → 发起变更 → 委派任务 → 查商务状态
 *
 * 权重: 20%
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S6 完整工作日闭环', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test.afterAll(async () => { await page?.context().close() })

  test('S6.1 打开工作台 — 默认显示待办', async () => {
    await navigateTo(page, '/research/', '工作台')
    await expect(page.getByText('今日待办')).toBeVisible()
    await expect(page.getByText('快速操作')).toBeVisible()
  })

  test('S6.2 查看待办 — 待办面板分组计数', async () => {
    await expect(page.getByText('待审批')).toBeVisible()
    await expect(page.getByText('逾期工单')).toBeVisible()
  })

  test('S6.3 查看通知 — 铃铛展示未读', async () => {
    const bell = page.locator('button[title="通知"]')
    await bell.click()
    await expect(page.getByText('查看全部通知')).toBeVisible()
    await bell.click()
  })

  test('S6.4 进入客户视图 — 查看客户信息', async () => {
    await page.getByRole('navigation').getByRole('link', { name: '我的客户' }).click()
    await expect(page.getByRole('heading', { name: '我的客户' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('row').nth(1)).toBeVisible({ timeout: 15_000 })
  })

  test('S6.5 客户详情 — 查看项目全景', async () => {
    await page.getByRole('link', { name: '美丽日化集团' }).first().click()
    await expect(page.getByText('项目总览')).toBeVisible()
    await expect(page.getByText('保湿功效评价')).toBeVisible()
  })

  test('S6.6 返回并进入管理驾驶舱 — 检查项目进展', async () => {
    await page.getByRole('link', { name: '管理驾驶舱' }).click()
    await expect(page.getByText('管理驾驶舱').first()).toBeVisible()
    await expect(page.getByText('项目健康度')).toBeVisible()
  })

  test('S6.7 风险预警可见 — 驾驶舱显示预警', async () => {
    await expect(page.getByText('风险预警中心')).toBeVisible()
  })

  test('S6.8 预警有快速操作 — 详情/变更/委派按钮', async () => {
    await expect(page.getByText('详情').first()).toBeVisible()
    await expect(page.getByText('变更').first()).toBeVisible()
    await expect(page.getByText('委派').first()).toBeVisible()
  })

  test('S6.9 进入变更管理 — 发起变更', async () => {
    await page.getByRole('navigation').getByRole('link', { name: '变更管理' }).click()
    await expect(page.getByText('变更管理').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '发起变更' })).toBeVisible()
  })

  test('S6.10 进入任务委派 — 查看委派任务', async () => {
    await page.getByRole('navigation').getByRole('link', { name: '任务委派' }).click()
    await expect(page.getByText('任务委派').first()).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('row').nth(1)).toBeVisible()
  })

  test('S6.11 进入商务管线 — 查看商务状态', async () => {
    await page.getByRole('navigation').getByRole('link', { name: '商务管线' }).click()
    await expect(page.getByText('商务管线').first()).toBeVisible()
    await expect(page.getByText('商务漏斗')).toBeVisible()
  })

  test('S6.12 全流程无白屏 — 所有页面正常渲染', async () => {
    const errorBoundary = page.locator('text=出错了')
    await expect(errorBoundary).not.toBeVisible()
  })

  test('S6.13 全流程无跳出 — 未切换到其他工作台', async () => {
    const url = page.url()
    expect(url).toContain('/research/')
  })

  test('S6.14 导航零迷路 — 每个主要功能 2 次点击内可达', async () => {
    const mainNavItems = ['我的工作台', '管理驾驶舱', '我的客户', '商务管线', '变更管理', '任务委派']
    for (const label of mainNavItems) {
      const link = page.getByRole('navigation').getByRole('link', { name: label })
      await expect(link).toBeVisible()
    }
  })

  test('S6.15 回到工作台 — 结束工作日', async () => {
    await page.getByRole('navigation').getByRole('link', { name: '我的工作台' }).click()
    await expect(page.getByText('今日待办')).toBeVisible()
  })
})
