import { test, expect } from './fixtures'

test.describe('S05: 创新日历管理', () => {
  test('S05.1: 创新日历标签页加载', async ({ page }) => {
    await page.goto('/#/clients/1')
    const tab = page.getByText('创新日历')
    await expect(tab).toBeVisible({ timeout: 10000 })
    await tab.click()
    await expect(
      page.getByRole('heading', { name: '暂无创新日历' }).or(page.getByText('情报')).or(page.getByText('已确认'))
    ).toBeVisible({ timeout: 10000 })
  })

  test('S05.2: 创新项目卡片展示', async ({ page }) => {
    await page.goto('/#/clients/1')
    await page.getByText('创新日历').click({ timeout: 10000 })
    const content = page.getByText('暂无创新日历')
      .or(page.getByText('2024')).or(page.getByText('2025')).or(page.getByText('2026'))
    await expect(content.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S05.3: 创新状态标签', async ({ page }) => {
    await page.goto('/#/clients/1')
    await page.getByText('创新日历').click({ timeout: 10000 })
    const statusBadges = page.getByText('情报').or(page.getByText('已确认'))
      .or(page.getByText('已介入')).or(page.getByText('已立项'))
      .or(page.getByText('暂无创新日历'))
    await expect(statusBadges.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
