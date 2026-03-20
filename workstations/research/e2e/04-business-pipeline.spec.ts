/**
 * 场景 S4：商务状态追踪
 *
 * 业务问题：月度会议前，研究经理需要了解所有项目的商务状态
 *
 * 权重: 10%
 */
import { test, expect, type Page } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

test.describe('S4 商务状态追踪', () => {
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

  test('S4.1 商务入口 — 导航有"商务管线"入口', async () => {
    const navItem = page.getByRole('navigation').getByRole('link', { name: '商务管线' })
    await expect(navItem).toBeVisible()
    await navItem.click()
    await expect(page.getByText('商务管线').first()).toBeVisible()
  })

  test('S4.2 漏斗视图 — 显示商务漏斗各阶段', async () => {
    await expect(page.getByText('商务漏斗')).toBeVisible()
    await expect(page.getByText('商机').first()).toBeVisible()
    await expect(page.getByText('报价').first()).toBeVisible()
    await expect(page.getByText('合同').first()).toBeVisible()
    await expect(page.getByText('回款').first()).toBeVisible()
  })

  test('S4.3 漏斗统计卡片 — 各阶段数量和金额', async () => {
    await expect(page.getByText('8 项').first()).toBeVisible()
    await expect(page.getByText('5 项').first()).toBeVisible()
    await expect(page.getByText('4 项').first()).toBeVisible()
    await expect(page.getByText('3 项').first()).toBeVisible()
  })

  test('S4.4 项目商务状态 — 每个项目有商务卡片', async () => {
    await expect(page.getByText('项目商务状态')).toBeVisible()
    await expect(page.getByText('保湿功效评价')).toBeVisible()
    await expect(page.getByText('抗衰老功效评价')).toBeVisible()
  })

  test('S4.5 商务卡片展示合同/开票/回款', async () => {
    await expect(page.getByText('合同额').first()).toBeVisible()
    await expect(page.getByText('已开票').first()).toBeVisible()
    await expect(page.getByText('已回款').first()).toBeVisible()
    await expect(page.getByText('应收余额').first()).toBeVisible()
  })

  test('S4.6 回款预警 — 待回款项目有标记', async () => {
    await expect(page.getByText('待回款').first()).toBeVisible()
  })

  test('S4.7 回款率进度条可见', async () => {
    await expect(page.getByText('回款率').first()).toBeVisible()
  })
})
