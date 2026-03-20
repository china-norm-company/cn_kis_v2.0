/**
 * S13: 全覆盖回归 — 23条路由全部可访问 + 导航完整性 + 无白屏
 *
 * 验证所有页面均可正常渲染，无崩溃/白屏/JS错误
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks, navigateTo } from './helpers/setup'

const ALL_ROUTES = [
  { path: '/research/#/workbench', name: '工作台', expect: /工作台|待办/ },
  { path: '/research/#/manager', name: '管理驾驶舱', expect: /管理|驾驶舱|项目/ },
  { path: '/research/#/portfolio', name: '项目组合', expect: /项目组合|里程碑|组合/ },
  { path: '/research/#/clients', name: '我的客户', expect: /客户/ },
  { path: '/research/#/clients/1', name: '客户详情', expect: /美丽|日化|客户/ },
  { path: '/research/#/business', name: '商务管线', expect: /商务|管线|漏斗/ },
  { path: '/research/#/feasibility', name: '可行性评估', expect: /可行性/ },
  { path: '/research/#/proposals', name: '方案准备', expect: /方案/ },
  { path: '/research/#/proposals/create', name: '创建方案', expect: /创建|新建|方案/ },
  { path: '/research/#/proposals/1', name: '方案详情', expect: /保湿|方案/ },
  { path: '/research/#/protocols', name: '我的协议', expect: /协议/ },
  { path: '/research/#/protocols/1', name: '协议详情', expect: /保湿|HYD|协议/ },
  { path: '/research/#/projects/1/dashboard', name: '项目仪表板', expect: /保湿|项目|仪表/ },
  { path: '/research/#/closeout', name: '结项管理', expect: /结项/ },
  { path: '/research/#/changes', name: '变更管理', expect: /变更/ },
  { path: '/research/#/tasks', name: '任务委派', expect: /任务|委派/ },
  { path: '/research/#/visits', name: '我的访视', expect: /访视/ },
  { path: '/research/#/subjects', name: '我的受试者', expect: /受试者/ },
  { path: '/research/#/team', name: '团队全景', expect: /团队/ },
  { path: '/research/#/knowledge', name: '知识库', expect: /知识/ },
  { path: '/research/#/ai-assistant', name: 'AI助手', expect: /助手|Agent|对话|通用/ },
  { path: '/research/#/overview', name: '研究概览', expect: /概览|研究/ },
  { path: '/research/#/notifications', name: '通知收件箱', expect: /通知/ },
]

test.describe('S13 全路由回归', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  for (const route of ALL_ROUTES) {
    test(`${route.name} (${route.path}) 正常渲染`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      await page.goto(route.path)
      await page.waitForTimeout(3000)

      const body = await page.locator('body').innerText()
      expect(body.length).toBeGreaterThan(10)

      const content = await page.content()
      const hasExpected = route.expect.test(content) || route.expect.test(body)
      expect(hasExpected).toBeTruthy()

      const fatalErrors = errors.filter(e =>
        !e.includes('fetch') && !e.includes('API') && !e.includes('Network') && !e.includes('ERR_')
      )
      expect(fatalErrors).toHaveLength(0)
    })
  }
})

test.describe('S13 导航完整性', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('侧边栏包含所有导航分组', async ({ page }) => {
    await navigateTo(page, '/research/', '工作台')
    const requiredNavItems = ['我的工作台', '管理驾驶舱', '我的客户', '变更管理', '任务委派', '团队全景']
    for (const label of requiredNavItems) {
      await expect(page.locator('nav a').filter({ hasText: label }).first()).toBeVisible()
    }
  })

  test('导航菜单项可点击跳转', async ({ page }) => {
    await navigateTo(page, '/research/', '工作台')

    const navItems = [
      { label: '管理驾驶舱', expectUrl: /manager/ },
      { label: '我的客户', expectUrl: /clients/ },
      { label: '商务管线', expectUrl: /business/ },
    ]

    for (const item of navItems) {
      const link = page.locator('nav a').filter({ hasText: item.label }).first()
      if (await link.isVisible().catch(() => false)) {
        await link.click()
        await page.waitForTimeout(1500)
        expect(page.url()).toMatch(item.expectUrl)
      }
    }
  })
})

test.describe('S13 异常边界', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('快速连续导航不白屏', async ({ page }) => {
    const paths = ['/research/', '/research/#/manager', '/research/#/clients', '/research/#/business', '/research/#/changes', '/research/#/team', '/research/']
    for (const p of paths) {
      await page.goto(p)
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(2000)
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(10)
  })

  test('不存在的路由不崩溃', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/research/#/nonexistent-page-xyz')
    await page.waitForTimeout(3000)
    const fatalErrors = errors.filter(e =>
      !e.includes('fetch') && !e.includes('API') && !e.includes('Network') && !e.includes('ERR_')
    )
    expect(fatalErrors).toHaveLength(0)
  })
})
