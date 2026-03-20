import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('场景1: 招募看板与导航', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupApiMocks(page)
    await navigateTo(page, '/recruitment/', '招募看板')
  })

  test.afterAll(async () => { await page?.context().close() })

  test('1.1 登录后直接看到招募看板', async () => {
    await expect(page).toHaveURL(/\/recruitment\/dashboard/)
    await expect(page.getByText('招招·招募台').first()).toBeVisible()
    await expect(page.getByText('全局招募进度总览与分析')).toBeVisible()
  })

  test('1.2 看板展示今日任务面板', async () => {
    await expect(page.getByText('今日任务')).toBeVisible()
    await expect(page.getByText('待联系')).toBeVisible()
    await expect(page.getByText('待筛选')).toBeVisible()
    await expect(page.getByText('待入组')).toBeVisible()
    await expect(page.getByText('需回访')).toBeVisible()
  })

  test('1.3 看板展示 KPI 统计卡片', async () => {
    await expect(page.getByText('目标人数')).toBeVisible()
    await expect(page.getByText('报名数')).toBeVisible()
    await expect(page.getByText('筛选数')).toBeVisible()
    await expect(page.getByText('入组数')).toBeVisible()
    await expect(page.getByText('进行中计划', { exact: true })).toBeVisible()
  })

  test('1.4 看板展示全局招募漏斗', async () => {
    await expect(page.getByText('全局招募漏斗')).toBeVisible()
    await expect(page.getByText('总转化率').first()).toBeVisible()
  })

  test('1.5 看板展示各项目招募进度', async () => {
    await expect(page.getByText('各项目招募进度')).toBeVisible()
    await expect(page.getByTitle('保湿功效评价招募')).toBeVisible()
    await expect(page.getByTitle('抗衰老功效评价招募')).toBeVisible()
  })

  test('1.6 看板展示近期报名动态和活跃计划', async () => {
    await expect(page.getByText('近期报名动态')).toBeVisible()
    await expect(page.getByText('活跃计划概览')).toBeVisible()
  })

  test('1.7 计划分析区域可选择计划查看漏斗', async () => {
    await expect(page.getByText('计划分析')).toBeVisible()

    const select = page.locator('select[title="选择计划"]')
    await expect(select).toBeVisible()
    await select.selectOption({ index: 1 })

    await expect(page.getByText('招募趋势')).toBeVisible()
    await expect(page.getByRole('heading', { name: '招募漏斗', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '退出分析' })).toBeVisible()
  })

  test('1.8 侧边导航包含全部 13 个功能入口', async () => {
    const sidebar = page.locator('aside')
    const expectedItems = [
      '招募看板', '计划管理', '报名管理', '筛选管理', '入组确认',
      '受试者管理', '签到管理', '依从性管理', '礼金管理',
      '客服工单', '问卷管理', '忠诚度', '渠道分析',
    ]
    for (const label of expectedItems) {
      await expect(sidebar.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test('1.9 导航可正常切换页面', async () => {
    const sidebar = page.locator('aside')
    await sidebar.getByText('计划管理').click()
    await expect(page).toHaveURL(/\/recruitment\/plans/)
    await expect(page.getByRole('heading', { name: '招募计划管理' })).toBeVisible()

    await sidebar.getByText('报名管理').click()
    await expect(page).toHaveURL(/\/recruitment\/registrations/)
    await expect(page.getByRole('heading', { name: '报名管理' })).toBeVisible()
  })

  test('1.10 用户信息在头部显示', async () => {
    await navigateTo(page, '/recruitment/dashboard', '李招募')
  })
})
