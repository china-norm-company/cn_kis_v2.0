/**
 * 飞书 OAuth 完整授权流程验收测试 v4
 *
 * 测试规范（强制）：
 * - 完整走完：扫码登录 → (授权同意页 →) redirect_uri 接收 code → SPA 处理 → 工作台
 * - 不带 state 参数（与 batch_refresh_tokens / tasks.py 一致，避免 AUTH_STATE_INVALID）
 * - redirect_uri 使用已在飞书注册的 IP 地址（china-norm.com 尚未注册）
 * - 等待最多 5 分钟，给用户充足操作时间
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const APP_ID = 'cli_a98b0babd020500e'
// ✅ 已在飞书注册的 redirect_uri（IP 地址）
// 参考：tests/ui-acceptance/run-ui-tests.mjs 注释 & ops/scripts_v1/test_arch_restructure_acceptance.py
const REDIRECT_URI = 'http://118.196.64.48/login'
const SCREENSHOT_DIR = 'tests/ui-acceptance/screenshots-scope-test/full-auth'
const TIMEOUT_MS = 5 * 60 * 1000  // 5 分钟

mkdirSync(SCREENSHOT_DIR, { recursive: true })

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

// ✅ 不带 state（避免 AUTH_STATE_INVALID），与现有工作的测试脚本一致
const AUTH_URL = `https://open.feishu.cn/open-apis/authen/v1/authorize` +
  `?app_id=${APP_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(CURRENT_SCOPES.join(' '))}`

let shotIndex = 0
async function shot(page, label) {
  shotIndex++
  const fname = `${String(shotIndex).padStart(2, '0')}-${label.replace(/[^a-z0-9\u4e00-\u9fff]/gi, '-')}`
  const fpath = `${SCREENSHOT_DIR}/${fname}.png`
  await page.screenshot({ path: fpath, fullPage: true })
  console.log(`  📸 [${label}] → ${fname}.png`)
  return fpath
}

/** 轮询等待 URL 满足条件 */
async function waitForUrlMatch(page, predicate, timeoutMs, desc) {
  console.log(`  ⏳ 等待：${desc}（最多 ${timeoutMs / 1000}s）`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const url = page.url()
    if (predicate(url)) return url
    await page.waitForTimeout(500)
  }
  return null
}

/** 检查页面是否含错误文字，返回错误文字或 null */
async function checkPageError(page) {
  const text = await page.evaluate(() => document.body ? (document.body.innerText || '') : '').catch(() => '')
  const patterns = [
    /错误码[：:\s]*(\d{4,5})/,
    /AUTH_STATE_INVALID/,
    /AUTH_WORKSTATION_MISMATCH/,
    /认证失败/,
    /登录失败/,
    /授权失败/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[0]
  }
  return null
}

async function main() {
  console.log('='.repeat(65))
  console.log('  飞书 OAuth 完整授权流程验收测试 v4')
  console.log(`  scope 数量：${CURRENT_SCOPES.length}  |  超时：5 分钟`)
  console.log(`  redirect_uri：${REDIRECT_URI}`)
  console.log('='.repeat(65))

  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] })
  const ctx = await browser.newContext({ viewport: null })
  const page = await ctx.newPage()

  const report = {
    timestamp: new Date().toISOString(),
    scopes: CURRENT_SCOPES,
    redirect_uri: REDIRECT_URI,
    steps: [],
    passed: false,
    error: null,
  }

  try {
    // ── 阶段 1：打开授权 URL ────────────────────────────────────────────────
    console.log('\n[阶段 1] 打开 OAuth 授权 URL')
    await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForUrlMatch(page, u => u.includes('accounts.feishu.cn'), 15000, '落在飞书登录页')
    await page.waitForTimeout(1500)
    const s1 = await shot(page, '飞书扫码登录页')
    console.log(`  URL: ${page.url()}`)
    report.steps.push({ step: 1, desc: '飞书登录页已加载', url: page.url(), shot: s1 })

    // ── 阶段 2：等待用户扫码 ────────────────────────────────────────────────
    console.log('\n[阶段 2] 等待用户扫码登录...')
    console.log('  ➡️  请用飞书 App 扫描屏幕上的二维码')

    const urlLeft = await waitForUrlMatch(
      page,
      u => !u.includes('accounts.feishu.cn'),
      TIMEOUT_MS,
      '用户扫码完成，URL 离开登录页'
    )

    if (!urlLeft) {
      await shot(page, '超时-未扫码')
      report.error = '超时：用户未在 5 分钟内完成扫码'
      console.log('  ⏰ 超时，用户未扫码')
      return
    }

    console.log(`  ✅ 扫码完成，跳转至：${urlLeft}`)
    await shot(page, '扫码后即时截图')

    // ── 阶段 3：处理授权同意页（首次授权时出现）─────────────────────────
    if (urlLeft.includes('open.feishu.cn')) {
      const s3 = await shot(page, '授权同意页-关键截图')
      console.log('\n[阶段 3] ✅ 进入授权同意页（含 scope 列表）')
      console.log('  ➡️  请在页面上点击「授权」按钮')
      report.steps.push({ step: 3, desc: '授权同意页', url: urlLeft, shot: s3 })

      const afterConsent = await waitForUrlMatch(
        page,
        u => !u.includes('open.feishu.cn') && !u.includes('accounts.feishu.cn'),
        TIMEOUT_MS,
        '用户点击授权，等待跳转'
      )
      if (!afterConsent) {
        await shot(page, '超时-未点击授权')
        report.error = '超时：用户未在 5 分钟内点击授权'
        console.log('  ⏰ 超时，用户未点击授权')
        return
      }
      console.log(`  ✅ 授权完成，跳转至：${afterConsent}`)
    }

    // ── 阶段 4：等待 SPA 处理 code（消费 code= 并换 token）──────────────
    console.log('\n[阶段 4] 等待 SPA 处理 OAuth code...')
    // SPA 通常在 3-8 秒内完成 code 交换并跳转到工作台
    const spaDeadline = Date.now() + 12000
    let finalUrl = page.url()
    while (Date.now() < spaDeadline) {
    await page.waitForTimeout(1000)
    finalUrl = page.url()
      // 已离开 /login 页面 → SPA 处理完成并跳转到工作台
      if (!finalUrl.includes('/login')) break
      // 检查页面有无错误文字（登录失败等），捕获导航期间的 null body
      const err = await checkPageError(page)
      if (err) break
    }

    console.log(`  最终 URL: ${finalUrl}`)
    const s4 = await shot(page, '最终状态-SPA处理后')
    const pageErr = await checkPageError(page)
    report.steps.push({ step: 4, desc: '最终状态', url: finalUrl, shot: s4 })

    if (pageErr) {
      // 有错误文字 → 额外截图记录
      const se = await shot(page, `错误详情`)
      report.passed = false
      report.error = pageErr
      console.log(`\n  ❌ 失败：${pageErr}`)
      report.steps.push({ step: 'error', desc: pageErr, url: finalUrl, shot: se })
    } else if (finalUrl.includes('/login#/')) {
      // secretary 工作台住在 /login，登录后 hash 变为 #/portal 等路由 → 认证成功
      report.passed = true
      console.log(`  ✅ 成功进入秘书台工作台（HashRouter）：${finalUrl}`)
    } else if (finalUrl.includes('/login') && !finalUrl.includes('?code=')) {
      // URL 含 /login 但无 ?code= 且无错误 → code 已消费，等待 SPA 跳转
      report.passed = false
      report.error = '停留在 /login 页面（无 hash 路由），未成功跳转到工作台'
      console.log(`  ⚠️  ${report.error}`)
    } else {
      report.passed = true
      console.log(`  ✅ 成功进入工作台：${finalUrl}`)
    }

  } catch (err) {
    console.error('\n  ❌ 测试异常：', err.message)
    await shot(page, '异常截图').catch(() => {})
    report.error = `测试异常：${err.message}`
  } finally {
    writeFileSync(`${SCREENSHOT_DIR}/full-auth-report.json`, JSON.stringify(report, null, 2))

    console.log('\n' + '='.repeat(65))
    console.log(report.passed
      ? `  ✅ 测试通过，成功进入工作台`
      : `  ❌ 测试失败：${report.error}`)
    console.log(`  截图目录：${SCREENSHOT_DIR}/`)
    console.log('='.repeat(65))

    if (report.passed) {
      console.log('\n  🔍 浏览器保持打开，请查看工作台。按 Ctrl+C 退出。')
      // 保持进程存活，让浏览器窗口留着供查看
      await new Promise(() => {})
    } else {
      await browser.close()
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
