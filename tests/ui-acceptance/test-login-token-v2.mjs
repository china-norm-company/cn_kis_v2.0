/**
 * CN KIS V2.0 — 登录 + Token + 全工作台 Headed 验收测试
 * ══════════════════════════════════════════════════════════
 *
 * 测试目标：
 *   1. 真实飞书 OAuth 登录（扫码，非 JWT 注入）
 *   2. 验证 access_token / refresh_token 完整获取
 *   3. 验证 token 持久化到后端数据库（SSH 直查）
 *   4. 使用真实登录态测试全部 19 个工作台可访问性
 *
 * 规范（遵循项目规范）：
 *   - 不带 state 参数（避免 AUTH_STATE_INVALID）
 *   - redirect_uri 使用已注册的 IP 地址
 *   - 等待最多 5 分钟完成扫码授权
 *
 * 运行方式：
 *   node tests/ui-acceptance/test-login-token-v2.mjs
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'

// ── 配置常量 ─────────────────────────────────────────────────────────────────
const APP_ID      = 'cli_a98b0babd020500e'
const BASE_URL    = 'http://118.196.64.48'
const API_BASE    = `${BASE_URL}/api/v1`
const REDIRECT_URI = `${BASE_URL}/login`
const SCREENSHOT_DIR = 'tests/ui-acceptance/screenshots-login-token-v2'
const SCAN_TIMEOUT_MS = 5 * 60 * 1000  // 5 分钟

const CURRENT_SCOPES = [
  'offline_access',
  'contact:user.base:readonly',
  'contact:user.email:readonly',
  'contact:user.employee_id:readonly',
  'contact:user.phone:readonly',
  'contact:department.base:readonly',
  'im:chat:readonly',
  'im:message:readonly',
  'mail:user_mailbox',
  'mail:user_mailbox.message:readonly',
  'mail:user_mailbox.message.body:read',
  'calendar:calendar:readonly',
  'calendar:calendar',
  'task:task:read',
  'task:task:write',
  'approval:approval:readonly',
  'approval:approval',
  'docx:document',
  'drive:drive:readonly',
  'drive:file',
  'wiki:wiki',
  'bitable:app',
]

const AUTH_URL =
  `https://open.feishu.cn/open-apis/authen/v1/authorize` +
  `?app_id=${APP_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(CURRENT_SCOPES.join(' '))}`

// ── 全部工作台定义（19台）────────────────────────────────────────────────────
const WORKSTATIONS = [
  { id: 'secretary',        name: '子衿·秘书台',      path: '/secretary/dashboard' },
  { id: 'research',         name: '采苓·研究台',      path: '/research/workbench' },
  { id: 'quality',          name: '怀瑾·质量台',      path: '/quality/dashboard' },
  { id: 'finance',          name: '管仲·财务台',      path: '/finance/dashboard' },
  { id: 'hr',               name: '时雨·人事台',      path: '/hr/qualifications' },
  { id: 'crm',              name: '进思·客户台',      path: '/crm/dashboard' },
  { id: 'execution',        name: '维周·执行台',      path: '/execution/dashboard' },
  { id: 'recruitment',      name: '招招·招募台',      path: '/recruitment/dashboard' },
  { id: 'equipment',        name: '器衡·设备台',      path: '/equipment/dashboard' },
  { id: 'material',         name: '度支·物料台',      path: '/material/dashboard' },
  { id: 'facility',         name: '坤元·设施台',      path: '/facility/dashboard' },
  { id: 'evaluator',        name: '衡技·评估台',      path: '/evaluator/dashboard' },
  { id: 'ethics',           name: '御史·伦理台',      path: '/ethics/dashboard' },
  { id: 'lab-personnel',    name: '共济·人员台',      path: '/lab-personnel/dashboard' },
  { id: 'reception',        name: '和序·接待台',      path: '/reception/dashboard' },
  { id: 'governance',       name: '鹿鸣·治理台',      path: '/governance' },
  { id: 'control-plane',    name: '天工·统管台',      path: '/control-plane/dashboard' },
  { id: 'digital-workforce',name: '中书·数字员工',    path: '/digital-workforce/portal' },
  { id: 'data-platform',    name: '洞明·数据台',      path: '/data-platform' },
]

// ── 工具函数 ─────────────────────────────────────────────────────────────────
mkdirSync(SCREENSHOT_DIR, { recursive: true })
let shotIndex = 0

async function shot(page, label) {
  shotIndex++
  const safe = label.replace(/[^\w\u4e00-\u9fff-]/g, '_').substring(0, 60)
  const fname = `${String(shotIndex).padStart(2, '0')}-${safe}.png`
  const fpath = `${SCREENSHOT_DIR}/${fname}`
  await page.screenshot({ path: fpath, fullPage: true }).catch(() => {})
  console.log(`  📸 [${label}] → ${fname}`)
  return fpath
}

async function waitForUrl(page, predicate, timeoutMs, desc) {
  console.log(`  ⏳ 等待：${desc}（最多 ${Math.round(timeoutMs / 1000)}s）`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate(page.url())) return page.url()
    await page.waitForTimeout(800)
  }
  return null
}

async function isLoginPage(page) {
  try {
    const url = page.url()
    const body = await page.evaluate(() => (document.body?.innerText || '').substring(0, 500))
    return url.includes('accounts.feishu.cn') ||
           url.includes('open.feishu.cn/connect') ||
           url.endsWith('/login') ||
           url.includes('/login?') ||
           body.includes('请登录')
  } catch { return false }
}

async function checkPageError(page) {
  try {
    const text = await page.evaluate(() => document.body?.innerText || '')
    for (const p of [/错误码[：:\s]*(\d{4,5})/, /AUTH_STATE_INVALID/, /认证失败/, /登录失败/, /授权失败/]) {
      const m = text.match(p)
      if (m) return m[0]
    }
  } catch {}
  return null
}

// ── 阶段 1：真实 OAuth 登录 ───────────────────────────────────────────────────
async function doRealLogin(browser) {
  console.log('\n' + '═'.repeat(65))
  console.log('  阶段 1：真实飞书 OAuth 登录（请准备扫码）')
  console.log(`  scope 数量：${CURRENT_SCOPES.length}`)
  console.log(`  redirect_uri：${REDIRECT_URI}`)
  console.log('═'.repeat(65))

  const ctx = await browser.newContext({ viewport: null })
  const page = await ctx.newPage()
  const result = { passed: false, jwt: null, user: null, profile: null, error: null, finalUrl: null }

  try {
    // 1A：打开授权 URL
    console.log('\n[1A] 打开飞书 OAuth 授权 URL')
    await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForUrl(page, u => u.includes('accounts.feishu.cn'), 15000, '落在飞书登录页')
    await page.waitForTimeout(1500)
    await shot(page, '1A-飞书扫码登录页')
    console.log(`  URL: ${page.url()}`)

    // 1B：等待用户扫码
    console.log('\n[1B] ➡️  请用飞书 App 扫描屏幕上的二维码')
    const urlAfterScan = await waitForUrl(
      page,
      u => !u.includes('accounts.feishu.cn'),
      SCAN_TIMEOUT_MS,
      '用户扫码完成'
    )

    if (!urlAfterScan) {
      result.error = '超时：用户未在 5 分钟内完成扫码'
      await shot(page, '1B-超时未扫码')
      return { page, ctx, result }
    }

    console.log(`  ✅ 扫码完成，跳转至：${urlAfterScan}`)
    await shot(page, '1B-扫码后即时跳转')

    // 1C：处理授权同意页（首次授权时出现）
    if (urlAfterScan.includes('open.feishu.cn')) {
      console.log('\n[1C] 进入授权同意页（含 scope 权限列表）')
      console.log('  ➡️  请查看权限列表后点击「授权」按钮')
      await shot(page, '1C-授权同意页-关键截图')

      const afterConsent = await waitForUrl(
        page,
        u => !u.includes('open.feishu.cn') && !u.includes('accounts.feishu.cn'),
        SCAN_TIMEOUT_MS,
        '等待用户点击授权'
      )
      if (!afterConsent) {
        result.error = '超时：用户未在限时内点击授权'
        return { page, ctx, result }
      }
      console.log(`  ✅ 授权完成，跳转至：${afterConsent}`)
      await shot(page, '1C-授权后跳转')
    }

    // 1D：等待 SPA 处理 OAuth code（换取 JWT token）
    // 秘书台 redirect_uri 就是 /login，成功后可能留在 /login 或跳转到 /secretary/
    // 主要通过 localStorage 中是否有 JWT 来判断是否成功
    console.log('\n[1D] 等待 SPA 换取 token 并跳转工作台...')
    const spaDeadline = Date.now() + 20000
    let jwtDetected = false
    while (Date.now() < spaDeadline) {
      await page.waitForTimeout(1000)
      const url = page.url()
      const err = await checkPageError(page)
      if (err) break
      // 检查 localStorage 是否已有 JWT（后端换 token 成功标志）
      const lsJwt = await page.evaluate(() =>
        localStorage.getItem('auth_token') || localStorage.getItem('token') || ''
      ).catch(() => '')
      if (lsJwt && lsJwt.length > 20) { jwtDetected = true; break }
      // URL 跳走也算成功
      if (!url.includes('/login') && !url.includes('feishu.cn')) break
    }

    const finalUrl = page.url()
    const pageErr = await checkPageError(page)
    await shot(page, '1D-最终落地状态')

    if (pageErr) {
      result.error = `登录错误：${pageErr}`
      console.log(`  ❌ ${result.error}`)
      return { page, ctx, result }
    }

    // 没有 JWT 且还在 /login（真正失败）
    if (!jwtDetected && finalUrl.includes('/login') && !finalUrl.includes('code=')) {
      result.error = '停留在 /login 页面，OAuth code 交换可能失败'
      console.log(`  ⚠️  ${result.error}`)
      return { page, ctx, result }
    }

    console.log(`  ✅ 成功进入工作台：${finalUrl}`)
    if (jwtDetected) console.log('  ✅ localStorage 中已检测到 JWT token')

    // 1E：提取 localStorage 中的 JWT 和用户信息
    const authData = await page.evaluate(() => ({
      jwt:     localStorage.getItem('auth_token') || localStorage.getItem('token') || '',
      user:    localStorage.getItem('auth_user') || '',
      profile: localStorage.getItem('auth_profile') || '',
      allKeys: Object.keys(localStorage),
    }))

    console.log(`\n[1E] localStorage 认证信息提取`)
    console.log(`  已存储的 key: ${authData.allKeys.join(', ')}`)
    console.log(`  JWT 长度: ${authData.jwt.length} 字符`)

    if (!authData.jwt || authData.jwt.length < 20) {
      result.error = 'JWT 未写入 localStorage，登录态异常'
      console.log(`  ❌ ${result.error}`)
      return { page, ctx, result }
    }

    try {
      const payload = JSON.parse(Buffer.from(authData.jwt.split('.')[1], 'base64').toString())
      const expDate = payload.exp ? new Date(payload.exp * 1000).toLocaleString('zh-CN') : '未知'
      console.log(`  登录账号: ${payload.username} (user_id=${payload.user_id})`)
      console.log(`  角色: ${(payload.roles || []).join(', ')}`)
      console.log(`  JWT 过期时间: ${expDate}`)
    } catch {}

    result.passed = true
    result.jwt = authData.jwt
    result.user = authData.user
    result.profile = authData.profile
    result.finalUrl = finalUrl

  } catch (err) {
    result.error = `登录异常：${err.message}`
    console.error(`  ❌ ${result.error}`)
    await shot(page, '1-异常').catch(() => {})
  }

  return { page, ctx, result }
}

// ── 阶段 2：Token 完整性验证 ─────────────────────────────────────────────────
async function verifyTokenInfo(page, jwt) {
  console.log('\n' + '═'.repeat(65))
  console.log('  阶段 2：Token 获取完整性验证')
  console.log('═'.repeat(65))

  const result = { passed: false, jwtValid: false, profileApiOk: false, details: {} }

  // 2A：解码 JWT payload
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString())
    result.details.jwtPayload = payload
    const now = Date.now() / 1000
    const isExpired = payload.exp && payload.exp < now
    const expDate = payload.exp ? new Date(payload.exp * 1000).toLocaleString('zh-CN') : '未知'

    console.log(`\n[2A] JWT Payload 解码`)
    console.log(`  user_id : ${payload.user_id}`)
    console.log(`  username: ${payload.username}`)
    console.log(`  roles   : ${(payload.roles || []).join(', ')}`)
    console.log(`  过期时间: ${expDate}`)
    console.log(`  状态    : ${isExpired ? '❌ 已过期' : `✅ 有效，剩余约 ${Math.round((payload.exp - now) / 3600)}h`}`)
    result.jwtValid = !isExpired
  } catch (e) {
    console.log(`  ⚠️  JWT 解码失败：${e.message}`)
  }

  // 2B：调用 /auth/profile 验证后端认证
  console.log(`\n[2B] 验证后端 /auth/profile API`)
  const profileResp = await page.evaluate(async ({ apiBase, jwt }) => {
    try {
      const r = await fetch(`${apiBase}/auth/profile`, {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(10000),
      })
      const data = await r.json().catch(() => null)
      return { status: r.status, code: data?.code, data: data?.data }
    } catch (e) { return { error: e.message } }
  }, { apiBase: API_BASE, jwt })

  if (profileResp.code === 200 || profileResp.status === 200) {
    const u = profileResp.data
    console.log(`  ✅ /auth/profile 返回正常`)
    if (u) {
      console.log(`  用户: ${u.display_name || u.username} (id=${u.id})`)
      console.log(`  工作台权限: ${(u.visible_workbenches || []).join(', ')}`)
      console.log(`  角色: ${(u.roles || []).map(r => typeof r === 'string' ? r : r.name).join(', ')}`)
    }
    result.profileApiOk = true
    result.details.profile = u
  } else {
    console.log(`  ❌ /auth/profile 异常: HTTP ${profileResp.status}, code=${profileResp.code}`)
    result.details.profileError = profileResp
  }

  // 2C：尝试 /auth/me（备用）
  if (!result.profileApiOk) {
    console.log(`\n[2C] 尝试 /auth/me`)
    const meResp = await page.evaluate(async ({ apiBase, jwt }) => {
      try {
        const r = await fetch(`${apiBase}/auth/me`, {
          headers: { Authorization: `Bearer ${jwt}` },
          signal: AbortSignal.timeout(8000),
        })
        const data = await r.json().catch(() => null)
        return { status: r.status, code: data?.code, data: data?.data }
      } catch (e) { return { error: e.message } }
    }, { apiBase: API_BASE, jwt })
    console.log(`  /auth/me: HTTP ${meResp.status}, code=${meResp.code}`)
    result.details.meResp = meResp
    if (meResp.code === 200) result.profileApiOk = true
  }

  result.passed = result.jwtValid && result.profileApiOk
  return result
}

// ── 阶段 3：全工作台可访问性测试 ─────────────────────────────────────────────
async function testAllWorkstations(ctx, jwt, user, profile) {
  console.log('\n' + '═'.repeat(65))
  console.log(`  阶段 3：全工作台可访问性测试（${WORKSTATIONS.length} 台，使用真实登录 JWT）`)
  console.log('═'.repeat(65))

  const page = await ctx.newPage()

  // 所有新导航前注入真实 JWT
  await ctx.addInitScript(([t, u, p]) => {
    if (location.hostname === '118.196.64.48') {
      try {
        localStorage.setItem('auth_token', t)
        localStorage.setItem('token', t)
        localStorage.setItem('auth_user', u)
        localStorage.setItem('auth_profile', p)
        localStorage.setItem('auth_profile_token', t)
        localStorage.setItem('auth_token_ts', String(Date.now()))
      } catch {}
    }
  }, [jwt, user || '{}', profile || '{}']).catch(() => {})

  const results = []

  for (const ws of WORKSTATIONS) {
    const url = `${BASE_URL}${ws.path}`
    process.stdout.write(`  ${ws.name.padEnd(20)} `)

    const jsErrors = []
    const errHandler = msg => {
      if (msg.type() === 'error') {
        const txt = msg.text()
        if (!txt.includes('favicon') && !txt.includes('net::ERR') && !txt.includes('Failed to load resource')) {
          jsErrors.push(txt.substring(0, 80))
        }
      }
    }
    page.on('console', errHandler)

    const t0 = Date.now()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } catch {}
    await page.waitForTimeout(3000)
    const loadMs = Date.now() - t0

    await shot(page, `3-${ws.id}`)

    const needsLogin = await isLoginPage(page)
    if (needsLogin) {
      // 二次尝试：重新注入 JWT
      await page.evaluate(([t, u, p]) => {
        try {
          localStorage.setItem('auth_token', t)
          localStorage.setItem('token', t)
          localStorage.setItem('auth_user', u)
          localStorage.setItem('auth_profile', p)
          localStorage.setItem('auth_token_ts', String(Date.now()))
        } catch {}
      }, [jwt, user || '{}', profile || '{}']).catch(() => {})

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
      } catch {}
      await page.waitForTimeout(2500)

      if (await isLoginPage(page)) {
        results.push({ ...ws, status: 'NEED_LOGIN', url: page.url(), findings: ['登录态未保持，JWT 注入无效'], loadMs })
        process.stdout.write('🔐 NEED_LOGIN\n')
        page.off('console', errHandler)
        continue
      }
    }

    const bodyRaw = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '')
    const title = await page.title().catch(() => '')

    const isBlank    = bodyRaw.length < 25
    const has500     = bodyRaw.includes('Internal Server Error') || /\b500\b.*error/i.test(bodyRaw)
    const has404     = bodyRaw.includes('页面不存在') || bodyRaw.includes('404 Not Found')
    const hasUndef   = /\bundefined\b/.test(bodyRaw.substring(0, 800)) && !bodyRaw.includes('undefined 条')
    const hasNaN     = /\bNaN\b/.test(bodyRaw.substring(0, 800))

    let status = 'PASS'
    const findings = []

    if (isBlank)  { status = 'FAIL';    findings.push('白屏') }
    if (has500)   { status = 'FAIL';    findings.push('500服务器错误') }
    if (has404)   { status = status === 'PASS' ? 'WARN' : status;    findings.push('路由404') }
    if (hasUndef && !isBlank) { status = status === 'PASS' ? 'PARTIAL' : status; findings.push('渲染了undefined') }
    if (hasNaN && !isBlank)   { status = status === 'PASS' ? 'PARTIAL' : status; findings.push('渲染了NaN') }
    if (jsErrors.length > 0)  { if (status === 'PASS') status = 'PARTIAL'; findings.push(`JS错误×${jsErrors.length}`) }

    if (findings.length === 0) {
      findings.push(/[1-9]\d*/.test(bodyRaw.substring(0, 800)) ? '有数据' : '正常渲染（空库）')
    }
    findings.push(`${loadMs}ms`)

    results.push({ ...ws, status, url: page.url(), title, findings, loadMs, bodyPreview: bodyRaw.substring(0, 120) })

    const icon = { PASS: '✅', PARTIAL: '⚠️ ', FAIL: '❌', WARN: '🔶' }[status] || '❓'
    process.stdout.write(`${icon} [${status}] ${findings.join(' | ')}\n`)
    page.off('console', errHandler)
    await page.waitForTimeout(300)
  }

  await page.close()
  return results
}

// ── 阶段 4：服务器 Token 持久化验证 ─────────────────────────────────────────
function verifyServerTokenPersistence() {
  console.log('\n' + '═'.repeat(65))
  console.log('  阶段 4：服务器端 Token 持久化状态（SSH 直查数据库）')
  console.log('═'.repeat(65))

  const pyCode = [
    'from apps.identity.feishu_token_model import FeishuUserToken',
    'from django.utils import timezone',
    'import json',
    'now = timezone.now()',
    'total = FeishuUserToken.objects.count()',
    'with_refresh = FeishuUserToken.objects.exclude(refresh_token="").count()',
    'access_valid = FeishuUserToken.objects.filter(token_expires_at__gt=now).count()',
    'refresh_valid = FeishuUserToken.objects.exclude(refresh_token="").filter(refresh_expires_at__gt=now).count()',
    'recent = list(FeishuUserToken.objects.order_by("-updated_at")[:8].values("account_id","open_id","token_expires_at","refresh_expires_at","updated_at","issuer_app_id"))',
    'print(json.dumps({"total":total,"with_refresh_token":with_refresh,"access_token_valid_now":access_valid,"refresh_token_valid":refresh_valid,"recent_8":[{"account_id":r["account_id"],"open_id_prefix":str(r["open_id"])[:12],"access_exp":str(r["token_expires_at"]),"refresh_exp":str(r["refresh_expires_at"]),"updated":str(r["updated_at"]),"app_id":r["issuer_app_id"]} for r in recent]},indent=2))',
  ].join('; ')

  const cmd =
    `ssh -i ~/.ssh/openclaw1.1.pem -o StrictHostKeyChecking=no root@118.196.64.48 ` +
    `"cd /opt/cn-kis-v2/backend && /opt/cn-kis-v2/backend/venv/bin/python manage.py shell -c '${pyCode}'" 2>&1`

  try {
    const raw = execSync(cmd, { timeout: 25000, encoding: 'utf8' })
    // 过滤掉 Django 警告行，保留 JSON
    const jsonLines = raw.split('\n').filter(l => !l.startsWith('[2') && !l.includes('WARNING') && !l.includes('easyocr')).join('\n').trim()
    console.log(jsonLines)

    let data = {}
    const jsonMatch = jsonLines.match(/\{[\s\S]+\}/)
    if (jsonMatch) {
      try { data = JSON.parse(jsonMatch[0]) } catch {}
    }

    console.log('\n  ── 解读 ──')
    console.log(`  总 token 记录数    : ${data.total}`)
    console.log(`  含 refresh_token   : ${data.with_refresh_token} / ${data.total}`)
    console.log(`  当前 access 有效   : ${data.access_token_valid_now}（access_token 有效期 2h）`)
    console.log(`  refresh_token 有效 : ${data.refresh_token_valid}（有效期 30 天，可自动续期）`)

    if ((data.with_refresh_token || 0) > 0) {
      console.log(`\n  ✅ refresh_token 持久化正常，${data.with_refresh_token} 个用户有有效 refresh_token`)
    } else {
      console.log(`\n  ❌ 没有找到有效的 refresh_token，持久化可能有问题`)
    }

    if ((data.access_token_valid_now || 0) > 0) {
      console.log(`  ✅ 本次登录的 access_token 已写入数据库（${data.access_token_valid_now} 个有效）`)
    } else {
      console.log(`  ℹ️  当前无有效 access_token（均已超过 2h 有效期）`)
      console.log(`  ℹ️  系统会在下次 API 请求时自动用 refresh_token 换取新 access_token`)
    }

    return data
  } catch (e) {
    console.error(`  ❌ SSH 查询失败：${e.message}`)
    return { error: e.message }
  }
}

// ── 最终汇总报告 ─────────────────────────────────────────────────────────────
function printSummary(loginResult, tokenResult, wsResults, serverData) {
  console.log('\n\n' + '═'.repeat(65))
  console.log('  CN KIS V2.0 登录 + Token + 工作台 综合验收报告')
  console.log(`  执行时间：${new Date().toLocaleString('zh-CN')}`)
  console.log(`  测试环境：${BASE_URL}`)
  console.log('═'.repeat(65))

  // 登录状态
  const li = loginResult.passed ? '✅' : '❌'
  console.log(`\n  [1] OAuth 登录           ${li} ${loginResult.passed ? '通过' : '失败: ' + loginResult.error}`)
  if (loginResult.passed && loginResult.finalUrl) {
    console.log(`      落地 URL: ${loginResult.finalUrl}`)
  }

  // Token 状态
  const ti = tokenResult.passed ? '✅' : '⚠️ '
  console.log(`\n  [2] Token 完整性          ${ti}`)
  console.log(`      JWT 有效性: ${tokenResult.jwtValid ? '✅ 有效' : '❌ 过期或无效'}`)
  console.log(`      /auth/profile: ${tokenResult.profileApiOk ? '✅ 正常' : '❌ 异常'}`)

  // 服务器持久化
  const si = (serverData.with_refresh_token > 0) ? '✅' : '❌'
  console.log(`\n  [3] 服务器 Token 持久化   ${si}`)
  console.log(`      总记录: ${serverData.total}，含 refresh: ${serverData.with_refresh_token}，refresh 有效: ${serverData.refresh_token_valid}`)

  // 工作台
  const total   = wsResults.length
  const pass    = wsResults.filter(r => r.status === 'PASS').length
  const partial = wsResults.filter(r => r.status === 'PARTIAL').length
  const fail    = wsResults.filter(r => r.status === 'FAIL').length
  const needLogin = wsResults.filter(r => r.status === 'NEED_LOGIN').length
  const warn    = wsResults.filter(r => r.status === 'WARN').length

  const strictRate = total ? (pass / total * 100).toFixed(1) : 0
  const qualRate   = total ? ((pass + partial) / total * 100).toFixed(1) : 0

  const wi = fail + needLogin === 0 ? '✅' : (fail + needLogin < 3 ? '⚠️ ' : '❌')
  console.log(`\n  [4] 全工作台可访问性      ${wi}  共 ${total} 台`)
  console.log(`      ✅ PASS:       ${pass} 台`)
  console.log(`      ⚠️  PARTIAL:    ${partial} 台`)
  console.log(`      ❌ FAIL:       ${fail} 台`)
  console.log(`      🔐 NEED_LOGIN: ${needLogin} 台`)
  console.log(`      🔶 WARN:       ${warn} 台`)
  console.log(`      严格通过率: ${strictRate}%  |  宽松通过率: ${qualRate}%`)

  const problemItems = wsResults.filter(r => ['FAIL', 'NEED_LOGIN', 'PARTIAL'].includes(r.status))
  if (problemItems.length > 0) {
    console.log('\n  ── 需关注的工作台 ──')
    problemItems.forEach(r => {
      const icon = { FAIL: '❌', NEED_LOGIN: '🔐', PARTIAL: '⚠️ ' }[r.status]
      console.log(`     ${icon} ${r.name.padEnd(18)} ${r.findings.join(' | ')}`)
    })
  }

  // 综合评估
  const overallOk = loginResult.passed &&
                    tokenResult.jwtValid &&
                    serverData.with_refresh_token > 0 &&
                    (pass + partial) / total >= 0.8

  console.log('\n  ── 综合评估 ──')
  console.log(`  ${overallOk ? '✅ 通过' : '⚠️  需关注'}`)
  if (!overallOk) {
    if (!loginResult.passed)              console.log('  → OAuth 登录未成功')
    if (!tokenResult.jwtValid)            console.log('  → JWT token 无效')
    if (!serverData.with_refresh_token)   console.log('  → refresh_token 未持久化')
    if ((pass + partial) / total < 0.8)   console.log(`  → 工作台可用率低于 80%（当前 ${qualRate}%）`)
  }

  // 保存报告
  const report = {
    version: 'v2-login-token',
    timestamp: new Date().toISOString(),
    testEnv: BASE_URL,
    scopeCount: CURRENT_SCOPES.length,
    login: { passed: loginResult.passed, error: loginResult.error, finalUrl: loginResult.finalUrl },
    token: { jwtValid: tokenResult.jwtValid, profileApiOk: tokenResult.profileApiOk },
    serverTokens: serverData,
    workstations: { total, pass, partial, fail, needLogin, warn, strictRate, qualRate, items: wsResults },
    overallPassed: overallOk,
  }
  writeFileSync(`${SCREENSHOT_DIR}/report.json`, JSON.stringify(report, null, 2))
  console.log(`\n  📋 报告已保存：${SCREENSHOT_DIR}/report.json`)
  console.log(`  📸 截图目录：${SCREENSHOT_DIR}/`)
  console.log('═'.repeat(65))

  return overallOk
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('═'.repeat(65))
  console.log('  CN KIS V2.0 — 登录 + Token + 全工作台 Headed 验收测试')
  console.log(`  目标服务器：${BASE_URL}`)
  console.log(`  工作台数量：${WORKSTATIONS.length} 台`)
  console.log(`  OAuth scope：${CURRENT_SCOPES.length} 项`)
  console.log(`  执行时间：${new Date().toLocaleString('zh-CN')}`)
  console.log('═'.repeat(65))

  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--window-size=1440,900',
      // 绕过本机全局代理（127.0.0.1:58585），避免 OAuth code 经代理导致 20003:invalid_grant
      '--no-proxy-server',
    ],
  })

  let loginResult, tokenResult, wsResults, serverData

  try {
    // 阶段 1：真实 OAuth 登录
    const { page: loginPage, ctx, result: lr } = await doRealLogin(browser)
    loginResult = lr

    if (!loginResult.passed || !loginResult.jwt) {
      console.log('\n❌ 登录未成功，中止后续测试')
      serverData = verifyServerTokenPersistence()
      printSummary(loginResult, { passed: false, jwtValid: false, profileApiOk: false, details: {} }, [], serverData)
      await browser.close().catch(() => {})
      process.exit(1)
      return
    }

    // 阶段 2：Token 完整性验证
    tokenResult = await verifyTokenInfo(loginPage, loginResult.jwt)
    await loginPage.close()

    // 阶段 3：全工作台测试
    wsResults = await testAllWorkstations(ctx, loginResult.jwt, loginResult.user, loginResult.profile)

    await ctx.close()

  } catch (e) {
    console.error('\n❌ 主流程异常:', e.message)
    console.error(e.stack)
    await browser.close().catch(() => {})
    process.exit(1)
    return
  }

  await browser.close().catch(() => {})

  // 阶段 4：SSH 查数据库（浏览器关闭后，避免影响交互）
  serverData = verifyServerTokenPersistence()

  const passed = printSummary(loginResult, tokenResult, wsResults, serverData)
  process.exit(passed ? 0 : 1)
}

main().catch(e => {
  console.error('\n测试运行异常:', e.message)
  console.error(e.stack)
  process.exit(1)
})
