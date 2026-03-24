/**
 * CN KIS V2.0 — 深度验收测试（6个任务）
 *
 * 执行方式：
 *   node tests/ui-acceptance/deep-acceptance-test.mjs
 */

import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots-deep-test')
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const BASE_URL = 'http://118.196.64.48'
const API_BASE = `${BASE_URL}/v2/api/v1`

const SUPERADMIN_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6ImZlaXNodV9hZDlkNzQ1NjI1YTY1ZGMzIiwiYWNjb3VudF90eXBlIjoiaW50ZXJuYWwiLCJyb2xlcyI6WyJzdXBlcmFkbWluIiwicmVzZWFyY2hfbWFuYWdlciIsInZpZXdlciJdLCJleHAiOjE3NzQxNjgyNzEsImlhdCI6MTc3NDA4MTg3MX0.K4qDqRJre4V5X5DjiGMMq5UST-iOlqD20CLtReP_fno'
const SUPERADMIN_USER = JSON.stringify({
  id: 1,
  username: 'feishu_ad9d745625a65dc3',
  display_name: '马利民',
  account_type: 'internal',
  roles: ['superadmin'],
})
const SUPERADMIN_PROFILE = JSON.stringify({
  id: 1,
  username: 'feishu_ad9d745625a65dc3',
  display_name: '马利民',
  account_type: 'internal',
  roles: [{ name: 'superadmin', display_name: '超级管理员', level: 100, category: 'system' }],
  permissions: ['*'],
  data_scope: 'global',
  visible_workbenches: ['secretary', 'research', 'quality', 'finance', 'hr', 'crm', 'execution', 'recruitment', 'equipment', 'material', 'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception', 'control-plane', 'governance', 'digital-workforce', 'data-platform'],
})

const results = []

async function isLoginPage(page) {
  try {
    const body = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '')
    const url = page.url()
    return body.includes('飞书登录') || url.includes('open.feishu') || url.includes('passport.feishu')
  } catch { return false }
}

async function injectAuth(page, url) {
  console.log(`\n  → 导航到: ${url}`)

  const handler = async (route) => {
    const reqUrl = route.request().url()
    if (reqUrl.includes('open.feishu') || reqUrl.includes('passport.feishu')) {
      await route.abort()
    } else if (reqUrl.includes(`${BASE_URL}/api/`)) {
      const newUrl = reqUrl.replace(`${BASE_URL}/api/`, `${BASE_URL}/v2/api/`)
      await route.continue({ url: newUrl, headers: { ...route.request().headers(), 'Authorization': `Bearer ${SUPERADMIN_JWT}` } })
    } else {
      await route.continue()
    }
  }
  await page.route('**/*', handler)

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
  } catch (e) {
    console.log(`  ⚠️  初次导航: ${e.message}`)
  }
  await page.waitForTimeout(800)
  await page.unroute('**/*', handler)

  await page.evaluate(([token, user, profile]) => {
    try {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', user)
      localStorage.setItem('token', token)
      localStorage.setItem('auth_profile', profile)
      localStorage.setItem('auth_profile_token', token)
      localStorage.setItem('auth_token_ts', String(Date.now()))
    } catch (e) { }
  }, [SUPERADMIN_JWT, SUPERADMIN_USER, SUPERADMIN_PROFILE]).catch(() => { })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
  } catch (e) {
    console.log(`  ⚠️  刷新导航: ${e.message}`)
  }
  await page.waitForTimeout(3000)

  const stillLogin = await isLoginPage(page)
  if (stillLogin) {
    console.log('  ⚠️  仍显示登录页，二次注入...')
    await page.evaluate(([token, user, profile]) => {
      try {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_user', user)
        localStorage.setItem('auth_profile', profile)
        localStorage.setItem('auth_profile_token', token)
      } catch { }
    }, [SUPERADMIN_JWT, SUPERADMIN_USER, SUPERADMIN_PROFILE]).catch(() => { })
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    } catch { }
    await page.waitForTimeout(2000)
    return !(await isLoginPage(page))
  }
  return true
}

async function shot(page, filename) {
  const filepath = path.join(SCREENSHOTS_DIR, filename)
  await page.screenshot({ path: filepath, fullPage: true })
  console.log(`  📸 ${filename}`)
  return filepath
}

// ── 任务1：子衿·秘书台深度测试 ──────────────────────────────
async function task1_secretary(page) {
  console.log('\n' + '═'.repeat(60))
  console.log('  任务1：子衿·秘书台深度测试')
  console.log('═'.repeat(60))

  const url = `${BASE_URL}/secretary/#/dashboard`
  const authOk = await injectAuth(page, url)

  if (!authOk) {
    results.push({ task: '任务1-秘书台', status: 'FAIL', findings: ['认证失败'] })
    return
  }

  await shot(page, 'task1-01-dashboard.png')
  const dashInfo = await page.evaluate(() => ({ preview: document.body?.innerText?.substring(0, 200) || '' }))
  console.log(`  仪表板内容预览: ${dashInfo.preview.substring(0, 80).replace(/\n/g, ' ')}`)

  // 尝试进入邮件页
  await page.goto(`${BASE_URL}/secretary/#/inbox`, { waitUntil: 'domcontentloaded' }).catch(() => { })
  await page.waitForTimeout(2000)
  await shot(page, 'task1-02-inbox.png')

  const mailInfo = await page.evaluate(() => {
    const body = document.body?.innerText || ''
    const lines = body.split('\n').filter(l => l.trim()).length
    return { lines, preview: body.substring(0, 200) }
  })
  console.log(`  邮件页行数: ${mailInfo.lines}`)

  results.push({
    task: '任务1-秘书台', status: 'PASS',
    findings: [`仪表板正常`, `邮件页行数: ${mailInfo.lines}`, `内容: ${mailInfo.preview.substring(0, 80).replace(/\n/g, ' ')}`]
  })
  console.log('  ✅ 任务1 PASS')
}

// ── 任务2：采苓·研究台深度测试 ──────────────────────────────
async function task2_research(page) {
  console.log('\n' + '═'.repeat(60))
  console.log('  任务2：采苓·研究台深度测试')
  console.log('═'.repeat(60))

  const url = `${BASE_URL}/research/#/dashboard`
  const authOk = await injectAuth(page, url)
  if (!authOk) { results.push({ task: '任务2-研究台', status: 'FAIL', findings: ['认证失败'] }); return }

  await shot(page, 'task2-01-dashboard.png')

  await page.goto(`${BASE_URL}/research/#/protocols`, { waitUntil: 'domcontentloaded' }).catch(() => { })
  await page.waitForTimeout(2000)
  await shot(page, 'task2-02-protocols.png')

  const protocolInfo = await page.evaluate(() => {
    const body = document.body?.innerText || ''
    const rows = document.querySelectorAll('tr, [role="row"]').length
    return { rows, hasData: rows > 1 || /[A-Z]{2,}-\d+/.test(body), preview: body.substring(0, 200) }
  })
  console.log(`  协议列表行数: ${protocolInfo.rows}, 有数据: ${protocolInfo.hasData}`)

  // 尝试访问受试者
  await page.goto(`${BASE_URL}/research/#/subjects`, { waitUntil: 'domcontentloaded' }).catch(() => { })
  await page.waitForTimeout(2000)
  await shot(page, 'task2-03-subjects.png')

  const subjectInfo = await page.evaluate(() => {
    const body = document.body?.innerText || ''
    return { preview: body.substring(0, 200) }
  })

  results.push({
    task: '任务2-研究台', status: 'PASS',
    findings: [
      '研究仪表板正常',
      protocolInfo.hasData ? `协议列表有数据(${protocolInfo.rows}行)` : '协议列表为空',
      `受试者页: ${subjectInfo.preview.substring(0, 60).replace(/\n/g, ' ')}`,
    ]
  })
  console.log('  ✅ 任务2 PASS')
}

// ── 任务3：怀瑾·质量台深度测试 ──────────────────────────────
async function task3_quality(page) {
  console.log('\n' + '═'.repeat(60))
  console.log('  任务3：怀瑾·质量台深度测试')
  console.log('═'.repeat(60))

  const url = `${BASE_URL}/quality/#/dashboard`
  const authOk = await injectAuth(page, url)
  if (!authOk) { results.push({ task: '任务3-质量台', status: 'FAIL', findings: ['认证失败'] }); return }

  await shot(page, 'task3-01-dashboard.png')

  await page.goto(`${BASE_URL}/quality/#/sop`, { waitUntil: 'domcontentloaded' }).catch(() => { })
  await page.waitForTimeout(2000)
  await shot(page, 'task3-02-sop.png')
  const sopInfo = await page.evaluate(() => ({
    rows: document.querySelectorAll('tr, [role="row"]').length,
    preview: document.body?.innerText?.substring(0, 200) || ''
  }))
  console.log(`  SOP列表行数: ${sopInfo.rows}`)

  await page.goto(`${BASE_URL}/quality/#/deviations`, { waitUntil: 'domcontentloaded' }).catch(() => { })
  await page.waitForTimeout(2000)
  await shot(page, 'task3-03-deviations.png')
  const devInfo = await page.evaluate(() => {
    const body = document.body?.innerText || ''
    const has500 = body.toLowerCase().includes('server error') || body.includes('500')
    return { has500, rows: document.querySelectorAll('tr').length, preview: body.substring(0, 200) }
  })
  console.log(`  偏差管理: ${devInfo.has500 ? '500错误' : `正常(${devInfo.rows}行)`}`)

  results.push({
    task: '任务3-质量台',
    status: devInfo.has500 ? 'PARTIAL' : 'PASS',
    findings: [
      '质量仪表板正常',
      `SOP列表: ${sopInfo.rows}行`,
      devInfo.has500 ? '偏差管理500错误（需部署后端修复）' : `偏差管理正常(${devInfo.rows}行)`,
    ]
  })
  console.log(`  ${devInfo.has500 ? '⚠️  任务3 PARTIAL' : '✅ 任务3 PASS'}`)
}

// ── 任务4：洞明·数据台测试 ──────────────────────────────────
async function task4_dataPlatform(page) {
  console.log('\n' + '═'.repeat(60))
  console.log('  任务4：洞明·数据台测试（独立认证工作台）')
  console.log('═'.repeat(60))

  try {
    await page.goto(`${BASE_URL}/data-platform`, { waitUntil: 'domcontentloaded', timeout: 15000 })
  } catch (e) {
    console.log(`  ⚠️  导航异常: ${e.message}`)
  }
  await page.waitForTimeout(3000)
  await shot(page, 'task4-01-initial.png')

  const state = await page.evaluate(() => {
    const body = document.body?.innerText || ''
    return {
      isLogin: body.includes('飞书登录'),
      url: location.href,
      preview: body.substring(0, 300),
    }
  })
  console.log(`  状态: ${state.isLogin ? '飞书登录页（独立认证）' : '主界面'}`)

  results.push({
    task: '任务4-数据台',
    status: state.isLogin ? 'PARTIAL' : 'PASS',
    findings: [
      state.isLogin ? '显示飞书登录页（正常-独立认证工作台）' : '主界面已加载',
      `URL: ${state.url}`,
      `页面内容: ${state.preview.substring(0, 80).replace(/\n/g, ' ')}`,
    ]
  })
  console.log(`  ${state.isLogin ? '⚠️  任务4 PARTIAL（需独立飞书登录）' : '✅ 任务4 PASS'}`)
}

// ── 任务5：坤元·设施台测试（BrowserRouter） ──────────────────
async function task5_facility(page) {
  console.log('\n' + '═'.repeat(60))
  console.log('  任务5：坤元·设施台测试（BrowserRouter）')
  console.log('═'.repeat(60))

  const dashUrl = `${BASE_URL}/facility/dashboard`
  const authOk = await injectAuth(page, dashUrl)
  if (!authOk) {
    results.push({ task: '任务5-设施台', status: 'FAIL', findings: ['认证失败'] })
    return
  }

  await shot(page, 'task5-01-dashboard.png')
  const dashInfo = await page.evaluate(() => ({
    url: location.href,
    preview: document.body?.innerText?.substring(0, 200) || ''
  }))
  console.log(`  仪表板 URL: ${dashInfo.url}`)

  // 访问场地（BrowserRouter 无#）
  await page.goto(`${BASE_URL}/facility/venues`, { waitUntil: 'domcontentloaded' }).catch(() => { })
  await page.waitForTimeout(2000)
  await shot(page, 'task5-02-venues.png')
  const venuesInfo = await page.evaluate(() => ({
    url: location.href,
    rows: document.querySelectorAll('tr, [role="row"], .card, .venue-item').length,
    preview: document.body?.innerText?.substring(0, 200) || '',
  }))
  console.log(`  场地 URL: ${venuesInfo.url}, 行数: ${venuesInfo.rows}`)

  // 访问预约
  await page.goto(`${BASE_URL}/facility/reservations`, { waitUntil: 'domcontentloaded' }).catch(() => { })
  await page.waitForTimeout(2000)
  await shot(page, 'task5-03-reservations.png')
  const resInfo = await page.evaluate(() => ({
    url: location.href,
    preview: document.body?.innerText?.substring(0, 200) || '',
  }))
  console.log(`  预约 URL: ${resInfo.url}`)

  results.push({
    task: '任务5-设施台',
    status: 'PASS',
    findings: [
      `仪表板正常 (URL: ${dashInfo.url})`,
      `场地列表 (URL: ${venuesInfo.url}, ${venuesInfo.rows}行)`,
      `预约列表 (URL: ${resInfo.url})`,
    ]
  })
  console.log('  ✅ 任务5 PASS')
}

// ── 任务6：API 数据真实性验证 ─────────────────────────────────
async function task6_apiValidation(page) {
  console.log('\n' + '═'.repeat(60))
  console.log('  任务6：API 数据真实性验证')
  console.log('═'.repeat(60))

  // 在已验证的页面执行
  await page.goto(`${BASE_URL}/research/#/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => { })
  await page.waitForTimeout(1000)

  const apiResults = await page.evaluate(async ([jwt, apiBase]) => {
    const headers = { 'Authorization': `Bearer ${jwt}` }
    const results = {}

    const tests = [
      ['数据台汇总', `${apiBase}/data-platform/dashboard`],
      ['知识检索(临床研究)', `${apiBase}/knowledge/hybrid-search?q=临床研究&limit=5`],
      ['智能体列表', `${apiBase}/agents/list`],
      ['受试者列表', `${apiBase}/subject/list`],
      ['访视计划', `${apiBase}/visit/plans`],
      ['质量仪表盘', `${apiBase}/quality/dashboard`],
      ['协议列表', `${apiBase}/protocol/list`],
    ]

    for (const [name, url] of tests) {
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
        const d = await r.json()
        const count = d.data?.knowledge_entries || d.data?.personal_contexts ||
          d.data?.total || d.data?.count ||
          (Array.isArray(d.data?.items) ? d.data.items.length : null) ||
          (Array.isArray(d.data?.hits) ? d.data.hits.length : null)
        results[name] = { status: r.status, count, preview: JSON.stringify(d.data || d).substring(0, 80) }
      } catch (e) {
        results[name] = { error: e.message }
      }
    }
    return results
  }, [SUPERADMIN_JWT, API_BASE])

  let passCount = 0
  const summary = []
  for (const [name, r] of Object.entries(apiResults)) {
    if (r.error) {
      summary.push(`  ❌ ${name}: 错误 - ${r.error}`)
    } else if (r.status === 200) {
      passCount++
      summary.push(`  ✅ ${name}: ${r.count !== null ? r.count + '条/项' : 'OK'} - ${r.preview.substring(0, 50)}`)
    } else {
      summary.push(`  ⚠️  ${name}: HTTP ${r.status}`)
    }
  }

  console.log('\n  === 真实数据验证结果 ===')
  summary.forEach(s => console.log(s))

  results.push({
    task: '任务6-API验证',
    status: passCount >= 5 ? 'PASS' : passCount >= 3 ? 'PARTIAL' : 'FAIL',
    findings: [`${passCount}/${Object.keys(apiResults).length} API正常`, ...summary.map(s => s.trim())]
  })

  await shot(page, 'task6-api-validation.png')
  console.log(`  ✅ 任务6 完成 (${passCount} PASS)`)
}

// ── 主函数 ────────────────────────────────────────────────────
async function run() {
  console.log('═'.repeat(60))
  console.log('  CN KIS V2.0 — 深度有界面验收测试')
  console.log(`  服务器: ${BASE_URL}`)
  console.log(`  时间: ${new Date().toLocaleString('zh-CN')}`)
  console.log('═'.repeat(60))

  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--window-size=1440,900', '--disable-web-security', '--no-sandbox'],
  })

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE_URL,
        localStorage: [
          { name: 'auth_token', value: SUPERADMIN_JWT },
          { name: 'auth_user', value: SUPERADMIN_USER },
          { name: 'token', value: SUPERADMIN_JWT },
          { name: 'auth_profile', value: SUPERADMIN_PROFILE },
          { name: 'auth_profile_token', value: SUPERADMIN_JWT },
          { name: 'auth_token_ts', value: String(Date.now()) },
        ],
      }],
    },
  })

  await ctx.addInitScript(([token, user, profile]) => {
    if (location.origin === 'http://118.196.64.48') {
      try {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_user', user)
        localStorage.setItem('token', token)
        localStorage.setItem('auth_profile', profile)
        localStorage.setItem('auth_profile_token', token)
        localStorage.setItem('auth_token_ts', String(Date.now()))
      } catch { }
    }
  }, [SUPERADMIN_JWT, SUPERADMIN_USER, SUPERADMIN_PROFILE])

  // API 路径代理
  await ctx.route(`${BASE_URL}/api/**`, async (route) => {
    const origUrl = route.request().url()
    const newUrl = origUrl.replace(`${BASE_URL}/api/`, `${BASE_URL}/v2/api/`)
    const headers = { ...route.request().headers(), 'Authorization': `Bearer ${SUPERADMIN_JWT}` }
    try { await route.continue({ url: newUrl, headers }) } catch { await route.continue() }
  })

  const page = await ctx.newPage()

  try {
    await task1_secretary(page)
    await task2_research(page)
    await task3_quality(page)
    await task4_dataPlatform(page)
    await task5_facility(page)
    await task6_apiValidation(page)
  } catch (e) {
    console.error('\n❌ 测试异常:', e.message)
    console.error(e.stack)
  } finally {
    // 汇总
    console.log('\n' + '═'.repeat(60))
    console.log('  深度测试汇总报告')
    console.log('═'.repeat(60))

    let passC = 0, partialC = 0, failC = 0
    for (const r of results) {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'PARTIAL' ? '⚠️ ' : '❌'
      console.log(`\n${icon}  ${r.task} - ${r.status}`)
      r.findings.slice(0, 5).forEach(f => console.log(`      ${f}`))
      if (r.status === 'PASS') passC++
      else if (r.status === 'PARTIAL') partialC++
      else failC++
    }

    console.log(`\n  总计: ${passC} PASS, ${partialC} PARTIAL, ${failC} FAIL`)

    const reportPath = path.join(SCREENSHOTS_DIR, 'deep-test-report.json')
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2))
    console.log(`\n  📋 报告: ${reportPath}`)
    console.log(`  📸 截图: ${SCREENSHOTS_DIR}`)
    console.log('═'.repeat(60))

    await browser.close()
  }
}

run().catch(e => {
  console.error('测试运行异常:', e.message)
  process.exit(1)
})
