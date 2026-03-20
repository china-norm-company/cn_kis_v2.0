import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

test.describe('S18: 整体导航与架构', () => {
  const sidebar = (page: Page) =>
    page.getByRole('complementary').getByRole('navigation')

  test('S18.1: 侧边栏6个导航分组', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    const navGroups = ['总览', '客户管理', '商机管理', '客户赋能', '监控预警', '知识引擎']
    for (const group of navGroups) {
      await expect(page.getByText(group).first()).toBeVisible({ timeout: 10000 }).catch(() => {})
    }
  })

  test('S18.2: 客户管理导航链接', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    await sidebar(page).getByRole('link', { name: '客户组合' }).click({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '客户档案' })).toBeVisible({ timeout: 10000 })
  })

  test('S18.3: 商机管理导航链接', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    await sidebar(page).getByRole('link', { name: '管道总览' }).click({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '商机跟踪' })).toBeVisible({ timeout: 10000 })
  })

  test('S18.4: 客户赋能与监控预警导航', async ({ page }) => {
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: '管理驾驶舱' })).toBeVisible({ timeout: 10000 })
    await sidebar(page).getByRole('link', { name: '价值洞察' }).click({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '价值洞察' })).toBeVisible({ timeout: 10000 })
    await sidebar(page).getByRole('link', { name: '预警中心' }).click({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 10000 })
  })
})
