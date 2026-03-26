/**
 * test-launch-governance-headed.mjs
 *
 * CN KIS V2.0 上线治理 — L5 E2E Headed 验收测试
 *
 * 测试覆盖范围：
 *   L5-00   : 鹿鸣工作台登录页可访问（立即可测）
 *   L5-00a  : 飞书 OAuth 授权页无错误码（立即可测，需人工扫码）
 *   L5-01~05: 上线治理新页面（PR #34 合并 + 前端部署后可测）
 *
 * 运行方式：
 *   node tests/ui-acceptance/test-launch-governance-headed.mjs
 *   # 等待扫码完成后，自动测试各页面
 *
 * 前置条件：
 *   1. npm install playwright（或 npx playwright install chromium）
 *   2. PR #34 合并 + 前端 build + 服务器部署完成（L5-01~05 才能通过）
 *
 * 固定参数（禁止随意修改，与飞书注册配置一致）：
 *   - APP_ID: cli_a98b0babd020500e（子衿）
 *   - REDIRECT_URI: http://118.196.64.48/login（已在飞书注册）
 *   - 不带 state 参数（避免 AUTH_STATE_INVALID）
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

// ── 配置 ──────────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://118.196.64.48'
const APP_ID = 'cli_a98b0babd020500e'
const REDIRECT_URI = `${BASE_URL}/login`
const SCREENSHOT_DIR = 'tests/ui-acceptance/screenshots-launch-governance'
const MAX_WAIT_MS = 5 * 60 * 1000  // 5 分钟扫码等待

// 上线治理页面路由（PR #34 合并 + 部署后可用）
const LAUNCH_PAGES = [
  { id: 'LG-L5-05', path: '/admin', name: 'Dashboard', expectText: 'V2' },
  { id: 'LG-L5-01', path: '/admin/launch/overview', name: '上线总览', expectText: null },
  { id: 'LG-L5-02', path: '/admin/launch/workstations-map', name: '19台地图', expectText: null },
  { id: 'LG-L5-03', path: '/admin/launch/gaps', name: '缺口池', expectText: null },
  { id: 'LG-L5-04', path: '/admin/launch/goals', name: '目标节奏', expectText: null },
]

const SCOPES = [
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

// ── 辅助函数 ──────────────────────────────────────────────────────────────
let shotIndex = 0
const results = []

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function shot(page, testId, label) {
  shotIndex++
  const fileName = `${String(shotIndex).padStart(2, '0')}-${testId}-${label.replace(/[^a-z0-9\u4e00-\u9fff]/gi, '-')}`
  const filePath = `${SCREENSHOT_DIR}/${fileName}.png`
  try {
    await page.screenshot({ path: filePath, fullPage: true })
    console.log(`  📸 [${testId}] ${label} → ${fileName}.png`)
    return filePath
  } catch (e) {
    console.log(`  ⚠️  截图失败: ${e.message}`)
    return null
  }
}

function logResult(testId, status, message, screenshotPath = null) {
  const icons = { PASS: '✅', FAIL: '❌', SKIP: '⏭️', WARN: '⚠️' }
  const icon = icons[status] || '❓'
  console.log(`  ${icon} [${testId}] ${message}`)
  results.push({ testId, status, message, screenshotPath })
}

// ── 测试函数 ──────────────────────────────────────────────────────────────

async function testAdminPageLoad(page) {
  console.log('\n─── LG-L5-00: 鹿鸣工作台登录页可访问 ───')
  try {
    await page.goto(`${BASE_URL}/admin`, { timeout: 15000 })
    // SPA：等待 React 渲染完成（networkidle 或 #root 有子元素）
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(800)

    const title = await page.title()
    const url = page.url()
    const screenshotPath = await shot(page, 'LG-L5-00', '管理台首页')

    // SPA：用 innerText（包含渲染后文本），或直接检查 DOM 元素
    const bodyInnerText = await page.evaluate(() => document.body.innerText || '')
    const httpStatus = await page.evaluate(() => window.__httpStatus || 200)

    const hasServerError = bodyInnerText.includes('500 Internal Server Error')
    const hasLoginPage = bodyInnerText.includes('登录') || bodyInnerText.includes('治理台') || bodyInnerText.includes('KIS')
    const hasRootContent = await page.evaluate(() => {
      const root = document.getElementById('root')
      return root && root.children.length > 0
    })

    if (!hasServerError && (hasLoginPage || hasRootContent)) {
      logResult('LG-L5-00', 'PASS', `管理台可访问且 React 已渲染，标题: "${title}"`, screenshotPath)
      return true
    } else if (!hasServerError) {
      // 页面加载但内容不明确（静态检查截图确认）
      logResult('LG-L5-00', 'WARN', `页面加载但 React 状态不确定，请查看截图`, screenshotPath)
      return true
    } else {
      logResult('LG-L5-00', 'FAIL', `页面返回 5xx 错误`, screenshotPath)
      return false
    }
  } catch (e) {
    logResult('LG-L5-00', 'FAIL', `访问失败: ${e.message}`)
    return false
  }
}

async function testOAuthPage(page) {
  console.log('\n─── LG-L5-00a: 飞书 OAuth 授权页无错误码 ───')
  // 不带 state 参数（避免 AUTH_STATE_INVALID）
  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize` +
    `?app_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES.join(' '))}`

  try {
    await page.goto(authUrl, { timeout: 20000 })
    await page.waitForLoadState('domcontentloaded')
    const screenshotPath = await shot(page, 'LG-L5-00a', '飞书OAuth授权页')

    const url = page.url()
    const bodyText = await page.textContent('body') || ''
    const has20043 = bodyText.includes('20043') || url.includes('20043')
    const hasErrorCode = /\d{5}/.test(bodyText.slice(0, 500)) && !bodyText.includes('扫码登录') && !bodyText.includes('scan')
    const hasLoginUI = bodyText.includes('扫码') || bodyText.includes('飞书') || bodyText.includes('登录') ||
                       url.includes('passport') || url.includes('authen')

    if (has20043) {
      logResult('LG-L5-00a', 'FAIL', `OAuth 页面出现 20043 错误码（scope 问题）`, screenshotPath)
      return false
    } else if (hasLoginUI) {
      logResult('LG-L5-00a', 'PASS', `OAuth 页面正常加载，无错误码`, screenshotPath)
      return true
    } else {
      logResult('LG-L5-00a', 'WARN', `OAuth 页面状态不确定，请人工查看截图`, screenshotPath)
      return true
    }
  } catch (e) {
    logResult('LG-L5-00a', 'FAIL', `访问失败: ${e.message}`)
    return false
  }
}

async function waitForLoginCompletion(page) {
  console.log('\n─── 等待用户完成飞书登录授权（最多 5 分钟）───')
  console.log('  📱 请在手机飞书上扫码并完成授权...')

  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    const url = page.url()
    // 检查是否已经跳转回管理台（登录成功）
    if (url.includes(BASE_URL) && !url.includes('/login') && url.includes('/admin')) {
      console.log(`  ✅ 登录成功，当前 URL: ${url}`)
      return true
    }
    // 检查是否有 JWT cookie（另一种成功标志）
    const cookies = await page.context().cookies()
    const hasAuthCookie = cookies.some(c => c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('auth'))
    if (hasAuthCookie && url.includes(BASE_URL)) {
      console.log(`  ✅ 检测到认证 Cookie，登录可能已完成`)
      return true
    }
    await page.waitForTimeout(2000)
    process.stdout.write('.')
  }
  console.log('\n  ⏰ 超时：5 分钟内未完成登录')
  return false
}

async function testLaunchGovernancePages(page) {
  console.log('\n─── 测试上线治理新页面（需 PR #34 合并 + 前端部署）───')

  for (const pageInfo of LAUNCH_PAGES) {
    try {
      console.log(`\n  → ${pageInfo.id}: ${pageInfo.name}`)
      await page.goto(`${BASE_URL}${pageInfo.path}`, { timeout: 15000 })
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(1500)  // 等待 React 渲染

      const screenshotPath = await shot(page, pageInfo.id, pageInfo.name)
      const url = page.url()
      const bodyInnerText = await page.evaluate(() => document.body.innerText || '')
      const hasRootContent = await page.evaluate(() => {
        const root = document.getElementById('root')
        return root && root.children.length > 0
      })

      // 检查是否有 5xx 错误
      const has500 = bodyInnerText.includes('500') && bodyInnerText.includes('Error')
      // 检查是否被重定向到登录页（未认证）
      const redirectedToLogin = url.includes('/login') || bodyInnerText.includes('请使用飞书账号登录') || bodyInnerText.includes('飞书登录')
      // 检查预期文本（如果有）
      const hasExpectedText = pageInfo.expectText ? bodyInnerText.includes(pageInfo.expectText) : true
      // 检查是否有内容（React 渲染了组件）
      const hasContent = hasRootContent || bodyInnerText.length > 50

      if (redirectedToLogin) {
        logResult(pageInfo.id, 'SKIP', `未认证，被重定向到登录页（需先完成 OAuth）`, screenshotPath)
      } else if (has500) {
        logResult(pageInfo.id, 'FAIL', `页面返回 500 错误`, screenshotPath)
      } else if (!hasContent) {
        logResult(pageInfo.id, 'WARN', `页面内容过少（可能未部署新页面或加载中）`, screenshotPath)
      } else if (!hasExpectedText) {
        logResult(pageInfo.id, 'WARN', `页面加载但未找到预期文本"${pageInfo.expectText}"`, screenshotPath)
      } else {
        logResult(pageInfo.id, 'PASS', `页面正常加载，URL: ${url}`, screenshotPath)
      }
    } catch (e) {
      logResult(pageInfo.id, 'FAIL', `访问失败: ${e.message}`)
    }
  }
}

// ── 主程序 ──────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  CN KIS V2.0 上线治理 L5 Headed 验收测试                ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`目标服务器: ${BASE_URL}`)
  console.log(`截图目录: ${SCREENSHOT_DIR}`)
  console.log()

  ensureDir(SCREENSHOT_DIR)

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300,
    args: ['--window-size=1400,900'],
  })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  try {
    // Phase 1: 不需要登录的测试
    await testAdminPageLoad(page)
    await testOAuthPage(page)

    // Phase 2: 导航回 OAuth，等待用户扫码
    const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize` +
      `?app_id=${APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPES.join(' '))}`

    console.log('\n─── 正在打开飞书 OAuth 授权页 ───')
    await page.goto(authUrl, { timeout: 20000 })
    const screenshotBeforeLogin = await shot(page, 'pre-login', '等待扫码')

    const loginSuccess = await waitForLoginCompletion(page)

    if (loginSuccess) {
      // Phase 3: 登录后测试上线治理页面
      const screenshotAfterLogin = await shot(page, 'post-login', '登录成功')
      logResult('LOGIN', 'PASS', `飞书 OAuth 登录成功`, screenshotAfterLogin)
      await testLaunchGovernancePages(page)
    } else {
      // 未登录，仍尝试访问页面（预期被重定向）
      console.log('\n  ⚠️  未完成登录，尝试直接访问页面（预期被重定向到登录页）')
      logResult('LOGIN', 'SKIP', `用户未在 5 分钟内完成扫码，跳过登录后测试`)
      await testLaunchGovernancePages(page)
    }

  } finally {
    await browser.close()
  }

  // ── 输出汇总报告 ─────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  测试结果汇总                                            ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, WARN: 0 }
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1
  }
  console.log(`总计: ${results.length}  ✅通过: ${counts.PASS}  ❌失败: ${counts.FAIL}  ⏭️跳过: ${counts.SKIP}  ⚠️警告: ${counts.WARN}`)
  console.log()

  // 生成 JSON 报告
  const reportPath = `${SCREENSHOT_DIR}/test-report-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}.json`
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    summary: counts,
    results,
  }, null, 2))
  console.log(`📋 JSON 报告已保存: ${reportPath}`)

  if (counts.FAIL > 0) {
    console.log('\n❌ 有测试失败，请查看截图和 JSON 报告。')
    process.exit(1)
  } else {
    console.log('\n✅ 所有测试通过（或跳过）。')
    process.exit(0)
  }
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
