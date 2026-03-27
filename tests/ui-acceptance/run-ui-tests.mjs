/**
 * CN KIS V2.0 UI 验收测试 v3
 * - 正确处理飞书 LoginFallback（点击「飞书登录」按钮触发 OAuth）
 * - 等待用户完成扫码/授权后，再遍历所有页面截图
 */
import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

// 用 IP 地址测试，redirect_uri 已注册；china-norm.com 需在飞书后台补 redirect_uri 后切换
const BASE_URL = 'http://118.196.64.48'

const GOVERNANCE_PAGES = [
  { id: 'gov-01-dashboard',     name: 'GOV-1  Dashboard',      path: '/governance',               checks: ['text=活跃用户', 'text=角色数量'] },
  { id: 'gov-02-users',         name: 'GOV-2  Users',          path: '/governance/users',         checks: ['text=账号', 'text=用户'] },
  { id: 'gov-03-roles',         name: 'GOV-3  Roles',          path: '/governance/roles',         checks: ['text=角色列表'] },
  { id: 'gov-04-permissions',   name: 'GOV-4  Permissions',    path: '/governance/permissions',   checks: ['text=权限码'] },
  { id: 'gov-05-sessions',      name: 'GOV-5  Sessions',       path: '/governance/sessions',      checks: ['text=会话'] },
  { id: 'gov-06-activity',      name: 'GOV-6  Activity',       path: '/governance/activity',      checks: [] },
  { id: 'gov-07-feature-usage', name: 'GOV-7  FeatureUsage',   path: '/governance/feature-usage', checks: [] },
  { id: 'gov-08-ai-usage',      name: 'GOV-8  AiUsage',        path: '/governance/ai-usage',      checks: [] },
  { id: 'gov-09-audit',         name: 'GOV-9  Audit',          path: '/governance/audit',         checks: ['text=审计'] },
  { id: 'gov-10-workstations',  name: 'GOV-10 Workstations',   path: '/governance/workstations',  checks: ['text=工作台总览'] },
  { id: 'gov-11-pilot-config',  name: 'GOV-11 PilotConfig',    path: '/governance/pilot-config',  checks: [] },
  { id: 'gov-12-feishu',        name: 'GOV-12 Feishu',         path: '/governance/feishu',        checks: [] },
  { id: 'gov-13-config',        name: 'GOV-13 SysConfig',      path: '/governance/config',        checks: [] },
]

const DP_PAGES = [
  { id: 'dp-01-dashboard',  name: 'DP-1   Dashboard',  path: '/data-platform',           checks: ['text=写保护', 'text=知识'] },
  { id: 'dp-02-catalog',    name: 'DP-2   Catalog',    path: '/data-platform/catalog',   checks: ['text=数据目录', 'text=模块'] },
  { id: 'dp-03-knowledge',  name: 'DP-3   Knowledge',  path: '/data-platform/knowledge', checks: ['text=知识'] },
  { id: 'dp-04-ingest',     name: 'DP-4   Ingest',     path: '/data-platform/ingest',    checks: ['text=入库'] },
  { id: 'dp-05-lineage',    name: 'DP-5   Lineage',    path: '/data-platform/lineage',   checks: ['text=血缘'] },
  { id: 'dp-06-pipelines',  name: 'DP-6   Pipelines',  path: '/data-platform/pipelines', checks: [] },
  { id: 'dp-07-quality',    name: 'DP-7   Quality',    path: '/data-platform/quality',   checks: ['text=质量'] },
  { id: 'dp-08-storage',    name: 'DP-8   Storage',    path: '/data-platform/storage',   checks: ['text=存储'] },
  { id: 'dp-09-topology',   name: 'DP-9   Topology',   path: '/data-platform/topology',  checks: ['text=拓扑'] },
  { id: 'dp-10-backup',     name: 'DP-10  Backup',     path: '/data-platform/backup',    checks: ['text=备份'] },
]

const results = []

async function shot(page, id) {
  const f = path.join(SCREENSHOTS_DIR, `${id}.png`)
  await page.screenshot({ path: f, fullPage: true })
  return f
}

// 检测是否是登录回调页（飞书 LoginFallback）
async function isLoginPage(page) {
  try {
    const btn = page.locator('button:has-text("飞书登录"), button:has-text("飞书"), a:has-text("飞书登录")')
    const count = await btn.count()
    return count > 0
  } catch { return false }
}

// 检测是否是企业官网
async function isCorporateSite(page) {
  try {
    const body = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || '')
    return body.includes('商业伙伴') || body.includes('Innovation · Focus') || body.includes('专业研究人员')
  } catch { return false }
}

async function doLogin(page, workstation, maxWaitSec = 120) {
  const landUrl = `${BASE_URL}/${workstation}`
  console.log(`\n📌 [${workstation}] 打开登录页面...`)

  try {
    await page.goto(landUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  } catch(e) {}
  await page.waitForTimeout(3000)
  await shot(page, `${workstation}-step1-open`)

  const loginUrl = page.url()
  console.log(`   URL: ${loginUrl}`)

  // 情况 1：已跳转到飞书 OAuth 页面（自动跳转）
  if (loginUrl.includes('open.feishu') || loginUrl.includes('passport.feishu') || loginUrl.includes('feishu.cn/authen')) {
    console.log(`   ⚠️  自动跳转到飞书 OAuth，等待扫码登录（最多 ${maxWaitSec}s）...`)
    console.log(`   👉 请在浏览器中完成飞书授权`)
  }
  // 情况 2：显示工作台内部的「飞书登录」按钮（LoginFallback）
  else if (await isLoginPage(page)) {
    console.log(`   🔘 检测到「飞书登录」按钮，自动点击...`)
    await shot(page, `${workstation}-step2-login-fallback`)
    try {
      await page.locator('button:has-text("飞书登录"), button:has-text("飞书")').first().click()
      await page.waitForTimeout(2000)
      await shot(page, `${workstation}-step3-after-click`)
      console.log(`   ⚠️  等待飞书 OAuth 完成（最多 ${maxWaitSec}s）...`)
      console.log(`   👉 请在浏览器中完成飞书扫码/账号授权`)
    } catch(e) {
      console.log(`   ❌ 点击失败: ${e.message}`)
    }
  }
  // 情况 3：已经登录
  else if (loginUrl.startsWith(landUrl)) {
    console.log(`   ✅ 已登录，无需操作`)
    return true
  }

  // 等待回调（轮询方式，更可靠）
  const deadline = Date.now() + maxWaitSec * 1000
  let loggedIn = false
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000)
    const curUrl = page.url()
    if (curUrl.startsWith(`${BASE_URL}/${workstation}`) &&
        !curUrl.includes('feishu') && !curUrl.includes('passport') &&
        !curUrl.includes('accounts.')) {
      loggedIn = true
      break
    }
    const remaining = Math.round((deadline - Date.now()) / 1000)
    if (remaining % 30 === 0 && remaining > 0) {
      process.stdout.write(`   ⏳ 等待登录... 剩余 ${remaining}s\n`)
    }
  }

  if (loggedIn) {
    await page.waitForTimeout(3000)
    await shot(page, `${workstation}-step4-logged-in`)
    console.log(`   ✅ 登录成功！URL: ${page.url()}`)
    return true
  } else {
    console.log(`   ⏰ 登录等待超时（${maxWaitSec}s），当前 URL: ${page.url()}`)
    await shot(page, `${workstation}-timeout`)
    return false
  }
}

async function testPage(page, pageInfo) {
  const url = `${BASE_URL}${pageInfo.path}`
  process.stdout.write(`\n  ${pageInfo.name.padEnd(22)} `)

  const errs = []
  const errHandler = msg => {
    if (msg.type() === 'error') {
      const txt = msg.text()
      if (!txt.includes('favicon') && !txt.includes('net::ERR')) errs.push(txt.substring(0, 100))
    }
  }
  page.on('console', errHandler)

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
  } catch {}
  await page.waitForTimeout(3500)

  const currentUrl = page.url()
  const f = await shot(page, pageInfo.id)

  // 又回到了登录页？
  const loginFallback = await isLoginPage(page)
  if (loginFallback || currentUrl.includes('feishu') || currentUrl.includes('passport')) {
    results.push({ ...pageInfo, status: 'NEED_LOGIN', url: currentUrl, findings: ['登录态丢失'], screenshot: f })
    process.stdout.write('🔐 NEED_LOGIN\n')
    page.off('console', errHandler)
    return 'need_login'
  }

  // 企业官网检测（BUG-01 残留）
  if (await isCorporateSite(page)) {
    results.push({ ...pageInfo, status: 'FAIL', url: currentUrl, findings: ['❌ 仍显示企业官网（nginx 未生效）'], screenshot: f })
    process.stdout.write('❌ FAIL [企业官网]\n')
    page.off('console', errHandler)
    return 'fail'
  }

  const body = await page.evaluate(() =>
    (document.body?.innerText || '').replace(/\s+/g, ' ').trim()
  )
  const title = await page.title()
  const isBlank = body.length < 20
  const has500 = body.includes('Internal Server Error')

  let status = 'PASS'
  const findings = []

  if (isBlank) { status = 'FAIL'; findings.push('白屏') }
  if (has500) { status = 'FAIL'; findings.push('500错误') }

  // 检查关键元素
  for (const check of (pageInfo.checks || [])) {
    try {
      const v = await page.locator(check).first().isVisible({ timeout: 1500 }).catch(() => false)
      if (!v) { status = status === 'PASS' ? 'PARTIAL' : status; findings.push(`未见: ${check}`) }
    } catch {}
  }

  // console 错误
  if (errs.length > 0) {
    status = status === 'PASS' ? 'PARTIAL' : status
    findings.push(`console.error×${errs.length}`)
  }

  if (findings.length === 0) {
    const nums = /[1-9]\d*/.test(body.substring(0, 500))
    findings.push(nums ? '正常，有数据' : '正常（空库无数据）')
  }

  results.push({ ...pageInfo, status, url: currentUrl, title, findings, screenshot: f,
    bodyPreview: body.substring(0, 200) })

  const icon = { PASS: '✅', PARTIAL: '⚠️', FAIL: '❌' }[status] || '❓'
  process.stdout.write(`${icon} [${status}] ${findings.join(' | ')}\n`)
  process.stdout.write(`${''.padEnd(24)} 📸 ${path.basename(f)}\n`)

  page.off('console', errHandler)
  return status.toLowerCase()
}

async function run() {
  console.log('═'.repeat(65))
  console.log('  CN KIS V2.0 — 正式浏览器 UI 全量验收测试 v3')
  console.log(`  ${BASE_URL}`)
  console.log('═'.repeat(65))

  fs.readdirSync(SCREENSHOTS_DIR).filter(f=>f.endsWith('.png')).forEach(f =>
    fs.unlinkSync(path.join(SCREENSHOTS_DIR, f))
  )

  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--window-size=1440,900'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await ctx.newPage()

  // ── 阶段一：Governance ──
  console.log('\n\n' + '─'.repeat(65))
  console.log('  阶段一：鹿鸣·治理台（Governance）13 个页面')
  console.log('─'.repeat(65))
  const govLoggedIn = await doLogin(page, 'governance', 300)

  if (!govLoggedIn) {
    console.log('\n  ⛔ Governance 登录未完成，跳过治理台页面测试')
    for (const p of GOVERNANCE_PAGES) results.push({ ...p, status: 'SKIP', findings: ['登录未完成'] })
  } else {
    for (const p of GOVERNANCE_PAGES) {
      const st = await testPage(page, p)
      if (st === 'need_login') { console.log('  ⛔ 登录态丢失，停止'); break }
      await page.waitForTimeout(500)
    }
  }

  // ── 阶段二：Data Platform ──
  console.log('\n\n' + '─'.repeat(65))
  console.log('  阶段二：洞明·数据台（Data Platform）10 个页面')
  console.log('─'.repeat(65))
  const dpLoggedIn = await doLogin(page, 'data-platform', 300)

  if (!dpLoggedIn) {
    console.log('\n  ⛔ Data Platform 登录未完成，跳过')
    for (const p of DP_PAGES) results.push({ ...p, status: 'SKIP', findings: ['登录未完成'] })
  } else {
    for (const p of DP_PAGES) {
      const st = await testPage(page, p)
      if (st === 'need_login') { console.log('  ⛔ 登录态丢失，停止'); break }
      await page.waitForTimeout(500)
    }
  }

  // ── 汇总 ──
  console.log('\n\n' + '═'.repeat(65))
  console.log('  测试汇总')
  console.log('═'.repeat(65))

  const counts = { PASS:0, PARTIAL:0, FAIL:0, NEED_LOGIN:0, SKIP:0 }
  results.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })

  console.log(`\n  ✅ PASS      : ${counts.PASS}`)
  console.log(`  ⚠️  PARTIAL   : ${counts.PARTIAL}`)
  console.log(`  ❌ FAIL      : ${counts.FAIL}`)
  console.log(`  🔐 NEED_LOGIN: ${counts.NEED_LOGIN}`)
  console.log(`  ⏭  SKIP      : ${counts.SKIP}`)

  console.log('\n── 详情 ──')
  for (const r of results) {
    const icon = { PASS:'✅', PARTIAL:'⚠️', FAIL:'❌', NEED_LOGIN:'🔐', SKIP:'⏭' }[r.status]||'❓'
    console.log(`  ${icon} ${r.name.padEnd(22)} ${r.findings?.join(' | ') || ''}`)
  }

  if (results.filter(r=>r.status==='FAIL').length > 0) {
    console.log('\n── ❌ 失败详情 ──')
    results.filter(r=>r.status==='FAIL').forEach(r =>
      console.log(`  ${r.name}: ${r.findings?.join(', ')} | URL: ${r.url}`)
    )
  }

  const reportPath = path.join(SCREENSHOTS_DIR, 'report.json')
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(), base_url: BASE_URL, counts, results
  }, null, 2))
  console.log(`\n📋 ${reportPath}`)
  console.log(`📁 ${SCREENSHOTS_DIR}`)

  console.log('\n  浏览器将在 15 秒后关闭...')
  await page.waitForTimeout(15000)
  await ctx.close()
  await browser.close()
}

run().catch(e => { console.error('错误:', e.message); process.exit(1) })
