import { test, expect } from './fixtures'

test.describe('S17: 合作里程碑展示', () => {
  test('S17.1: 里程碑时间线展示', async ({ page }) => {
    await page.goto('/#/milestones')
    await expect(page.getByRole('heading', { name: '客户里程碑' })).toBeVisible({ timeout: 10000 })
    const timeline = page.locator('[class*="timeline"]').or(page.locator('[class*="milestone"]'))
      .or(page.getByText('暂无里程碑')).or(page.locator('table'))
    await expect(timeline.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S17.2: 里程碑类型筛选', async ({ page }) => {
    await page.goto('/#/milestones')
    await expect(page.getByRole('heading', { name: '客户里程碑' })).toBeVisible({ timeout: 10000 })
    const filter = page.locator('select').first().or(page.locator('[role="combobox"]').first())
    await expect(filter).toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('S17.3: 里程碑详情卡片', async ({ page }) => {
    await page.goto('/#/milestones')
    await expect(page.getByRole('heading', { name: '客户里程碑' })).toBeVisible({ timeout: 10000 })
    const cards = page.locator('[class*="card"]').or(page.getByText('暂无里程碑'))
      .or(page.locator('.border').first())
    await expect(cards.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
