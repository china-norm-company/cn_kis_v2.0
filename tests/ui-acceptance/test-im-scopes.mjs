/**
 * 飞书 OAuth scope 验收测试
 * 测试 im:message.group_msg:readonly 和 im:message.p2p_msg:readonly 是否合法
 * 运行：node tests/ui-acceptance/test-im-scopes.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const APP_ID = 'cli_a98b0babd020500e'
const REDIRECT = encodeURIComponent('https://china-norm.com/login')
const SCREENSHOT_DIR = 'tests/ui-acceptance/screenshots-scope-test'

mkdirSync(SCREENSHOT_DIR, { recursive: true })

const TESTS = [
  {
    name: '01-im-scopes-only',
    label: '仅测试两个 IM scope',
    scopes: [
      'offline_access',
      'im:message.group_msg:readonly',
      'im:message.p2p_msg:readonly',
    ],
  },
  {
    name: '02-full-24-scopes',
    label: '完整 24 项 scope（无 minutes）',
    scopes: [
      'offline_access',
      'contact:user.base:readonly',
      'contact:user.email:readonly',
      'contact:user.employee_id:readonly',
      'contact:user.phone:readonly',
      'contact:department.base:readonly',
      'im:chat:readonly',
      'im:message:readonly',
      'im:message.group_msg:readonly',
      'im:message.p2p_msg:readonly',
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
    ],
  },
]

async function runTest(browser, test) {
  const url = `https://open.feishu.cn/open-apis/authen/v1/authorize` +
    `?app_id=${APP_ID}&redirect_uri=${REDIRECT}&response_type=code` +
    `&scope=${encodeURIComponent(test.scopes.join(' '))}`

  console.log(`\n🔍 测试：${test.label}`)
  console.log(`   scope 数量：${test.scopes.length}`)

  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    const screenshotPath = `${SCREENSHOT_DIR}/${test.name}.png`
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`   截图已保存：${screenshotPath}`)

    const bodyText = await page.evaluate(() => document.body.innerText || document.body.textContent || '')
    const pageTitle = await page.title()

    console.log(`   页面标题：${pageTitle}`)
    console.log(`   正文片段：${bodyText.slice(0, 200).replace(/\s+/g, ' ')}`)

    // 判断是否出错
    const hasError = /2004[0-9]|invalid_scope|scope.*error|error.*scope/i.test(bodyText) ||
      bodyText.includes('20043')

    // 判断是否正常显示授权页
    const isAuthPage = /登录|授权|login|authorize|feishu|lark|飞书/i.test(bodyText) ||
      /feishu|lark/i.test(pageTitle)

    if (hasError) {
      const errorMatch = bodyText.match(/\d{5}/)
      console.log(`   ❌ 失败：页面含错误信息，错误码：${errorMatch ? errorMatch[0] : '未知'}`)
      return { passed: false, error: `错误码：${errorMatch ? errorMatch[0] : '页面含错误'}` }
    } else if (isAuthPage) {
      console.log(`   ✅ 通过：页面正常显示飞书授权/登录界面`)
      return { passed: true }
    } else {
      console.log(`   ⚠️  无法判断：页面不包含飞书关键词，可能被重定向`)
      console.log(`      当前 URL：${page.url()}`)
      return { passed: false, error: '页面被重定向或内容无法识别' }
    }
  } finally {
    await page.close()
  }
}

async function main() {
  console.log('=' .repeat(60))
  console.log('  飞书 OAuth Scope Headed 验收测试')
  console.log('=' .repeat(60))

  const browser = await chromium.launch({ headless: false, slowMo: 500 })
  const results = []

  for (const test of TESTS) {
    const result = await runTest(browser, test)
    results.push({ ...test, ...result })
  }

  await browser.close()

  console.log('\n' + '='.repeat(60))
  console.log('  测试结果汇总')
  console.log('='.repeat(60))

  const report = { timestamp: new Date().toISOString(), results: [] }
  let allPassed = true

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`${icon} ${r.label}: ${r.passed ? '通过' : '失败 — ' + r.error}`)
    report.results.push({ name: r.name, label: r.label, passed: r.passed, error: r.error || null })
    if (!r.passed) allPassed = false
  }

  writeFileSync(`${SCREENSHOT_DIR}/scope-test-report.json`, JSON.stringify(report, null, 2))
  console.log(`\n报告已保存：${SCREENSHOT_DIR}/scope-test-report.json`)
  console.log(allPassed ? '\n✅ 所有测试通过，可以部署' : '\n❌ 有测试失败，禁止部署')

  process.exit(allPassed ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
