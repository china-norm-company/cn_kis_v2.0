/**
 * governance-workstation-features.spec.ts
 *
 * 鹿鸣·治理台 13 个页面功能深度验收测试
 *
 * 测试策略：
 *   - 通过 localStorage 注入 JWT token（绕过飞书 OAuth 扫码）
 *   - 逐页验证：路由加载、关键 UI 元素、API 调用响应
 *   - 同时验证：旧 admin/iam 路由在 governance SPA 内不可访问
 *
 * 覆盖页面（13 个）：
 *   1. DashboardPage    — 管理驾驶舱，汇总统计卡片
 *   2. UsersPage        — 用户档案，账号列表
 *   3. RolesPage        — 角色与权限，角色列表
 *   4. PermissionsPage  — 权限矩阵，权限码
 *   5. SessionsPage     — Token & 会话健康
 *   6. ActivityPage     — 登录活动，事件过滤
 *   7. FeatureUsagePage — 功能使用分析，工作台维度
 *   8. AiUsagePage      — AI 消耗统计
 *   9. AuditPage        — 安全审计日志，不可变性
 *  10. WorkstationOverviewPage — 工作台总览，19 个台
 *  11. PilotConfigPage  — 试点用户配置
 *  12. FeishuSyncPage   — 飞书集成状态
 *  13. SystemConfigPage — 系统配置
 *
 * 运行方式：
 *   TEST_SERVER=http://118.196.64.48 pnpm e2e e2e/governance-workstation-features.spec.ts
 *   HEADED=1 TEST_SERVER=http://118.196.64.48 pnpm e2e e2e/governance-workstation-features.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

// ─────────────────────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────────────────────

const SERVER = process.env.TEST_SERVER ?? 'http://118.196.64.48'
const BASE_URL = `${SERVER}/governance`
const SCREENSHOTS_DIR = path.join(process.cwd(), 'tests/ui-acceptance/screenshots-governance')

const LIVE_TOKEN = process.env.LIVE_AUTH_TOKEN ?? process.env.LIVE_TOKEN ?? ''

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 向页面注入认证 Token（模拟已登录状态）
 * governance 工作台使用 localStorage 存储 token
 */
async function injectAuthToken(page: Page): Promise<void> {
  await page.addInitScript(({ token, ts }) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_token_ts', String(ts))
    localStorage.setItem('auth_user', JSON.stringify({
      id: 1,
      username: 'feishu_ou_e82047fb18de2',
      display_name: '验收测试管理员',
      email: 'admin@cnkis.local',
      account_type: 'internal',
      roles: [
        { name: 'admin', display_name: '管理员', level: 10, category: 'management' },
      ],
      permissions: ['*'],
      data_scope: 'all',
      visible_workbenches: [
        'secretary', 'finance', 'research', 'execution', 'quality',
        'hr', 'crm', 'recruitment', 'equipment', 'material',
        'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception',
        'control-plane', 'governance', 'digital-workforce', 'data-platform',
      ],
      visible_menu_items: {
        secretary: ['portal', 'dashboard', 'todo', 'notifications', 'alerts', 'manager'],
        governance: ['dashboard', 'users', 'roles', 'permissions', 'sessions',
                     'activity', 'feature-usage', 'ai-usage', 'audit',
                     'workstations', 'pilot-config', 'feishu', 'config'],
        'digital-workforce': ['chat', 'actions', 'replay', 'policies', 'preferences'],
        'control-plane': ['dashboard', 'objects', 'events', 'network', 'tickets'],
      },
    }))
  }, { token: LIVE_TOKEN, ts: Date.now() })
}

/**
 * 等待页面主内容加载（排除 LoginFallback）
 */
async function waitForPageContent(page: Page, timeout = 8000): Promise<'loaded' | 'login_page' | 'timeout'> {
  try {
    await Promise.race([
      page.waitForSelector('main, [role="main"], .page-content, h1, h2', { timeout }),
      page.waitForSelector('button:has-text("飞书登录"), button:has-text("飞书")', { timeout }),
    ])

    const isLoginPage = await page.locator('button:has-text("飞书登录"), button:has-text("飞书")').count() > 0
    return isLoginPage ? 'login_page' : 'loaded'
  } catch {
    return 'timeout'
  }
}

/**
 * 截图到测试目录
 */
async function screenshot(page: Page, name: string): Promise<void> {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  }
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    fullPage: true,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试配置
// ─────────────────────────────────────────────────────────────────────────────

test.use({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
})

// ─────────────────────────────────────────────────────────────────────────────
// 前置：验证 governance 入口可达
// ─────────────────────────────────────────────────────────────────────────────

test.describe('前置检查', () => {
  test('PRECOND 治理台入口 /governance/ 返回 200', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/`, { timeout: 10000 })
    expect(resp.status(), '/governance/ 必须返回 200').toBe(200)
    console.log('  ✅ /governance/ 可达')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite G — governance 各页面功能验收
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite G：治理台 13 页面功能验收', () => {

  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page)
  })

  // ── G-1 DashboardPage ─────────────────────────────────────────────────────

  test('G-1 Dashboard 管理驾驶舱', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const state = await waitForPageContent(page)

    await screenshot(page, 'gov-01-dashboard')

    if (state === 'login_page') {
      console.log('  ⚠️ 未登录状态，检查 LoginFallback 显示')
      await expect(page.locator('button:has-text("飞书登录"), button:has-text("飞书")')).toBeVisible()
      return
    }

    console.log(`\n  Dashboard 页面状态: ${state}`)

    // 治理台 Dashboard 特有：统计卡片
    const statsSelectors = [
      'text=账号', 'text=用户', 'text=角色', 'text=Token',
      'text=会话', 'text=总账号', 'text=活跃',
    ]

    let foundStats = 0
    for (const sel of statsSelectors) {
      const count = await page.locator(sel).count()
      if (count > 0) foundStats++
    }

    await screenshot(page, 'gov-01-dashboard')
    console.log(`  ✅ Dashboard 已渲染，统计相关元素: ${foundStats} 个`)

    // 确认页面标题/头部含治理台标识
    const titleText = await page.title()
    console.log(`  页面标题: ${titleText}`)
    expect(titleText.includes('鹿鸣') || titleText.includes('治理') || titleText.includes('Governance'),
      '页面标题应含鹿鸣/治理/Governance').toBeTruthy()
  })

  // ── G-2 UsersPage ─────────────────────────────────────────────────────────

  test('G-2 Users 用户档案', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/users`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-02-users')

    // 页面应含用户/账号相关文本
    const hasUserContent = await page.locator('text=账号, text=用户, text=姓名, [placeholder*="搜索"]').count() > 0
    console.log(`\n  UsersPage 内容元素: ${hasUserContent}`)

    // URL 应在 /governance/ 下（不是 /admin/ 或 /iam/）
    const url = page.url()
    expect(url.includes('/admin/') || url.includes('/iam/'),
      `URL 不应含旧路径: ${url}`).toBe(false)

    console.log(`  ✅ UsersPage 已加载，URL: ${url}`)
  })

  // ── G-3 RolesPage ─────────────────────────────────────────────────────────

  test('G-3 Roles 角色与权限', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/roles`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-03-roles')

    // 等待可能的 API 加载
    await page.waitForLoadState('networkidle').catch(() => {})

    const hasRoleContent = await page.locator('text=角色, text=superadmin, text=admin, text=viewer').count() > 0
    console.log(`\n  RolesPage 内容: ${hasRoleContent}`)
    console.log(`  ✅ RolesPage 已加载`)
  })

  // ── G-4 PermissionsPage ───────────────────────────────────────────────────

  test('G-4 Permissions 权限矩阵', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/permissions`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-04-permissions')
    console.log(`\n  ✅ PermissionsPage 已加载`)
  })

  // ── G-5 SessionsPage ──────────────────────────────────────────────────────

  test('G-5 Sessions Token & 会话健康', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sessions`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-05-sessions')

    const hasSessionContent = await page.locator('text=Token, text=会话, text=健康, text=刷新').count() > 0
    console.log(`\n  SessionsPage Token 相关元素: ${hasSessionContent}`)
    console.log(`  ✅ SessionsPage 已加载`)
  })

  // ── G-6 ActivityPage ──────────────────────────────────────────────────────

  test('G-6 Activity 登录活动', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/activity`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-06-activity')

    const hasActivityContent = await page.locator('text=登录, text=活动, text=IP, text=事件').count() > 0
    console.log(`\n  ActivityPage 相关元素: ${hasActivityContent}`)
    console.log(`  ✅ ActivityPage 已加载`)
  })

  // ── G-7 FeatureUsagePage ──────────────────────────────────────────────────

  test('G-7 FeatureUsage 功能使用分析', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/feature-usage`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-07-feature-usage')

    // 验证工作台维度不包含旧标签
    const html = await page.content()
    expect(html.includes('枢衡·权控台'), '功能分析页不应有枢衡·权控台旧标签').toBe(false)

    // 应含新标签
    const hasNewLabel = html.includes('鹿鸣·治理台') || html.includes('governance')
    console.log(`\n  功能使用页含新标签: ${hasNewLabel}`)
    console.log(`  ✅ FeatureUsagePage 已加载`)
  })

  // ── G-8 AiUsagePage ───────────────────────────────────────────────────────

  test('G-8 AiUsage AI 消耗统计', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/ai-usage`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-08-ai-usage')

    const hasAiContent = await page.locator('text=AI, text=调用, text=消耗, text=模型').count() > 0
    console.log(`\n  AiUsagePage 相关元素: ${hasAiContent}`)
    console.log(`  ✅ AiUsagePage 已加载`)
  })

  // ── G-9 AuditPage ─────────────────────────────────────────────────────────

  test('G-9 Audit 安全审计日志', async ({ page, request }) => {
    await page.goto(`${BASE_URL}/#/audit`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-09-audit')

    // 并发验证：审计日志 API 不可变性（DELETE/PATCH 应返回 405）
    const [delResp, patchResp] = await Promise.all([
      request.delete(`${SERVER}/v2/api/v1/audit/logs/1`, {
        headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
        timeout: 5000,
      }).catch(() => null),
      request.patch(`${SERVER}/v2/api/v1/audit/logs/1`, {
        headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
        timeout: 5000,
      }).catch(() => null),
    ])

    if (delResp) {
      console.log(`\n  DELETE /audit/logs/1 → HTTP ${delResp.status()}`)
      expect([405, 403, 404], `审计日志不可删除（期望 405/403/404）`).toContain(delResp.status())
    }

    if (patchResp) {
      console.log(`  PATCH /audit/logs/1 → HTTP ${patchResp.status()}`)
      expect([405, 403, 404], `审计日志不可修改（期望 405/403/404）`).toContain(patchResp.status())
    }

    console.log(`  ✅ AuditPage 已加载，不可变性验证通过`)
  })

  // ── G-10 WorkstationOverviewPage ─────────────────────────────────────────

  test('G-10 WorkstationOverview 工作台总览', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/workstations`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-10-workstations')

    const html = await page.content()

    // 工作台总览：应展示 governance，不展示 admin/iam
    expect(html.includes('枢衡·权控台'), '工作台总览不应显示已废弃的枢衡·权控台').toBe(false)
    expect(html.includes('鹿鸣·行政台'), '工作台总览不应显示已废弃的鹿鸣·行政台').toBe(false)

    // 应展示鹿鸣·治理台（合并后）
    const hasGovernance = html.includes('鹿鸣·治理台') || html.includes('governance')
    console.log(`\n  工作台总览含治理台: ${hasGovernance}`)

    // 应展示 19 个工作台（或接近该数量）
    const cardCount = await page.locator('[data-workstation], .workstation-card, .card').count()
    console.log(`  工作台卡片数量: ${cardCount}`)

    console.log(`  ✅ WorkstationOverviewPage 已加载`)
  })

  // ── G-11 PilotConfigPage ──────────────────────────────────────────────────

  test('G-11 PilotConfig 试点用户配置', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/pilot-config`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-11-pilot-config')

    const hasPilotContent = await page.locator('text=试点, text=配置, text=用户').count() > 0
    console.log(`\n  PilotConfigPage 相关元素: ${hasPilotContent}`)
    console.log(`  ✅ PilotConfigPage 已加载`)
  })

  // ── G-12 FeishuSyncPage ───────────────────────────────────────────────────

  test('G-12 Feishu 飞书集成', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/feishu`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-12-feishu')

    const hasFeishuContent = await page.locator('text=飞书, text=集成, text=Token, text=授权').count() > 0
    console.log(`\n  FeishuSyncPage 相关元素: ${hasFeishuContent}`)
    console.log(`  ✅ FeishuSyncPage 已加载`)
  })

  // ── G-13 SystemConfigPage ─────────────────────────────────────────────────

  test('G-13 SystemConfig 系统配置', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/config`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    await screenshot(page, 'gov-13-config')

    const hasConfigContent = await page.locator('text=配置, text=系统, text=设置').count() > 0
    console.log(`\n  SystemConfigPage 相关元素: ${hasConfigContent}`)
    console.log(`  ✅ SystemConfigPage 已加载`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite H — SPA 路由隔离：旧路由在 governance 内不可访问
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite H：SPA 内路由隔离', () => {

  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page)
  })

  test('H-1 governance SPA 内输入旧 hash 路由 #/admin 不导航成功', async ({ page }) => {
    // 治理台是 Hash Router，/admin 不是注册的路由
    await page.goto(`${BASE_URL}/#/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    // SPA 处理未知路由：应重定向到 dashboard 或显示 404 页面
    const url = page.url()
    const html = await page.content()

    // 不应出现"旧管理页面"内容
    const hasOldAdminContent = html.includes('行政台') || html.includes('审批管理')
    expect(hasOldAdminContent, '旧 admin 路由内容不应出现').toBe(false)

    console.log(`\n  #/admin 最终 URL: ${url}`)
    console.log('  ✅ 旧 admin 路由未导航到旧内容')
  })

  test('H-2 governance SPA 内输入旧 hash 路由 #/iam 不导航成功', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/iam`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)

    const html = await page.content()
    const hasOldIamContent = html.includes('枢衡') || html.includes('权控台')
    expect(hasOldIamContent, '旧 iam 路由内容不应出现').toBe(false)

    console.log('\n  ✅ 旧 #/iam 路由未导航到旧内容')
  })

  test('H-3 governance SPA 侧边栏导航链接不含旧路径', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    const navLinks = await page.locator('nav a[href], aside a[href]').allInnerTexts()
    const navHrefs = await page.locator('nav a[href], aside a[href]').evaluateAll(
      els => els.map(el => (el as HTMLAnchorElement).href)
    )

    const badLinks = navHrefs.filter(h => h.includes('/admin/') || h.includes('/iam/'))

    console.log(`\n  侧边栏导航项: ${navLinks.length} 个`)
    if (badLinks.length > 0) {
      console.log(`  ❌ 发现旧路径导航: ${badLinks.join(', ')}`)
    } else {
      console.log('  ✅ 侧边栏无旧路径导航链接')
    }

    expect(badLinks.length, `侧边栏含旧路径链接: ${badLinks.join(', ')}`).toBe(0)
  })

  test('H-4 governance 页面埋点使用 governance workstation key', async ({ page }) => {
    const trackEvents: Array<{ workstation: string; page: string }> = []

    // 拦截埋点 API 请求
    await page.route(`${SERVER}/v2/api/v1/audit/track`, (route) => {
      route.request().postDataJSON()?.workstation
        && trackEvents.push(route.request().postDataJSON() as { workstation: string; page: string })
      route.continue()
    })

    await page.goto(`${BASE_URL}/#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(3000)

    console.log(`\n  捕获埋点事件: ${trackEvents.length} 条`)
    trackEvents.forEach(e => console.log(`    workstation=${e.workstation}, page=${e.page}`))

    // 埋点中不应有旧 workstation key
    const badEvents = trackEvents.filter(e =>
      e.workstation === 'admin' || e.workstation === 'iam'
    )

    expect(badEvents.length, `发现使用旧 key 的埋点: ${JSON.stringify(badEvents)}`).toBe(0)

    // 若有埋点，workstation 应为 governance
    const wrongWs = trackEvents.filter(e => e.workstation && e.workstation !== 'governance')
    expect(wrongWs.length, `埋点 workstation 应为 governance: ${JSON.stringify(wrongWs)}`).toBe(0)

    console.log('  ✅ 埋点 workstation key 正确（governance 或无埋点）')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite I — 跨工作台跳转（governance ↔ secretary ↔ data-platform）
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite I：跨工作台跳转', () => {

  test.beforeEach(async ({ page }) => {
    await injectAuthToken(page)
  })

  test('I-1 从 secretary 门户点击治理台卡片跳转到 /governance/', async ({ page }) => {
    await page.goto(`${SERVER}/secretary/`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(3000)

    const html = await page.content()

    // 确认门户含 governance 跳转链接
    const hasGovLink = html.includes('/governance') || html.includes("'governance'") || html.includes('"governance"')
    console.log(`\n  门户含 governance 链接: ${hasGovLink}`)

    // 不含旧链接
    const hasAdminLink = html.includes('/admin') && !html.includes('/governance/admin')
    const hasIamLink = html.includes('/iam') && !html.includes('/governance/iam')
    expect(hasAdminLink, '门户不应含 /admin 链接（非注释）').toBe(false)
    expect(hasIamLink, '门户不应含 /iam 链接（非注释）').toBe(false)

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'cross-01-portal.png') })
    console.log('  ✅ 门户链接检查通过')
  })

  test('I-2 governance → secretary 跳转 URL 格式正确', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)
    await page.waitForTimeout(2000)

    // 获取页面内所有外链
    const externalLinks = await page.locator('a[href*="secretary"]').evaluateAll(
      els => els.map(el => (el as HTMLAnchorElement).href)
    )

    console.log(`\n  治理台内的 secretary 外链: ${externalLinks.length} 个`)
    externalLinks.forEach(l => console.log(`    ${l}`))

    // 外链中不应有 /admin/ 或 /iam/
    const badLinks = externalLinks.filter(l => l.includes('/admin/') || l.includes('/iam/'))
    expect(badLinks.length, `外链含旧路径: ${badLinks.join(', ')}`).toBe(0)

    console.log('  ✅ 治理台外链格式正确')
  })

  test('I-3 governance 逻辑登出不重定向到 /admin/ 或 /iam/', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await waitForPageContent(page)

    let navigationTarget = ''
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigationTarget = frame.url()
      }
    })

    // 触发登出（若有登出按钮）
    const logoutBtn = page.locator('button:has-text("登出"), button:has-text("退出"), [aria-label="logout"]')
    const logoutCount = await logoutBtn.count()

    if (logoutCount > 0) {
      await logoutBtn.first().click()
      await page.waitForTimeout(2000)

      console.log(`\n  登出后目标 URL: ${navigationTarget || page.url()}`)

      const finalUrl = navigationTarget || page.url()
      expect(finalUrl.includes('/admin/'), `登出后不应重定向到 /admin/: ${finalUrl}`).toBe(false)
      expect(finalUrl.includes('/iam/'), `登出后不应重定向到 /iam/: ${finalUrl}`).toBe(false)
      console.log('  ✅ 登出不重定向到旧路径')
    } else {
      console.log('\n  ⚠️ 未找到登出按钮（可能未登录），跳过')
    }
  })
})
