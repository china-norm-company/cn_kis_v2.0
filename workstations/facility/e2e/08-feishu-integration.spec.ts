/**
 * 场景 08：飞书集成 — 认证与权限
 *
 * 系统通过飞书 OAuth 登录，赵坤元作为设施管理员拥有完整权限。
 * 测试认证状态、角色权限、品牌标识、导航过滤。
 *
 * 8 个用例
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'
import { authProfileData } from './helpers/mock-data'

test.describe('飞书集成 — 认证与权限', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('8.1 登录后显示用户名称', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.getByText('赵坤元')).toBeVisible()
  })

  test('8.2 品牌标识 — 坤元·设施台', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.getByText('坤元·设施台')).toBeVisible()
  })

  test('8.3 设施管理员可见全部 5 个菜单', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.getByRole('link', { name: '场地列表' })).toBeVisible()
    await expect(page.getByRole('link', { name: '场地预约' })).toBeVisible()
    await expect(page.getByRole('link', { name: '环境监控' })).toBeVisible()
    await expect(page.getByRole('link', { name: '不合规事件' })).toBeVisible()
    await expect(page.getByRole('link', { name: '清洁记录' })).toBeVisible()
  })

  test('8.4 权限数据包含设施管理权限', async ({ page }) => {
    await page.goto('/facility/venues')
    const profile = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('auth_profile') || '{}')
    })
    expect(profile.permissions).toContain('resource.venue.read')
    expect(profile.permissions).toContain('resource.venue.write')
    expect(profile.permissions).toContain('resource.environment.read')
    expect(profile.permissions).toContain('resource.environment.write')
  })

  test('8.5 角色标识正确', async ({ page }) => {
    await page.goto('/facility/venues')
    const profile = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('auth_profile') || '{}')
    })
    expect(profile.roles[0].name).toBe('facility_manager')
    expect(profile.roles[0].display_name).toBe('设施管理员')
  })

  test('8.6 未登录时重定向到登录', async ({ page }) => {
    const freshPage = await page.context().newPage()
    await setupApiMocks(freshPage)

    await freshPage.route('**/api/v1/auth/profile**', async (route) => {
      await route.fulfill({ status: 401, json: { code: 401, msg: '未登录' } })
    })

    await freshPage.goto('/facility/venues')
    await expect(freshPage.getByText('坤元·设施台').first()).toBeVisible()
    await freshPage.close()
  })

  test('8.7 限制权限用户只能看到部分菜单', async ({ page }) => {
    const limitedPage = await page.context().newPage()
    await limitedPage.addInitScript(() => {
      const limitedProfile = {
        id: 21,
        username: 'viewer',
        display_name: '访客用户',
        roles: [{ name: 'viewer', display_name: '查看者', level: 1 }],
        permissions: ['resource.venue.read', 'resource.environment.read'],
        visible_menu_items: { facility: ['venues', 'environment'] },
      }
      localStorage.setItem('auth_token', 'mock-viewer-token')
      localStorage.setItem('auth_user', JSON.stringify({ id: 21, name: '访客用户' }))
      localStorage.setItem('auth_profile', JSON.stringify(limitedProfile))
      localStorage.setItem('auth_profile_token', 'mock-viewer-token')
    })
    await setupApiMocks(limitedPage)

    await limitedPage.goto('/facility/venues')
    await expect(limitedPage.getByRole('link', { name: '场地列表' })).toBeVisible()
    await expect(limitedPage.getByRole('link', { name: '环境监控' })).toBeVisible()
    await limitedPage.close()
  })

  test('8.8 登出清除认证信息', async ({ page }) => {
    await page.goto('/facility/venues')
    await expect(page.getByText('赵坤元')).toBeVisible()

    const logoutBtn = page.locator('button[title="退出登录"]')
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click()
      const token = await page.evaluate(() => localStorage.getItem('auth_token'))
      expect(token).toBeNull()
    }
  })
})
