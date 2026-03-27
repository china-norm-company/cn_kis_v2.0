/**
 * 洞明·数据台 Headed 验收
 *
 * 复用 run-full-acceptance-v5.mjs 的 JWT 注入思路，但只聚焦洞明工作台，
 * 以便快速执行页面验收和核心 API 验收。
 */

import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots-dongming-headed')
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const BASE_URL = process.env.TEST_SERVER || 'http://118.196.64.48'
const API_BASE = `${BASE_URL}/v2/api/v1`

// 复用现有全量验收的超级管理员测试 JWT
// 注：该 JWT 已在后端创建 SessionToken 记录，有效期 365 天（2027-03-22 到期）
const SUPERADMIN_JWT = process.env.SUPERADMIN_JWT || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6ImZlaXNodV9hZDlkNzQ1NjI1YTY1ZGMzIiwiYWNjb3VudF90eXBlIjoiaW50ZXJuYWwiLCJyb2xlcyI6WyJzdXBlcmFkbWluIiwicmVzZWFyY2hfbWFuYWdlciIsInZpZXdlciJdLCJleHAiOjE4MDU3MDQ2NzIsImlhdCI6MTc3NDE2ODY3Mn0.RtdeNSPsix3o--G2SRPUmTERntjrLJLjNS_2ZmVZDwc'
const SUPERADMIN_USER = JSON.stringify({
  id: 1,
  username: 'feishu_ad9d745625a65dc3',
  display_name: '马利民',
  account_type: 'internal',
  roles: ['superadmin', 'research_manager', 'viewer'],
})
const SUPERADMIN_PROFILE = JSON.stringify({
  id: 1,
  username: 'feishu_ad9d745625a65dc3',
  display_name: '马利民',
  email: '',
  avatar: '',
  account_type: 'internal',
  roles: [
    { name: 'superadmin', display_name: '超级管理员', level: 100, category: 'system' },
    { name: 'research_manager', display_name: '研究管理员', level: 80, category: 'business' },
    { name: 'viewer', display_name: '查看者', level: 10, category: 'business' },
  ],
  permissions: ['*'],
  data_scope: 'global',
  visible_workbenches: [
    'secretary', 'research', 'quality', 'finance', 'hr', 'crm', 'execution',
    'recruitment', 'equipment', 'material', 'facility', 'evaluator', 'lab-personnel',
    'ethics', 'reception', 'control-plane', 'governance', 'digital-workforce', 'data-platform',
  ],
  visible_menu_items: {},
})

const PAGES = [
  { id: 'dp-01-dashboard', path: '/data-platform', label: '治理驾驶舱', checks: ['text=治理驾驶舱'] },
  { id: 'dp-02-domains', path: '/data-platform/domains', label: '数据域地图', checks: ['text=数据域地图', 'text=外部源数据域'] },
  { id: 'dp-03-lifecycle', path: '/data-platform/lifecycle', label: '数据生命周期', checks: ['text=数据生命周期'] },
  { id: 'dp-04-external-intake', path: '/data-platform/external-intake', label: '候选接入池', checks: ['text=候选接入'] },
  { id: 'dp-05-raw-sources', path: '/data-platform/raw-sources', label: '原始来源', checks: ['text=原始来源'] },
  { id: 'dp-06-knowledge', path: '/data-platform/knowledge', label: '知识条目', checks: ['text=知识资产'] },
  { id: 'dp-07-sources', path: '/data-platform/sources', label: '知识来源', checks: ['text=知识来源'] },
  { id: 'dp-08-ingest', path: '/data-platform/ingest', label: '内容入库', checks: ['text=入库'] },
  { id: 'dp-09-catalog', path: '/data-platform/catalog', label: '数据目录', checks: ['text=数据目录', 'text=核心表'] },
  { id: 'dp-10-classification', path: '/data-platform/classification', label: '分类分级', checks: ['text=分类'] },
  { id: 'dp-11-quality', path: '/data-platform/quality', label: '数据质量', checks: ['text=质量'] },
  { id: 'dp-12-lineage', path: '/data-platform/lineage', label: '数据血缘图谱', checks: ['text=血缘'] },
  { id: 'dp-13-pipelines', path: '/data-platform/pipelines', label: '同步管道', checks: ['text=管道'] },
  { id: 'dp-14-storage', path: '/data-platform/storage', label: '存储容量', checks: ['text=存储'] },
  { id: 'dp-15-backup', path: '/data-platform/backup', label: '备份状态', checks: ['text=备份'] },
  { id: 'dp-16-topology', path: '/data-platform/topology', label: '服务拓扑', checks: ['text=拓扑'] },
]

const API_CASES = [
  { id: 'api-dashboard', url: `${API_BASE}/data-platform/dashboard` },
  // 验证 10 域结构，包含新字段 domain_type/core_responsibilities/governance_focus
  { id: 'api-domains', url: `${API_BASE}/data-platform/domains`, validate: (body) => {
    const domains = body?.data?.domains ?? []
    if (domains.length !== 10) return `期望 10 个域，实际 ${domains.length} 个`
    const sample = domains[0]
    if (!sample.domain_type) return '缺少 domain_type 字段'
    if (!sample.core_responsibilities?.length) return '缺少 core_responsibilities 字段'
    if (!sample.governance_focus?.length) return '缺少 governance_focus 字段'
    if (!sample.retention_expectation) return '缺少 retention_expectation 字段'
    return null
  }},
  { id: 'api-governance-overview', url: `${API_BASE}/data-platform/governance/overview` },
  { id: 'api-lifecycle-overview', url: `${API_BASE}/data-platform/lifecycle/overview` },
  { id: 'api-lifecycle-stranded', url: `${API_BASE}/data-platform/lifecycle/stranded` },
  { id: 'api-governance-gaps', url: `${API_BASE}/data-platform/governance/gaps` },
  { id: 'api-raw-sources', url: `${API_BASE}/data-platform/raw-sources/overview` },
  { id: 'api-catalog', url: `${API_BASE}/data-platform/catalog/schema` },
  { id: 'api-classification', url: `${API_BASE}/data-platform/classification/registry` },
  { id: 'api-transformation', url: `${API_BASE}/data-platform/knowledge-governance/transformation` },
  { id: 'api-pipelines', url: `${API_BASE}/data-platform/pipelines/schedule` },
  { id: 'api-storage', url: `${API_BASE}/data-platform/storage/stats` },
  { id: 'api-backup', url: `${API_BASE}/data-platform/backup/status` },
  { id: 'api-topology', url: `${API_BASE}/data-platform/topology/health` },
]

async function shot(page, id) {
  const f = path.join(SCREENSHOTS_DIR, `${id}.png`)
  await page.screenshot({ path: f, fullPage: true })
  return f
}

async function isLoginPage(page) {
  try {
    const btn = page.locator('button:has-text("飞书登录"), button:has-text("飞书"), a:has-text("飞书登录")')
    return await btn.count() > 0
  } catch {
    return false
  }
}

async function injectAuth(page) {
  const origin = `${BASE_URL}/data-platform`
  let intercepted = false
  const handler = async (route) => {
    const url = route.request().url()
    if (url.includes('open.feishu') || url.includes('passport.feishu')) {
      intercepted = true
      await route.abort()
    } else {
      await route.continue()
    }
  }

  await page.route('**/*', handler)
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 12000 })
  } catch {}
  await page.waitForTimeout(800)
  await page.unroute('**/*', handler)

  await page.evaluate(([token, user, profile]) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', user)
    localStorage.setItem('token', token)
    localStorage.setItem('auth_profile', profile)
    localStorage.setItem('auth_profile_token', token)
    localStorage.setItem('auth_token_ts', String(Date.now()))
  }, [SUPERADMIN_JWT, SUPERADMIN_USER, SUPERADMIN_PROFILE]).catch(() => {})

  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 })
  } catch {}
  await page.waitForTimeout(2000)

  if (await isLoginPage(page)) {
    return false
  }
  return intercepted || true
}

async function checkApi(page, apiInfo) {
  const raw = await page.evaluate(async ({ url, jwt }) => {
    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await resp.json().catch(() => ({}))
      return {
        ok: resp.ok && (data?.code === 200 || data?.code === undefined),
        status: resp.status,
        code: data?.code,
        msg: data?.msg || '',
        body: data,
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        code: null,
        msg: error?.message || String(error),
        body: null,
      }
    }
  }, { url: apiInfo.url, jwt: SUPERADMIN_JWT })

  // 运行自定义校验函数（如域字段结构验证）
  if (raw.ok && apiInfo.validate) {
    const validateError = apiInfo.validate(raw.body)
    if (validateError) {
      raw.ok = false
      raw.msg = `字段校验失败: ${validateError}`
    }
  }

  return raw
}

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 150 })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await context.newPage()
  const report = {
    executed_at: new Date().toISOString(),
    base_url: BASE_URL,
    pages: [],
    apis: [],
  }

  console.log('\n═════════════════════════════════════════════════════════════════')
  console.log('  洞明·数据台 Headed 验收')
  console.log(`  ${BASE_URL}`)
  console.log('═════════════════════════════════════════════════════════════════\n')

  const authOk = await injectAuth(page)
  console.log(`认证注入: ${authOk ? 'PASS' : 'FAIL'}`)

  for (const api of API_CASES) {
    const result = await checkApi(page, api)
    report.apis.push({ ...api, ...result })
    console.log(`[API] ${api.id}: ${result.ok ? 'PASS' : 'FAIL'} (${result.status}${result.code ? ` / code=${result.code}` : ''})`)
  }

  for (const pageInfo of PAGES) {
    const jsErrors = []
    const handler = (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
          jsErrors.push(text.slice(0, 160))
        }
      }
    }
    page.on('console', handler)

    let ok = true
    let failureReason = ''
    try {
      await page.goto(`${BASE_URL}${pageInfo.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2200)

      if (await isLoginPage(page)) {
        ok = false
        failureReason = '页面回到登录态'
      } else {
        for (const check of pageInfo.checks) {
          try {
            await page.locator(check).first().waitFor({ timeout: 4000 })
          } catch {
            ok = false
            failureReason = `缺少关键元素: ${check}`
            break
          }
        }
      }

      if (ok && jsErrors.length > 0) {
        ok = false
        failureReason = `控制台错误: ${jsErrors[0]}`
      }
    } catch (error) {
      ok = false
      failureReason = error?.message || String(error)
    }

    const screenshot = await shot(page, pageInfo.id)
    report.pages.push({
      ...pageInfo,
      ok,
      failure_reason: failureReason,
      url: page.url(),
      screenshot,
    })
    console.log(`[PAGE] ${pageInfo.id}: ${ok ? 'PASS' : 'FAIL'} ${failureReason ? `- ${failureReason}` : ''}`)
    page.off('console', handler)
  }

  await browser.close()

  const passedPages = report.pages.filter(item => item.ok).length
  const passedApis = report.apis.filter(item => item.ok).length
  report.summary = {
    total_pages: report.pages.length,
    passed_pages: passedPages,
    total_apis: report.apis.length,
    passed_apis: passedApis,
  }

  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'dongming-headed-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  )

  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log(`页面通过: ${passedPages}/${report.pages.length}`)
  console.log(`API 通过: ${passedApis}/${report.apis.length}`)
  console.log(`报告输出: ${path.join(SCREENSHOTS_DIR, 'dongming-headed-report.json')}`)
  console.log('─────────────────────────────────────────────────────────────────\n')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
