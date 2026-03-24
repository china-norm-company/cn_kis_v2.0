/**
 * 飞书 OAuth scope 验收测试 v2
 *
 * 重要说明：
 * =========
 * 飞书 OAuth 授权页面分两个阶段：
 * 1. 登录页（扫码/账密）→ v1 测试只验证了这一步，是错误的！
 * 2. 授权/同意页（权限列表）→ 20043 错误出现在这一步
 *
 * 由于第 2 步需要真实用户扫码登录，无法完全自动化。
 * 本测试验证：
 * a) OAuth URL 中的 scope 字符串格式合法（不含已知应用级权限）
 * b) 登录页能正常加载（URL 有效，非 4xx/5xx）
 * c) 列出当前 scope 清单与已知问题 scope 的对比报告
 *
 * 人工验收补充步骤（自动化无法替代）：
 * - 用户用飞书扫码登录后，确认授权页面正常展示（无 20043 错误）
 * - 截图存档到 screenshots-scope-test/manual/
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const APP_ID = 'cli_a98b0babd020500e'
const REDIRECT = encodeURIComponent('https://china-norm.com/login')
const SCREENSHOT_DIR = 'tests/ui-acceptance/screenshots-scope-test'

mkdirSync(SCREENSHOT_DIR, { recursive: true })

// 已知应用级权限（不能放在用户 OAuth scope，否则 20043）
const KNOWN_APP_LEVEL_SCOPES = [
  'im:message.group_msg:readonly',  // 错误码 20043 已验证
  'im:message.group_msg',           // 同上
  'im:message.p2p_msg:readonly',    // 错误码 20043 已验证
  'im:message.p2p_msg',             // 同上
  'minutes:media:readonly',         // 错误码 20043 已验证
]

// 当前完整 scope 列表（22 项，已移除 3 个应用级 scope）
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

async function main() {
  console.log('='.repeat(60))
  console.log('  飞书 OAuth Scope 验收测试 v2')
  console.log('='.repeat(60))

  // 1. 静态检查：当前 scope 列表是否含已知问题 scope
  console.log('\n【静态检查】当前 scope 列表是否含已知应用级权限')
  let hasProblematic = false
  for (const s of CURRENT_SCOPES) {
    if (KNOWN_APP_LEVEL_SCOPES.includes(s)) {
      console.log(`  ❌ 含已知问题 scope: ${s}`)
      hasProblematic = true
    }
  }
  if (!hasProblematic) {
    console.log('  ✅ 静态检查通过：无已知问题 scope')
  }

  const testUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize` +
    `?app_id=${APP_ID}&redirect_uri=${REDIRECT}&response_type=code` +
    `&scope=${encodeURIComponent(CURRENT_SCOPES.join(' '))}`

  // 2. Headed 浏览器验证（仅能验证登录页加载）
  console.log('\n【Headed 测试】验证 OAuth URL 可访问（登录页）')
  console.log('⚠️  注意：20043 错误出现在登录后的授权页，需人工扫码登录后截图验收！')

  const browser = await chromium.launch({ headless: false, slowMo: 500 })
  const page = await browser.newPage()

  try {
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const screenshotPath = `${SCREENSHOT_DIR}/22-scopes-login-page.png`
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`  截图：${screenshotPath}`)

    const title = await page.title()
    const bodyText = (await page.evaluate(() => document.body.innerText || '')).slice(0, 200)
    console.log(`  页面标题：${title}`)
    console.log(`  页面内容：${bodyText.replace(/\s+/g, ' ')}`)

    const isLoginPage = /登录|login|feishu|lark/i.test(title + bodyText)
    const hasError = /20043|invalid_scope/i.test(bodyText)

    if (hasError) {
      console.log('  ❌ 登录页已含错误信息（20043）')
    } else if (isLoginPage) {
      console.log('  ✅ 登录页正常加载')
    }
  } finally {
    await browser.close()
  }

  // 3. 输出完整报告
  const report = {
    timestamp: new Date().toISOString(),
    scope_count: CURRENT_SCOPES.length,
    scopes: CURRENT_SCOPES,
    static_check_passed: !hasProblematic,
    removed_scopes: [
      { scope: 'im:message.group_msg:readonly', reason: '应用级权限，不可用于用户 OAuth，错误码 20043' },
      { scope: 'im:message.p2p_msg:readonly', reason: '应用级权限，不可用于用户 OAuth，错误码 20043' },
      { scope: 'minutes:media:readonly', reason: 'Scope 名称不存在，错误码 20043' },
    ],
    manual_test_required: '需要人工扫码登录后，确认授权页面无 20043 错误并截图存档至 screenshots-scope-test/manual/',
    oauth_url: testUrl,
  }

  writeFileSync(`${SCREENSHOT_DIR}/scope-test-report-v2.json`, JSON.stringify(report, null, 2))

  console.log('\n' + '='.repeat(60))
  console.log('  测试总结')
  console.log('='.repeat(60))
  console.log(`scope 总数：${CURRENT_SCOPES.length} 项`)
  console.log(`静态检查：${!hasProblematic ? '✅ 通过' : '❌ 失败'}`)
  console.log('登录页加载：见截图')
  console.log('\n⚠️  必须补充人工验收：')
  console.log('   1. 打开 URL：', testUrl.slice(0, 80) + '...')
  console.log('   2. 用飞书 App 扫码登录')
  console.log('   3. 截图授权页面（确认无 20043 错误）')
  console.log('   4. 将截图存入 tests/ui-acceptance/screenshots-scope-test/manual/')
  console.log('\n报告：', `${SCREENSHOT_DIR}/scope-test-report-v2.json`)
}

main().catch(e => { console.error(e); process.exit(1) })
