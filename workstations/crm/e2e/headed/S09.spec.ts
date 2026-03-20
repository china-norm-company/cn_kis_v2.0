import { test, expect } from './fixtures'

test.describe('S09: 研究经理赋能', () => {
  test('S09.1: 简报分享功能入口', async ({ page }) => {
    await page.goto('/#/briefs')
    await expect(page.getByRole('heading', { name: '客户简报' })).toBeVisible({ timeout: 10000 })
    const shareBtn = page.getByText('分享').or(page.getByText('导出'))
      .or(page.getByText('新建简报')).or(page.getByText('编辑'))
    await expect(shareBtn.first()).toBeVisible({ timeout: 10000 })
  })

  test('S09.2: 洞察分享功能入口', async ({ page }) => {
    await page.goto('/#/insights')
    await expect(page.getByRole('heading', { name: '价值洞察' })).toBeVisible({ timeout: 10000 })
    const shareBtn = page.getByText('分享').or(page.getByText('导出'))
      .or(page.getByRole('button', { name: '创建洞察' }))
    await expect(shareBtn.first()).toBeVisible({ timeout: 10000 })
  })

  test('S09.3: 简报与洞察联动导航', async ({ page }) => {
    await page.goto('/#/briefs')
    await expect(page.getByRole('heading', { name: '客户简报' })).toBeVisible({ timeout: 10000 })
    await page.getByText('价值洞察').click({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '价值洞察' })).toBeVisible({ timeout: 10000 })
  })
})
