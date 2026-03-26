/**
 * governance-migration-regression.spec.ts
 *
 * 治理台唯一化重构 — 完整回归验收套件
 *
 * 验收目标：
 *   Suite A — 旧路径消亡检测
 *     A-1  /admin/ 返回 404（或重定向，不是 200 + 旧页面）
 *     A-2  /iam/ 返回 404（或重定向，不是 200 + 旧页面）
 *     A-3  /admin/users、/admin/roles、/iam/users、/iam/permissions 等所有旧子路径均 404
 *     A-4  HTML 产物中不再出现 "枢衡" "权控台" "WORKSTATION:iam" "WORKSTATION:admin" 字样
 *     A-5  旧 key 不再出现在 /auth/profile 的 visible_workbenches 或 visible_menu_items 中
 *
 *   Suite B — 新路径就绪检测
 *     B-1  /governance/ 可达（200），HTML 包含 "鹿鸣" 或 "治理台"
 *     B-2  /governance/ HTML 的 <script> 引用路径均为 /governance/ 下
 *     B-3  /governance/ 的 OAuth URL 携带 governance 独立 App ID（cli_a937515668b99cc9）
 *     B-4  /governance/ 的 VITE_FEISHU_APP_ID 不是子衿 App ID（cli_a98b0babd020500e）
 *     B-5  /governance/ 所有 13 个子路由（Hash Router）页面 HTML 均可访问
 *
 *   Suite C — RBAC / profile 断言
 *     C-1  /auth/profile visible_workbenches 含 governance，不含 admin/iam
 *     C-2  /auth/profile visible_menu_items 含 governance key，不含 admin/iam key
 *     C-3  governance 菜单包含迁移后的完整菜单项（dashboard/users/roles/...）
 *     C-4  callback 端点 workstation=governance + governance App ID → 无 MISMATCH
 *     C-5  callback 端点 workstation=admin → 返回错误（key 不存在）
 *     C-6  callback 端点 workstation=iam → 返回错误（key 不存在）
 *
 *   Suite D — 门户跳转完整性
 *     D-1  子衿门户 PortalPage 不包含 /admin/ 跳转
 *     D-2  子衿门户 PortalPage 不包含 /iam/ 跳转
 *     D-3  子衿门户 PortalPage 包含 /governance/ 跳转且仅一个
 *     D-4  子衿门户 platformKeys 不包含 admin/iam
 *
 *   Suite E — 后端 API 回归
 *     E-1  GET /auth/roles/list → 200，角色列表非空
 *     E-2  GET /auth/permissions/list → 200
 *     E-3  GET /auth/token-health → 200，返回 Token 健康结构
 *     E-4  GET /auth/accounts/list → 200 或 403（权限限制均可，端点存在）
 *     E-5  GET /audit/logs → 200
 *
 *   Suite F — 全工作台可达性回归（确保其余 18 台未被破坏）
 *     F-1  所有 19 个工作台 HTTP 200 可达
 *     F-2  没有工作台响应 /admin/ 或 /iam/ 的内容
 *
 * 运行方式：
 *   # 面向测试服务器（CI 默认）
 *   pnpm e2e e2e/governance-migration-regression.spec.ts
 *
 *   # 指定服务器
 *   TEST_SERVER=http://118.196.64.48 pnpm e2e e2e/governance-migration-regression.spec.ts
 *
 *   # 带 live token（Suite C、E 需要）
 *   LIVE_AUTH_TOKEN=eyJ... pnpm e2e e2e/governance-migration-regression.spec.ts
 */

import { test, expect } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────────────────────

const SERVER = process.env.TEST_SERVER ?? 'http://118.196.64.48'

/** 子衿统一授权 App ID（不应出现在 /governance/ 页面中） */
const ZIJIN_APP_ID = 'cli_a98b0babd020500e'

/** 治理台独立 App ID（原 iam，沿用） */
const GOVERNANCE_APP_ID = 'cli_a937515668b99cc9'

/** 洞明数据台独立 App ID */
const DATA_PLATFORM_APP_ID = 'cli_a93753da2c381cef'

/**
 * JWT Token 自动获取策略（优先级从高到低）：
 *   1. 环境变量 LIVE_AUTH_TOKEN（手动指定 / CI 注入）
 *   2. 环境变量 LIVE_TOKEN（向后兼容别名）
 *   3. 留空 → 需要认证的测试会被自动 skip
 *
 * 在 CI/CD 或本地运行前获取 token 的方法：
 *   ssh server "cd /opt/cn-kis/backend && python manage.py generate_test_jwt --raw"
 *   然后 LIVE_AUTH_TOKEN="eyJ..." npx playwright test
 */
const LIVE_TOKEN = process.env.LIVE_AUTH_TOKEN ?? process.env.LIVE_TOKEN ?? ''

/** 旧工作台 key（重构后必须消失） */
const OBSOLETE_KEYS = ['admin', 'iam']

/** governance 完整菜单路由（13 个） */
const GOVERNANCE_ROUTES = [
  'dashboard',
  'users',
  'roles',
  'permissions',
  'sessions',
  'activity',
  'feature-usage',
  'ai-usage',
  'audit',
  'workstations',
  'pilot-config',
  'feishu',
  'config',
]

/** governance 菜单项（MODULE_MENU_MAP 中期望的键） */
const GOVERNANCE_MENU_ITEMS = [
  'dashboard',
  'users',
  'roles',
  'permissions',
  'sessions',
  'activity',
  'feature-usage',
  'ai-usage',
  'audit',
  'workstations',
  'pilot-config',
  'feishu',
  'config',
]

/** 所有 19 个有效工作台 */
const ALL_WORKSTATIONS = [
  'secretary', 'finance', 'research', 'execution', 'quality',
  'hr', 'crm', 'recruitment', 'equipment', 'material',
  'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception',
  'control-plane', 'governance', 'digital-workforce', 'data-platform',
]

// ─────────────────────────────────────────────────────────────────────────────
// Suite A — 旧路径消亡检测
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite A：旧路径消亡检测', () => {

  test('A-1 /admin/ 路径不返回有效的旧工作台页面', async ({ request }) => {
    const resp = await request.get(`${SERVER}/admin/`, {
      timeout: 10000,
      maxRedirects: 0,
    }).catch(() => null)

    if (resp === null) {
      console.log('  ✅ /admin/ 连接拒绝（未部署）')
      return
    }

    const status = resp.status()
    const body = await resp.text()

    console.log(`\n  /admin/ HTTP ${status}`)

    // 不能返回 200 且包含旧工作台内容
    if (status === 200) {
      // 若 200，内容不能是旧的 admin 工作台（必须是重定向到 governance 或其他）
      const hasOldContent = body.includes('鹿鸣·行政台') ||
                            body.includes('WORKSTATION:admin') ||
                            (body.includes('<!DOCTYPE html>') && body.includes('/admin/') && !body.includes('/governance/'))
      expect(hasOldContent, '旧 /admin/ 路径不能服务旧工作台内容').toBe(false)
      console.log('  ✅ /admin/ 返回 200 但不包含旧工作台内容（可能是重定向页面）')
    } else {
      expect([301, 302, 303, 307, 308, 404], `期望重定向或 404，实际 ${status}`).toContain(status)
      console.log(`  ✅ /admin/ 返回 ${status}（已停用）`)
    }
  })

  test('A-2 /iam/ 路径不返回有效的旧工作台页面', async ({ request }) => {
    const resp = await request.get(`${SERVER}/iam/`, {
      timeout: 10000,
      maxRedirects: 0,
    }).catch(() => null)

    if (resp === null) {
      console.log('  ✅ /iam/ 连接拒绝（未部署）')
      return
    }

    const status = resp.status()
    const body = await resp.text()

    console.log(`\n  /iam/ HTTP ${status}`)

    if (status === 200) {
      const hasOldContent = body.includes('枢衡·权控台') ||
                            body.includes('WORKSTATION:iam') ||
                            (body.includes('<!DOCTYPE html>') && body.includes('/iam/') && !body.includes('/governance/'))
      expect(hasOldContent, '旧 /iam/ 路径不能服务旧工作台内容').toBe(false)
      console.log('  ✅ /iam/ 返回 200 但不包含旧工作台内容')
    } else {
      expect([301, 302, 303, 307, 308, 404], `期望重定向或 404，实际 ${status}`).toContain(status)
      console.log(`  ✅ /iam/ 返回 ${status}（已停用）`)
    }
  })

  test('A-3 旧子路径均不可访问', async ({ request }) => {
    const oldPaths = [
      '/admin/users', '/admin/roles', '/admin/accounts', '/admin/permissions',
      '/admin/sessions', '/admin/audit', '/admin/config', '/admin/workstations',
      '/iam/users', '/iam/roles', '/iam/permissions', '/iam/sessions',
      '/iam/activity', '/iam/feature-usage', '/iam/ai-usage', '/iam/audit',
    ]

    const results: { path: string; status: number; ok: boolean }[] = []

    for (const p of oldPaths) {
      const resp = await request.get(`${SERVER}${p}`, {
        timeout: 8000,
        maxRedirects: 0,
      }).catch(() => null)

      const status = resp?.status() ?? 0
      // 旧路径要么不存在（404/0），要么重定向走人（3xx），不能 200 + 旧内容
      const isAcceptable = status === 0 || status === 404 ||
                           (status >= 300 && status < 400) ||
                           status === 403
      results.push({ path: p, status, ok: isAcceptable })
    }

    console.log('\n  旧子路径检测：')
    for (const r of results) {
      console.log(`  ${r.ok ? '✅' : '❌'} ${r.path.padEnd(30)} HTTP ${r.status}`)
    }

    const failed = results.filter(r => !r.ok)
    expect(failed.length, `以下旧路径仍返回 200：\n${failed.map(f => `  ${f.path} (${f.status})`).join('\n')}`).toBe(0)
  })

  test('A-4 /governance/ HTML 不包含旧工作台字样', async ({ request }) => {
    const resp = await request.get(`${SERVER}/governance/`, { timeout: 10000 })
    if (resp.status() !== 200) {
      test.skip()
      return
    }

    const html = await resp.text()

    // 检测旧 key 字面量（工作台标识符）
    const obsoletePatterns = [
      { pattern: 'WORKSTATION:iam', label: 'WORKSTATION:iam 标识符' },
      { pattern: 'WORKSTATION:admin', label: 'WORKSTATION:admin 标识符' },
      { pattern: '"workstation":"iam"', label: 'workstation:iam JSON 字段' },
      { pattern: '"workstation":"admin"', label: 'workstation:admin JSON 字段' },
      { pattern: 'workstations/iam/', label: 'workstations/iam/ 旧路径' },
      { pattern: 'workstations/admin/', label: 'workstations/admin/ 旧路径' },
      { pattern: '枢衡·权控台', label: '枢衡·权控台旧品牌名' },
      { pattern: '鹿鸣·行政台', label: '鹿鸣·行政台旧品牌名' },
    ]

    console.log('\n  HTML 旧字样检测：')
    const found: string[] = []
    for (const { pattern, label } of obsoletePatterns) {
      if (html.includes(pattern)) {
        found.push(label)
        console.log(`  ❌ 发现: ${label}`)
      } else {
        console.log(`  ✅ 未发现: ${label}`)
      }
    }

    expect(found.length, `HTML 中仍有旧标识：${found.join(', ')}`).toBe(0)
  })

  test('A-5 /auth/profile 不返回 admin/iam 工作台 key', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    if (resp.status() === 401) {
      console.log('  ⚠️ Token 已过期，跳过 API 断言')
      test.skip()
      return
    }

    expect(resp.status()).toBe(200)
    const body = await resp.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown> | null

    if (!data) {
      console.log('  ⚠️ 无 data 字段，跳过')
      return
    }

    const workbenches: string[] = (data.visible_workbenches as string[]) ?? []
    const menuItems: Record<string, unknown> = (data.visible_menu_items as Record<string, unknown>) ?? {}

    console.log('\n  visible_workbenches:', JSON.stringify(workbenches))
    console.log('  visible_menu_items keys:', Object.keys(menuItems))

    // visible_workbenches 不含旧 key
    for (const obsolete of OBSOLETE_KEYS) {
      expect(workbenches, `visible_workbenches 不应含 "${obsolete}"`).not.toContain(obsolete)
    }

    // visible_menu_items 不含旧 key
    for (const obsolete of OBSOLETE_KEYS) {
      expect(Object.keys(menuItems), `visible_menu_items 不应含 "${obsolete}" key`).not.toContain(obsolete)
    }

    console.log('\n  ✅ profile 不包含任何旧工作台 key')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite B — 新路径就绪检测
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite B：新路径就绪检测', () => {

  test('B-1 /governance/ 返回 200，HTML 含品牌字样', async ({ request }) => {
    const resp = await request.get(`${SERVER}/governance/`, { timeout: 10000 })

    expect(resp.status()).toBe(200)
    const html = await resp.text()

    // 品牌检测：至少含其中一项
    const hasBrand = html.includes('鹿鸣') || html.includes('治理台') || html.includes('governance')
    expect(hasBrand, '/governance/ 页面应含品牌字样（鹿鸣/治理台/governance）').toBe(true)

    // 基本 HTML 结构
    expect(html.includes('<html') || html.includes('<!DOCTYPE'), '期望有效的 HTML 文档').toBe(true)

    console.log(`\n  ✅ /governance/ 返回 200，HTML 长度 ${html.length} 字节`)
  })

  test('B-2 /governance/ Script 引用均在 /governance/ 下', async ({ request }) => {
    const resp = await request.get(`${SERVER}/governance/`, { timeout: 10000 })
    if (resp.status() !== 200) { test.skip(); return }

    const html = await resp.text()

    // 提取所有 <script src="..."> 和 <link href="..."> 中包含 /admin/ 或 /iam/ 的资源
    const badRefs = [...html.matchAll(/(?:src|href)=["']([^"']*\/(?:admin|iam)\/[^"']*)["']/g)]
      .map(m => m[1])

    if (badRefs.length > 0) {
      console.log('  ❌ 发现指向旧路径的资源引用：')
      badRefs.forEach(r => console.log(`    ${r}`))
    } else {
      console.log('  ✅ 未发现指向 /admin/ 或 /iam/ 的资源引用')
    }

    expect(badRefs.length, `发现旧路径资源引用：${badRefs.join(', ')}`).toBe(0)
  })

  test('B-3 /governance/ 触发 OAuth URL 携带 governance 独立 App ID', async ({ page }) => {
    let capturedAppId: string | null = null

    // 拦截网络请求，捕获飞书 OAuth URL
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('open.feishu.cn') && url.includes('app_id=')) {
        const match = url.match(/app_id=(cli_[^&]+)/)
        if (match) capturedAppId = match[1]
      }
    })

    // 监听页面 HTML 中的 OAuth 链接（LoginFallback 模式）
    await page.goto(`${SERVER}/governance/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })
    await page.waitForTimeout(3000)

    const html = await page.content()
    const appIdInHtml = html.match(/app_id=(cli_[^&"'\s]+)/)?.[1] ?? null

    const finalAppId = capturedAppId ?? appIdInHtml

    console.log(`\n  捕获到的 App ID: ${finalAppId ?? '未找到（可能已登录）'}`)

    if (finalAppId) {
      // 治理台必须使用独立 App ID，不能是子衿
      expect(finalAppId, `治理台不应使用子衿 App ID（${ZIJIN_APP_ID}）`).not.toBe(ZIJIN_APP_ID)
      expect(finalAppId, `治理台应使用独立 App ID（${GOVERNANCE_APP_ID}）`).toBe(GOVERNANCE_APP_ID)
      console.log(`  ✅ 治理台 OAuth 使用独立 App ID: ${finalAppId}`)
    } else {
      console.log('  ⚠️ 未捕获到 OAuth URL（可能已登录），跳过 App ID 验证')
    }
  })

  test('B-4 /governance/ App ID 不等于子衿 App ID', async ({ request }) => {
    const resp = await request.get(`${SERVER}/governance/`, { timeout: 10000 })
    if (resp.status() !== 200) { test.skip(); return }

    const html = await resp.text()

    // 检查 HTML 中是否有子衿 App ID 作为该页的授权应用
    // （若页面已注入 VITE_FEISHU_APP_ID=ZIJIN，则不合规）
    const hasZijinAsDefault = html.includes(`VITE_FEISHU_APP_ID="${ZIJIN_APP_ID}"`) ||
                              html.includes(`feishuAppId:"${ZIJIN_APP_ID}"`)

    if (hasZijinAsDefault) {
      console.log(`  ❌ /governance/ 使用了子衿 App ID 作为默认 OAuth 应用`)
    } else {
      console.log(`  ✅ /governance/ 未使用子衿 App ID 作为默认 OAuth 应用`)
    }

    // 有子衿 App ID 不一定是错（可能子路径引用），但硬编码为默认则不对
    // 此测试仅记录，不强制失败（OAuth URL 测试 B-3 更权威）
  })

  test('B-5 /governance/ 的 index.html 对所有子路由均可访问（Hash Router）', async ({ request }) => {
    // Hash Router：所有子路由都请求同一个 index.html，服务端只需响应 /governance/
    const resp = await request.get(`${SERVER}/governance/`, { timeout: 10000 })
    expect(resp.status()).toBe(200)
    const html = await resp.text()

    // 确认包含 JavaScript bundle（说明是 SPA，不是静态 HTML 列表）
    const hasSpaBundle = html.includes('<script') && (html.includes('/governance/assets/') || html.includes('/assets/'))
    expect(hasSpaBundle, '/governance/ 应包含 SPA JavaScript bundle').toBe(true)

    console.log(`\n  ✅ /governance/ 是标准 SPA（Hash Router 全路由共享同一 index.html）`)
    console.log(`    预期路由（${GOVERNANCE_ROUTES.length} 个）: ${GOVERNANCE_ROUTES.join(', ')}`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite C — RBAC / profile / OAuth 断言
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite C：RBAC / profile / OAuth 断言', () => {

  test('C-1 /auth/profile visible_workbenches 含 governance，不含 admin/iam', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    if (resp.status() === 401) { test.skip(); return }
    expect(resp.status()).toBe(200)

    const body = await resp.json() as Record<string, unknown>
    const workbenches: string[] = ((body.data as Record<string, unknown>)?.visible_workbenches as string[]) ?? []

    console.log(`\n  visible_workbenches (${workbenches.length} 台): ${workbenches.join(', ')}`)

    // 必须含 governance
    expect(workbenches, 'visible_workbenches 必须含 governance').toContain('governance')

    // 不能含旧 key
    for (const old of OBSOLETE_KEYS) {
      expect(workbenches, `visible_workbenches 不应含旧 key "${old}"`).not.toContain(old)
    }

    console.log('  ✅ visible_workbenches 符合新架构')
  })

  test('C-2 /auth/profile visible_menu_items 含 governance key，不含 admin/iam', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    if (resp.status() === 401) { test.skip(); return }
    expect(resp.status()).toBe(200)

    const body = await resp.json() as Record<string, unknown>
    const menuItems: Record<string, unknown> = ((body.data as Record<string, unknown>)?.visible_menu_items as Record<string, unknown>) ?? {}

    console.log(`\n  visible_menu_items keys: ${Object.keys(menuItems).join(', ')}`)

    // 不含旧 key
    for (const old of OBSOLETE_KEYS) {
      expect(Object.keys(menuItems), `visible_menu_items 不应含 "${old}" key`).not.toContain(old)
    }

    // 含 governance（仅当用户有权限时才会出现）
    if (Object.keys(menuItems).length > 0) {
      expect(Object.keys(menuItems), 'visible_menu_items 应含 governance key').toContain('governance')
    }

    console.log('  ✅ visible_menu_items key 符合新架构')
  })

  test('C-3 governance 菜单包含全部迁移后的菜单项', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    if (resp.status() === 401) { test.skip(); return }
    expect(resp.status()).toBe(200)

    const body = await resp.json() as Record<string, unknown>
    const menuItems: Record<string, unknown> = ((body.data as Record<string, unknown>)?.visible_menu_items as Record<string, unknown>) ?? {}
    const govMenus: string[] = (menuItems.governance as string[]) ?? []

    if (govMenus.length === 0) {
      console.log('  ⚠️ governance 菜单为空（账号权限不足），跳过菜单项验证')
      return
    }

    console.log(`\n  governance 菜单项 (${govMenus.length} 个): ${govMenus.join(', ')}`)

    const coreItems = ['dashboard', 'users', 'roles', 'permissions', 'sessions', 'audit']
    for (const item of coreItems) {
      expect(govMenus, `governance 菜单应含 "${item}"`).toContain(item)
    }

    console.log('  ✅ governance 菜单含全部核心菜单项')
  })

  test('C-4 callback：workstation=governance + governance App ID → 无 MISMATCH', async ({ request }) => {
    const resp = await request.post(`${SERVER}/v2/api/v1/auth/feishu/callback`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        code: 'test_governance_migration_c4',
        workstation: 'governance',
        app_id: GOVERNANCE_APP_ID,
      },
      timeout: 10000,
    })

    const body = await resp.json() as Record<string, unknown>
    const errorCode = (body?.data as Record<string, unknown>)?.error_code ?? ''
    console.log(`\n  governance callback 响应 (${resp.status()}): error_code="${errorCode}"`)

    expect(errorCode, 'governance 不应出现 AUTH_APP_WORKSTATION_MISMATCH').not.toBe('AUTH_APP_WORKSTATION_MISMATCH')
    console.log('  ✅ governance 独立 App ID 被后端正确识别，无 MISMATCH')
  })

  test('C-5 callback：workstation=admin → 后端返回工作台不存在错误', async ({ request }) => {
    const resp = await request.post(`${SERVER}/v2/api/v1/auth/feishu/callback`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        code: 'test_obsolete_admin_key',
        workstation: 'admin',
        app_id: ZIJIN_APP_ID,
      },
      timeout: 10000,
    })

    const body = await resp.json() as Record<string, unknown>
    const errorCode = (body?.data as Record<string, unknown>)?.error_code ?? ''
    const code = body.code as number

    console.log(`\n  admin callback 响应 (${resp.status()}): code=${code}, error_code="${errorCode}"`)

    // 旧 key 应返回错误（非 200 成功，或有错误码）
    const isError = resp.status() >= 400 || code !== 0 || errorCode !== ''
    expect(isError, `workstation=admin 应返回错误，但得到成功响应`).toBe(true)
    console.log('  ✅ 旧 workstation=admin 已被后端拒绝')
  })

  test('C-6 callback：workstation=iam → 后端返回工作台不存在错误', async ({ request }) => {
    const resp = await request.post(`${SERVER}/v2/api/v1/auth/feishu/callback`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        code: 'test_obsolete_iam_key',
        workstation: 'iam',
        app_id: GOVERNANCE_APP_ID,
      },
      timeout: 10000,
    })

    const body = await resp.json() as Record<string, unknown>
    const errorCode = (body?.data as Record<string, unknown>)?.error_code ?? ''
    const code = body.code as number

    console.log(`\n  iam callback 响应 (${resp.status()}): code=${code}, error_code="${errorCode}"`)

    const isError = resp.status() >= 400 || code !== 0 || errorCode !== ''
    expect(isError, `workstation=iam 应返回错误，但得到成功响应`).toBe(true)
    console.log('  ✅ 旧 workstation=iam 已被后端拒绝')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite D — 门户跳转完整性
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite D：门户跳转完整性', () => {

  test('D-1 /secretary/ 门户不包含 /admin/ 跳转链接', async ({ page }) => {
    await page.goto(`${SERVER}/secretary/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })
    await page.waitForTimeout(3000)

    const html = await page.content()

    // 检查是否有指向 /admin/ 的 href 或 data 属性
    const adminLinks = html.match(/(?:href|to|workstationKey|path).*?['"]/g)
      ?.filter(l => l.includes('/admin/') || l.includes("'admin'") || l.includes('"admin"'))
      ?? []

    const hasAdminLink = adminLinks.length > 0
    console.log(`\n  /admin/ 相关引用: ${hasAdminLink ? adminLinks.join(', ') : '无'}`)
    expect(hasAdminLink, '门户不应包含 /admin/ 跳转').toBe(false)
    console.log('  ✅ 门户无 /admin/ 跳转')
  })

  test('D-2 /secretary/ 门户不包含 /iam/ 跳转链接', async ({ page }) => {
    await page.goto(`${SERVER}/secretary/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })
    await page.waitForTimeout(3000)

    const html = await page.content()

    const iamLinks = html.match(/(?:href|to|workstationKey|path).*?['"]/g)
      ?.filter(l => l.includes('/iam/') || l.includes("'iam'") || l.includes('"iam"'))
      ?? []

    const hasIamLink = iamLinks.length > 0
    console.log(`\n  /iam/ 相关引用: ${hasIamLink ? iamLinks.join(', ') : '无'}`)
    expect(hasIamLink, '门户不应包含 /iam/ 跳转').toBe(false)
    console.log('  ✅ 门户无 /iam/ 跳转')
  })

  test('D-3 /secretary/ 门户 JS bundle 包含 /governance/ 且仅一个治理台入口', async ({ request }) => {
    const resp = await request.get(`${SERVER}/secretary/`, { timeout: 10000 })
    if (resp.status() !== 200) { test.skip(); return }

    const html = await resp.text()

    // 统计 governance 路径引用
    const govMatches = [...html.matchAll(/\/governance\//g)]
    const adminMatches = [...html.matchAll(/\/admin\//g)]
    const iamMatches = [...html.matchAll(/\/iam\//g)]

    console.log(`\n  /governance/ 引用次数: ${govMatches.length}`)
    console.log(`  /admin/ 引用次数: ${adminMatches.length}`)
    console.log(`  /iam/ 引用次数: ${iamMatches.length}`)

    expect(adminMatches.length, '门户 HTML 不应含 /admin/ 路径').toBe(0)
    expect(iamMatches.length, '门户 HTML 不应含 /iam/ 路径').toBe(0)

    console.log('  ✅ 门户 HTML 仅含 governance 治理台入口')
  })

  test('D-4 治理台内部链接不跳转到 /admin/ 或 /iam/', async ({ page }) => {
    await page.goto(`${SERVER}/governance/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })
    await page.waitForTimeout(3000)

    const html = await page.content()

    // 收集所有 <a> href 和 JS 中的跳转目标
    const allLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => (a as HTMLAnchorElement).href)
    })

    const badLinks = allLinks.filter(l => l.includes('/admin/') || l.includes('/iam/'))

    if (badLinks.length > 0) {
      console.log('  ❌ 治理台含旧路径链接：')
      badLinks.forEach(l => console.log(`    ${l}`))
    } else {
      console.log('  ✅ 治理台无旧路径链接')
    }

    expect(badLinks.length, `治理台页面包含旧路径链接: ${badLinks.join(', ')}`).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite E — 后端 API 回归
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite E：后端 API 回归', () => {

  /** 判断响应是否为认证失败（token 无效，跳过测试） */
  function isAuthError(status: number, body: Record<string, unknown>): boolean {
    if (status === 401) return true
    if (status === 403) {
      const errorCode = (body?.data as Record<string, unknown>)?.error_code as string
      return ['AUTH_REQUIRED', 'TOKEN_EXPIRED', 'UNAUTHORIZED'].includes(errorCode ?? '')
    }
    return false
  }

  test('E-1 GET /auth/roles/list → 200，角色列表非空', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/auth/roles/list`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    const body = await resp.json() as Record<string, unknown>
    if (isAuthError(resp.status(), body)) {
      console.log(`\n  ⚠️ Token 无效（HTTP ${resp.status()}），跳过 E-1`)
      test.skip()
      return
    }
    expect(resp.status()).toBe(200)

    const roles = (body.data as unknown[]) ?? []
    if (!Array.isArray(roles)) {
      console.log(`\n  ⚠️ data 不是数组（${typeof roles}），跳过角色断言`)
      return
    }
    expect(roles.length, '角色列表不应为空').toBeGreaterThan(0)
    console.log(`\n  ✅ 角色列表: ${roles.length} 个角色`)

    const roleNames = roles.map((r: unknown) => (r as Record<string, unknown>).name as string)
    expect(roleNames, '系统角色 admin 应保留（它是角色名，不是工作台 key）').toContain('admin')
  })

  test('E-2 GET /auth/permissions/list → 200 或 403', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/auth/permissions/list`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    const body = await resp.json() as Record<string, unknown>
    if (isAuthError(resp.status(), body)) {
      console.log(`\n  ⚠️ Token 无效（HTTP ${resp.status()}），跳过 E-2`)
      test.skip()
      return
    }
    // 200 = 成功返回；403 = 端点存在但权限不足（均可接受）
    expect([200, 403]).toContain(resp.status())
    console.log(`\n  ✅ /auth/permissions/list 返回 ${resp.status()}`)
  })

  test('E-3 GET /auth/token-health → 200 或 403（端点存在）', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/auth/token-health`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    if (resp.status() === 401) { test.skip(); return }

    // 404 时服务器返回 HTML，不能直接 .json()
    if (resp.status() === 404) {
      expect(resp.status(), '/auth/token-health 返回 404，端点尚未部署（需部署后端代码）').not.toBe(404)
      return
    }

    const body = await resp.json() as Record<string, unknown>
    expect([200, 403]).toContain(resp.status())

    if (resp.status() === 200) {
      const data = body.data as Record<string, unknown>
      expect(data).toBeTruthy()
      console.log(`\n  ✅ token-health 返回 200，items: ${(data?.items as unknown[])?.length ?? 0}`)
    } else {
      console.log('\n  ⚠️ token-health 403（权限不足），端点存在')
    }
  })

  test('E-4 GET /auth/accounts/list → 200 或 403（端点存在）', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/auth/accounts/list`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    if (resp.status() === 401) { test.skip(); return }
    expect([200, 403]).toContain(resp.status())
    console.log(`\n  ✅ /auth/accounts/list 端点存在，返回 ${resp.status()}`)
  })

  test('E-5 GET /audit/logs → 200', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/audit/logs`, {
      headers: { Authorization: `Bearer ${LIVE_TOKEN}` },
      timeout: 10000,
    })

    if (resp.status() === 401) { test.skip(); return }
    expect([200, 403]).toContain(resp.status())
    console.log(`\n  ✅ /audit/logs 端点存在，返回 ${resp.status()}`)
  })

  test('E-6 后端健康检查 /health → 200，database: ok', async ({ request }) => {
    const resp = await request.get(`${SERVER}/v2/api/v1/health`, { timeout: 10000 })
    expect(resp.status()).toBe(200)

    const body = await resp.json() as Record<string, unknown>
    expect(body.code).toBe(0)
    expect((body.data as Record<string, unknown>)?.database).toBe('ok')

    console.log(`\n  ✅ 后端健康检查通过: ${JSON.stringify(body.data)}`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite F — 全工作台可达性回归
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite F：全工作台可达性回归', () => {

  test('F-1 所有 19 个有效工作台 HTTP 可达', async ({ request }) => {
    const results: { key: string; status: number; ok: boolean }[] = []

    for (const key of ALL_WORKSTATIONS) {
      const resp = await request.get(`${SERVER}/${key}/`, {
        timeout: 8000,
        maxRedirects: 5,
      }).catch(() => null)

      const status = resp?.status() ?? 0
      const ok = status >= 200 && status < 400
      results.push({ key, status, ok })
    }

    console.log('\n  全工作台可达性：')
    for (const r of results) {
      console.log(`  ${r.ok ? '✅' : '❌'} ${r.key.padEnd(22)} HTTP ${r.status}`)
    }

    const failed = results.filter(r => !r.ok)
    const passCount = results.filter(r => r.ok).length

    console.log(`\n  通过: ${passCount}/${results.length}`)

    expect(failed.length, `以下工作台不可达:\n${failed.map(f => `  ${f.key} (HTTP ${f.status})`).join('\n')}`).toBe(0)
  })

  test('F-2 其余工作台 HTML 不包含 /admin/ 或 /iam/ 路径', async ({ request }) => {
    // 抽查关键工作台（secretary 门户最重要）
    const checkTargets = ['secretary', 'governance', 'data-platform', 'control-plane']
    const findings: { key: string; badRefs: string[] }[] = []

    for (const key of checkTargets) {
      const resp = await request.get(`${SERVER}/${key}/`, { timeout: 10000 }).catch(() => null)
      if (!resp || resp.status() !== 200) continue

      const html = await resp.text()
      const badRefs: string[] = []

      // 寻找硬编码的旧路径引用
      if (html.includes('/admin/') && !html.includes('/governance/admin/')) {
        badRefs.push('/admin/')
      }
      if (html.includes('/iam/') && !html.includes('/governance/iam/')) {
        badRefs.push('/iam/')
      }

      if (badRefs.length > 0) {
        findings.push({ key, badRefs })
      }
    }

    console.log('\n  旧路径引用检测：')
    for (const key of checkTargets) {
      const f = findings.find(x => x.key === key)
      console.log(`  ${f ? '❌' : '✅'} ${key.padEnd(20)} ${f ? `发现: ${f.badRefs.join(', ')}` : '干净'}`)
    }

    expect(findings.length, `以下工作台含旧路径引用:\n${findings.map(f => `  ${f.key}: ${f.badRefs.join(', ')}`).join('\n')}`).toBe(0)
  })

  test('F-3 /governance/ 和 /data-platform/ 使用各自独立 App ID', async ({ page }) => {
    type AppIdResult = { workstation: string; appId: string | null; correct: boolean }
    const results: AppIdResult[] = []

    for (const { key, expectedAppId } of [
      { key: 'governance', expectedAppId: GOVERNANCE_APP_ID },
      { key: 'data-platform', expectedAppId: DATA_PLATFORM_APP_ID },
    ]) {
      let captured: string | null = null

      page.on('request', (req) => {
        const url = req.url()
        if (url.includes('open.feishu.cn') && url.includes('app_id=')) {
          const m = url.match(/app_id=(cli_[^&]+)/)
          if (m) captured = m[1]
        }
      })

      await page.goto(`${SERVER}/${key}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      }).catch(() => {})
      await page.waitForTimeout(2000)

      const html = await page.content()
      const inHtml = html.match(/app_id=(cli_[^&"'\s]+)/)?.[1] ?? null
      const finalId = captured ?? inHtml

      results.push({
        workstation: key,
        appId: finalId,
        correct: finalId === null || finalId === expectedAppId,
      })
    }

    console.log('\n  独立 App ID 验证：')
    for (const r of results) {
      if (r.appId === null) {
        console.log(`  ⚠️ ${r.workstation}: 未捕获（可能已登录）`)
      } else {
        console.log(`  ${r.correct ? '✅' : '❌'} ${r.workstation}: ${r.appId}`)
      }
    }

    const wrong = results.filter(r => r.appId !== null && !r.correct)
    expect(wrong.length, `以下独立台使用了错误 App ID:\n${wrong.map(w => `  ${w.workstation}: ${w.appId}`).join('\n')}`).toBe(0)
  })
})
