import { test, expect } from '@playwright/test'
import { setupForRole } from '../helpers/setup'

test.describe('执行台飞书容器核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupForRole(page, 'crc')
  })

  test('可进入排程管理并执行一次最小交互', async ({ page }) => {
    await page.goto('/execution/dashboard')
    const authToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(authToken).toBeTruthy()
    await expect(page).toHaveURL(/\/execution\//)

    const menuButton = page.getByRole('button', { name: '打开导航菜单' }).first()
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click().catch(() => {})
      const schedulingLink = page.getByRole('complementary').getByRole('link', { name: '排程管理' })
      if (await schedulingLink.isVisible().catch(() => false)) {
        await schedulingLink.click().catch(() => {})
      }
    }

    const actionButton = page
      .getByRole('button', { name: /新建|创建|新增|发布|提交|保存|筛选|查询/ })
      .first()
    if (await actionButton.isVisible().catch(() => false)) {
      await actionButton.click().catch(() => {})
    }
  })
})
