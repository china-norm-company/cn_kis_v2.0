/**
 * 研究台全功能页面测试 v2（token 注入版，无需手动扫码）
 * 运行方式：node tests/ui-acceptance/test-research-full.mjs
 */
import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots-research-full')
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
// 清空旧截图
fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png')).forEach(f =>
  fs.unlinkSync(path.join(SCREENSHOTS_DIR, f))
)

const BASE_URL = 'http://localhost:3002'
const BACKEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../backend')

const PAGES = [
  { id: '01-workbench',        name: '我的工作台',          path: '/research/#/workbench' },
  { id: '02-weekly',           name: '周报',                path: '/research/#/weekly' },
  { id: '03-weekly-tasks',     name: '周报-我的任务',       path: '/research/#/weekly/tasks' },
  { id: '04-weekly-projects',  name: '周报-项目列表',       path: '/research/#/weekly/projects' },
  { id: '05-manager',          name: '管理驾驶舱',          path: '/research/#/manager' },
  { id: '06-portfolio',        name: '项目组合',            path: '/research/#/portfolio' },
  { id: '07-clients',          name: '我的客户',            path: '/research/#/clients' },
  { id: '08-business',         name: '商务管线',            path: '/research/#/business' },
  { id: '09-proposal-design',  name: '方案设计准备',        path: '/research/#/proposal-design' },
  { id: '10-protocols',        name: '我的协议',            path: '/research/#/protocols' },
  { id: '11-feasibility',      name: '可行性评估',          path: '/research/#/feasibility' },
  { id: '12-proposals',        name: '试验方案准备',        path: '/research/#/proposals' },
  { id: '13-quality-check',    name: '方案质量检查',        path: '/research/#/proposals/quality-check' },
  { id: '14-image-face',       name: '脸部图像分析',        path: '/research/#/image-analysis/face' },
  { id: '15-image-lip',        name: '唇部图像分析',        path: '/research/#/image-analysis/lip' },
  { id: '16-lip-scaliness',    name: '唇部脱屑标记分析',   path: '/research/#/image-analysis/lip/scaliness' },
  { id: '17-data-statistics',  name: '数据统计分析',        path: '/research/#/data-statistics' },
  { id: '18-data-report',      name: '数据报告准备',        path: '/research/#/data-report-preparation' },
  { id: '19-trial-report',     name: '试验报告准备',        path: '/research/#/trial-report-preparation' },
  { id: '20-closeout',         name: '结项管理',            path: '/research/#/closeout' },
  { id: '21-closeout-settle',  name: '绩效结算',            path: '/research/#/closeout/settlement' },
  { id: '22-changes',          name: '变更管理',            path: '/research/#/changes' },
  { id: '23-tasks',            name: '任务委派',            path: '/research/#/tasks' },
  { id: '24-visits',           name: '我的访视',            path: '/research/#/visits' },
  { id: '25-subjects',         name: '我的受试者',          path: '/research/#/subjects' },
  { id: '26-data-monitor',     name: '数据采集监察',        path: '/research/#/data-collection-monitor' },
  { id: '27-team',             name: '团队全景',            path: '/research/#/team' },
  { id: '28-knowledge',        name: '知识库',              path: '/research/#/knowledge' },
  { id: '29-ai-assistant',     name: 'AI 助手',             path: '/research/#/ai-assistant' },
  { id: '30-overview',         name: '研究概览',            path: '/research/#/overview' },
  { id: '31-notifications',    name: '通知收件箱',          path: '/research/#/notifications' },
]

const results = []
let consoleErrors = []

/** 通过 Django shell 生成 24h 有效的 JWT，注入 localStorage，绕过飞书扫码 */
function generateToken() {
  const out = execSync(
    `cd "${BACKEND_DIR}" && python3 /tmp/gen_test_token.py 2>/dev/null`,
    { encoding: 'utf8', timeout: 15000 }
  )
  const line = out.split('\n').find(l => l.trim().startsWith('{'))
  if (!line) throw new Error('Token 生成失败: ' + out)
  return JSON.parse(line.trim())
}

async function shot(page, id, suffix = '') {
  const f = path.join(SCREENSHOTS_DIR, `${id}${suffix}.png`)
  await page.screenshot({ path: f, fullPage: false })
  return f
}

function isFeishuPage(url) {
  return url.includes('passport.feishu') || url.includes('passport.larksuite') || url.includes('feishu.cn/suite/passport')
}

async function run() {
  console.log('\n' + '═'.repeat(65))
  console.log('  研究台全功能测试')
  console.log(`  目标：${BASE_URL}/research/`)
  console.log(`  页面数：${PAGES.length}`)
  console.log('═'.repeat(65))

  const browser = await chromium.launch({ headless: false, args: ['--window-size=1440,900', '--lang=zh-CN'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await ctx.newPage()

  // ─── 阶段一：进入研究台（DEV_AUTH_BYPASS=1）────────────────────
  console.log('\n─── 阶段一：进入研究台（DEV_AUTH_BYPASS=1 已启用）──────────')
  
  await page.goto(`${BASE_URL}/research/`, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(3000)
  await shot(page, 'login-01-entry')
  
  // 导航到工作台
  await page.goto(`${BASE_URL}/research/#/workbench`, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(2000)
  await shot(page, 'login-02-workbench')
  
  const bodyCheck = await page.evaluate(() => document.body?.innerText || '').catch(() => '')
  const loginBtn = await page.locator('button:has-text("飞书登录")').count()
  
  if (loginBtn > 0 || bodyCheck.includes('请使用飞书')) {
    console.log('  ⚠️  仍显示登录页，将继续测试（页面会显示登录态不足）')
  } else {
    console.log(`  ✅ 成功进入研究台（开发绕过模式）！URL：${page.url()}`)
  }

  // ─── 阶段二：逐页测试 ──────────────────────────────────────────
  console.log('\n─── 阶段二：页面测试 ─────────────────────────────────────────')
  console.log(`  ${'页面名称'.padEnd(20)} 状态`)
  console.log('  ' + '─'.repeat(55))

  for (const pg of PAGES) {
    consoleErrors = []
    const onError = msg => {
      if (msg.type() === 'error') {
        const t = msg.text()
        if (!t.includes('favicon') && !t.includes('net::ERR_ABORTED') && !t.includes('net::ERR_FAILED')) {
          consoleErrors.push(t.slice(0, 200))
        }
      }
    }
    page.on('console', onError)

    const url = `${BASE_URL}${pg.path}`
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 })
    } catch (e) { /* timeout ok */ }
    await page.waitForTimeout(2000)

    page.off('console', onError)

    // 检查是否被踢回登录
    const curUrl = page.url()
    if (isFeishuPage(curUrl)) {
      console.log(`  ${pg.name.padEnd(20)} 🔐 登录态丢失，测试中止`)
      PAGES.slice(PAGES.indexOf(pg) + 1).forEach(p => results.push({ ...p, status: '⏭ 跳过' }))
      break
    }

    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '')
    const html = await page.evaluate(() => document.body?.innerHTML || '').catch(() => '')

    const isBlank = bodyText.trim().length < 30
    const has500 = /5\d{2}[\s\n]/.test(bodyText) || html.includes('Internal Server Error')
    const has404 = bodyText.includes('404') || bodyText.includes('Not Found')
    const hasPermDenied = bodyText.includes('权限不足') || bodyText.includes('缺少权限') || bodyText.includes('没有权限')
    const hasUnhandledErr = html.includes('Uncaught') || html.includes('Error: ')

    let status, note
    if (isBlank) {
      status = '❌ 白屏'
      note = '页面无内容'
    } else if (has500) {
      status = '❌ 500错误'
      note = '服务器错误'
    } else if (has404) {
      status = '❌ 404错误'
      note = '页面不存在'
    } else if (hasPermDenied) {
      status = '❌ 权限不足'
      note = bodyText.slice(0, 80).trim()
    } else if (hasUnhandledErr) {
      status = '⚠️  JS错误'
      note = '页面有未捕获异常'
    } else if (consoleErrors.length > 0) {
      status = '⚠️  控制台错误'
      note = `×${consoleErrors.length}个错误`
    } else if (bodyText.trim().length < 100) {
      status = '⚠️  内容较少'
      note = '可能为开发中/空列表'
    } else {
      status = '✅ 正常'
      note = ''
    }

    await shot(page, pg.id)
    results.push({ ...pg, status, note, consoleErrors: consoleErrors.slice(0, 2) })

    const statusLine = `  ${pg.name.padEnd(20)} ${status}${note ? '  ' + note : ''}`
    console.log(statusLine)
    if (consoleErrors.length > 0 && status !== '✅ 正常') {
      consoleErrors.slice(0, 1).forEach(e => console.log(`    🔴 ${e.slice(0, 100)}`))
    }
  }

  // ─── 阶段三：汇总报告 ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(65))
  console.log('  测试汇总报告')
  console.log('═'.repeat(65))

  const normal = results.filter(r => r.status.startsWith('✅'))
  const warn   = results.filter(r => r.status.startsWith('⚠️'))
  const error  = results.filter(r => r.status.startsWith('❌'))
  const skip   = results.filter(r => r.status.startsWith('⏭'))

  console.log(`\n  ✅ 正常加载：  ${normal.length} 页`)
  console.log(`  ⚠️  有警告：    ${warn.length} 页`)
  console.log(`  ❌ 有错误：    ${error.length} 页`)
  console.log(`  ⏭  跳过：      ${skip.length} 页`)

  if (error.length + warn.length > 0) {
    console.log('\n─── 需要关注的问题 ──────────────────────────────────────────')
    ;[...error, ...warn].forEach(r => {
      console.log(`\n  【${r.name}】(${r.path})`)
      console.log(`    状态：${r.status}`)
      if (r.note) console.log(`    详情：${r.note}`)
      if (r.consoleErrors?.length) {
        r.consoleErrors.forEach(e => console.log(`    错误：${e.slice(0, 120)}`))
      }
    })
  }

  const reportPath = path.join(SCREENSHOTS_DIR, 'report.json')
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { normal: normal.length, warn: warn.length, error: error.length, skip: skip.length },
    results: results.map(r => ({ name: r.name, path: r.path, status: r.status, note: r.note }))
  }, null, 2))

  console.log(`\n  📁 截图目录：${SCREENSHOTS_DIR}`)
  console.log(`  📋 JSON报告：${reportPath}`)

  console.log('\n  10 秒后自动关闭浏览器...')
  await page.waitForTimeout(10000)
  await ctx.close()
  await browser.close()
  console.log('\n  测试完成！\n')
}

run().catch(e => {
  console.error('\n❌ 测试脚本异常：', e.message)
  process.exit(1)
})
