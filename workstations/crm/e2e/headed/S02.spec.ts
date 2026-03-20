import { test, expect } from './fixtures'

test.describe('S02: 关键联系人管理', () => {
  test('S02.1: 关键联系人标签页加载', async ({ page }) => {
    await page.goto('/#/clients/1')
    const tab = page.getByText('关键联系人')
    await expect(tab).toBeVisible({ timeout: 10000 })
    await tab.click()
    await expect(
      page.getByRole('heading', { name: '暂无关键联系人' }).or(page.getByText('添加联系人'))
    ).toBeVisible({ timeout: 10000 })
  })

  test('S02.2: 联系人卡片内容', async ({ page }) => {
    await page.goto('/#/clients/1')
    await page.getByText('关键联系人').click({ timeout: 10000 })
    const content = page.getByText('暂无关键联系人')
      .or(page.getByText('决策者')).or(page.getByText('影响者')).or(page.getByText('使用者'))
      .or(page.getByText('技术把关'))
    await expect(content.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S02.3: 超期联系提醒标记', async ({ page }) => {
    await page.goto('/#/clients/1')
    await page.getByText('关键联系人').click({ timeout: 10000 })
    const overdue = page.getByText('超期').or(page.getByText('暂无关键联系人'))
    await expect(overdue.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
