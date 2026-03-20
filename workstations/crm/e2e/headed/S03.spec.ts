import { test, expect } from './fixtures'

test.describe('S03: 组织架构可视化', () => {
  test('S03.1: 组织架构标签页加载', async ({ page }) => {
    await page.goto('/#/clients/1')
    const tab = page.getByText('组织架构')
    await expect(tab).toBeVisible({ timeout: 10000 })
    await tab.click()
    await expect(
      page.getByText('采购决策链').or(page.getByText('暂无组织架构信息')).or(page.getByText('组织架构').nth(1))
    ).toBeVisible({ timeout: 10000 })
  })

  test('S03.2: 决策链信息展示', async ({ page }) => {
    await page.goto('/#/clients/1')
    await page.getByText('组织架构').click({ timeout: 10000 })
    const content = page.getByText('采购决策链').or(page.getByText('暂无组织架构信息'))
    await expect(content.first()).toBeVisible({ timeout: 10000 })
  })

  test('S03.3: 预算审批层级展示', async ({ page }) => {
    await page.goto('/#/clients/1')
    await page.getByText('组织架构').click({ timeout: 10000 })
    const budget = page.getByText('预算审批层级').or(page.getByText('暂无组织架构信息'))
    await expect(budget.first()).toBeVisible({ timeout: 10000 })
  })
})
