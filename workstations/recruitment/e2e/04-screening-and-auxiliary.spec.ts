import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('场景4: 筛选管理', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupApiMocks(page)
    await navigateTo(page, '/recruitment/screening', '筛选管理')
  })

  test.afterAll(async () => { await page?.context().close() })

  test('4.1 筛选页面展示待筛选列表', async () => {
    await expect(page.getByText('逐项检查入排标准、记录生命体征，完成筛选评估')).toBeVisible()
  })

  test('4.2 筛选页面搜索功能可用', async () => {
    const searchInput = page.getByPlaceholder('搜索姓名/编号/手机')
    await expect(searchInput).toBeVisible()
  })
})

test.describe('场景5-7: 辅助页面', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test.afterAll(async () => { await page?.context().close() })

  test('5.1 受试者列表页面可访问', async () => {
    await navigateTo(page, '/recruitment/subjects', '受试者管理')
  })

  test('6.1 签到页面可访问', async () => {
    await navigateTo(page, '/recruitment/checkin', '签到管理')
  })

  test('7.1 依从性管理页面可访问', async () => {
    await navigateTo(page, '/recruitment/compliance', '依从性管理')
  })

  test('7.2 礼金管理页面可访问', async () => {
    await navigateTo(page, '/recruitment/payments', '礼金管理')
  })

  test('7.3 客服工单页面可访问', async () => {
    await navigateTo(page, '/recruitment/support', '客服工单')
  })

  test('7.4 问卷管理页面可访问', async () => {
    await navigateTo(page, '/recruitment/questionnaires', '问卷管理')
  })

  test('7.5 忠诚度页面可访问', async () => {
    await navigateTo(page, '/recruitment/loyalty', '受试者忠诚度')
  })

  test('7.6 渠道分析页面可访问', async () => {
    await navigateTo(page, '/recruitment/channel-analytics', '渠道效果分析')
  })
})
