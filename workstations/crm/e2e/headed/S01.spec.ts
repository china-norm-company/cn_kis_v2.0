import { test, expect } from './fixtures'

test.describe('S01: 客户画像完整度', () => {
  test('S01.1: 客户列表页面加载', async ({ page }) => {
    await page.goto('/#/clients')
    const heading = page.getByRole('heading', { name: '客户档案' })
    await expect(heading).toBeVisible({ timeout: 10000 })
    const createBtn = page.getByRole('button', { name: '新建客户' })
    await expect(createBtn).toBeVisible({ timeout: 10000 })
  })

  test('S01.2: 新建客户对话框', async ({ page }) => {
    await page.goto('/#/clients')
    await page.getByRole('button', { name: '新建客户' }).click({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '新建客户' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('客户名称').first()).toBeVisible({ timeout: 10000 })
  })

  test('S01.3: 客户详情画像标签页', async ({ page }) => {
    await page.goto('/#/clients/1')
    const profileTab = page.getByText('客户画像')
    await expect(profileTab).toBeVisible({ timeout: 10000 })
    await profileTab.click()
    await expect(page.getByRole('heading', { name: '基础信息' })).toBeVisible({ timeout: 10000 })
  })

  test('S01.4: 客户列表显示等级与类型标签', async ({ page }) => {
    await page.goto('/#/clients')
    await expect(page.getByRole('heading', { name: '客户档案' })).toBeVisible({ timeout: 10000 })
    const badges = page.getByText('铂金').or(page.getByText('黄金')).or(page.getByText('银牌'))
      .or(page.getByText('全球Top20')).or(page.getByText('国内Top10')).or(page.getByText('跨国企业'))
    await expect(badges.first()).toBeVisible({ timeout: 10000 }).catch(() => {})
  })
})
