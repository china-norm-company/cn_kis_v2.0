/**
 * 场景 S2：客户沟通准备
 *
 * 业务问题：客户来电问项目进展，研究经理 10 秒内准备好信息
 *
 * 权重: 15%
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S2 客户沟通准备', () => {
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

  test('S2.1 客户列表可访问 — 导航有"我的客户"入口', async () => {
    const navItem = page.getByRole('navigation').getByRole('link', { name: '我的客户' })
    await expect(navItem).toBeVisible()
    await navItem.click()
    await expect(page.getByText('我的客户').first()).toBeVisible()
  })

  test('S2.2 客户列表展示 — 显示客户数据', async () => {
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('row').nth(1)).toBeVisible({ timeout: 15_000 })
  })

  test('S2.3 客户搜索 — 输入关键词过滤', async () => {
    const searchInput = page.getByPlaceholder('搜索客户名称或联系人')
    await searchInput.fill('美丽')
    await expect(page.getByRole('link', { name: '美丽日化集团' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: '花西子品牌' }).first()).toBeHidden()
    await searchInput.clear()
  })

  test('S2.4 客户详情可进入 — 点击客户名跳转详情', async () => {
    await page.getByRole('link', { name: '美丽日化集团' }).first().click()
    await expect(page.getByText('美丽日化集团').first()).toBeVisible()
  })

  test('S2.5 客户项目全景 — 详情页显示关联项目', async () => {
    await expect(page.getByText('项目总览')).toBeVisible()
    await expect(page.getByText('保湿功效评价')).toBeVisible()
  })

  test('S2.6 沟通历史 — 切换到沟通 Tab 查看最近沟通', async () => {
    await page.getByText('沟通历史').click()
    await expect(page.getByText('沟通时间线')).toBeVisible()
  })

  test('S2.7 AI 洞察可触发', async () => {
    await page.getByText('AI 洞察').click()
    await expect(page.getByText('AI 客户洞察')).toBeVisible()
  })

  test('S2.8 返回客户列表', async () => {
    await page.goBack()
    await expect(page.getByText('我的客户').first()).toBeVisible()
  })

  test('S2.9 客户统计卡片可见', async () => {
    await navigateTo(page, '/research/#/clients')
    await page.waitForTimeout(500)
    await expect(page.getByText('客户总数')).toBeVisible()
    await expect(page.getByText('活跃项目客户')).toBeVisible()
    await expect(page.getByText('累计营收').first()).toBeVisible()
  })
})
