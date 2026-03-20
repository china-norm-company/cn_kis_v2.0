/**
 * 场景 08：飞书集成 — 认证与界面集成
 *
 * 钱子衿通过飞书 OAuth 登录，系统显示飞书集成的布局结构：
 * 侧边栏、标题、用户信息、导航菜单、登出按钮。
 *
 * 6 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('飞书集成 — 认证与界面集成', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('8.1 布局显示飞书认证包装的内容（侧边栏带"人"logo）', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByText('人', { exact: true })).toBeVisible()
  })

  test('8.2 头部显示"共济·人员台"标题', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await expect(page.getByText('共济·人员台')).toBeVisible()
  })

  test('8.3 用户信息区域显示用户姓名', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await expect(page.getByText('钱子衿')).toBeVisible()
  })

  test('8.4 侧边栏显示 7 个导航项，标签正确', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: '管理看板' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '人员档案' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '资质矩阵' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '排班管理' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '工时统计' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '风险预警' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '工单派发' })).toBeVisible()
  })

  test('8.5 侧边栏导航项带有图标（lucide-react）', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    const navLinks = page.locator('aside').getByRole('link')
    const firstLink = navLinks.first()
    await expect(firstLink.locator('svg')).toBeVisible()
  })

  test('8.6 登出按钮可见', async ({ page }) => {
    await page.goto('/lab-personnel/dashboard')
    await expect(page.locator('button[title="退出登录"]')).toBeVisible()
  })
})
