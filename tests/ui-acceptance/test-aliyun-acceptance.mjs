/**
 * 阿里云测试环境验收测试
 * 目标：http://106.14.119.61/
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = 'http://106.14.119.61'
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-aliyun-acceptance')

mkdirSync(SCREENSHOT_DIR, { recursive: true })

let shotIndex = 0
async function shot(page, label) {
  shotIndex++
  const fname = `${String(shotIndex).padStart(2, '0')}-${label.replace(/[^a-z0-9\u4e00-\u9fff]/gi, '-')}`
  const fpath = path.join(SCREENSHOT_DIR, `${fname}.png`)
  await page.screenshot({ path: fpath, fullPage: true })
  console.log(`  📸 [${label}] → ${fname}.png`)
  return fpath
}

async function main() {
  console.log('='.repeat(70))
  console.log('  阿里云测试环境验收测试')
  console.log(`  目标 URL: ${BASE_URL}`)
  console.log(`  时间: ${new Date().toLocaleString('zh-CN')}`)
  console.log('='.repeat(70))

  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] })
  const ctx = await browser.newContext({ viewport: null })
  const page = await ctx.newPage()

  const consoleErrors = []
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', err => consoleErrors.push(`未捕获: ${err.message}`))

  const report = { frontend_ok: false, api_ok: false, login_ok: false, errors: [], steps: [] }

  try {
    // ── 步骤 1: 主页 ──────────────────────────────────────────
    console.log('\n[1] 打开主页...')
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    const url1 = page.url()
    const title1 = await page.title()
    console.log(`  URL: ${url1}`)
    console.log(`  标题: ${title1}`)
    await shot(page, '01-主页')
    report.frontend_ok = true
    report.steps.push({ step: 1, url: url1, title: title1, ok: true })

    // ── 步骤 2: 检查登录页面 ─────────────────────────────────
    console.log('\n[2] 检查登录/认证状态...')
    // 检查是否有登录相关元素
    const loginElems = await page.locator('button, a, input').evaluateAll(els =>
      els.filter(el => /登录|login|授权|oauth|飞书/i.test(el.textContent || el.value || el.placeholder || el.href || ''))
        .map(el => ({ tag: el.tagName, text: el.textContent?.trim().substring(0, 30) }))
    )
    console.log(`  找到登录相关元素: ${loginElems.length} 个`)
    loginElems.forEach(el => console.log(`    <${el.tag}> ${el.text}`))
    await shot(page, '02-登录状态')

    // 如果页面有登录按钮，尝试点击
    const feishuBtn = page.locator('button, a').filter({ hasText: /登录|飞书|授权/i }).first()
    if (await feishuBtn.count() > 0) {
      console.log('  → 发现登录按钮，尝试点击...')
      await feishuBtn.click()
      await page.waitForTimeout(3000)
      const urlAfterClick = page.url()
      console.log(`  点击后 URL: ${urlAfterClick}`)
      await shot(page, '03-点击登录后')
      report.login_ok = true
      // 回到主页
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(1000)
    }

    // ── 步骤 3: API 检查 ─────────────────────────────────────
    console.log('\n[3] 检查 API 端点...')
    const endpoints = ['/api/', '/api/v1/', '/api/v1/health/']
    for (const ep of endpoints) {
      try {
        const resp = await page.goto(BASE_URL + ep, { timeout: 10000 })
        const status = resp?.status() || 0
        const body = await page.evaluate(() => document.body?.innerText?.substring(0, 150) || '')
        console.log(`  ${ep} → HTTP ${status}: ${body.replace(/\n/g, ' ')}`)
        if (status > 0 && status < 500) report.api_ok = true
        await shot(page, `04-api${ep.replace(/\//g, '-')}`)
      } catch (e) {
        console.log(`  ${ep} → 失败: ${e.message}`)
      }
    }

    // ── 步骤 4: 返回主页最终截图 ────────────────────────────
    console.log('\n[4] 返回主页最终状态...')
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    await shot(page, '05-最终状态')

  } catch (err) {
    console.error('\n  ✗ 测试异常：', err.message)
    report.errors.push(err.message)
    await shot(page, '99-异常').catch(() => {})
  } finally {
    // ── 报告 ────────────────────────────────────────────────
    report.console_errors = consoleErrors.length
    console.log('\n' + '='.repeat(70))
    console.log('验收测试结果：')
    console.log(`  前端部署: ${report.frontend_ok ? '✅ 正常' : '❌ 异常'}`)
    console.log(`  API 后端: ${report.api_ok ? '✅ 在线' : '⚠️  404/未知'}`)
    console.log(`  登录流程: ${report.login_ok ? '✅ 找到登录入口' : '⚠️  未检测到登录按钮'}`)
    console.log(`  控制台错误: ${consoleErrors.length} 条`)
    if (consoleErrors.length > 0) {
      consoleErrors.slice(0, 3).forEach(e => console.log(`    - ${e.substring(0, 100)}`))
    }
    if (report.errors.length > 0) {
      console.log(`  脚本错误: ${report.errors.join('; ')}`)
    }
    console.log('='.repeat(70))
    console.log(`📸 截图保存在: ${SCREENSHOT_DIR}`)

    writeFileSync(path.join(SCREENSHOT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    console.log('等待 5 秒后关闭浏览器...')
    await page.waitForTimeout(5000)
    await browser.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
