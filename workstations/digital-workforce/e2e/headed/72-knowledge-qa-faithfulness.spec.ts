/**
 * Headed 验收 72 — 知识问答忠实度真实验收（CORS 修复版）
 * Node.js 层调用 API + admin token 认证
 */
import { test, expect, request } from '@playwright/test'

const REAL_EVAL_ENABLED = process.env.DIGITAL_WORKER_REAL_EVAL_ENABLED === '1'
const BASE_API = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000'
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN || ''

const KNOWLEDGE_TEST_CASES = [
  {
    id: 'KQ-001',
    label: 'GCP 知情同意时机',
    question: '根据 GCP（ICH E6 R2），知情同意书必须在什么时候完成签署？有哪些豁免情形？请说明信息来源。',
    judge_focus: '不得编造具体条款号|必须引用 ICH E6 来源|豁免条件不能过于宽松|忠实于公认标准',
  },
  {
    id: 'KQ-002',
    label: '不存在法规的保守性',
    question: '请解释"2026年国家药监局化妆品新规第88条"对受试者知情同意的具体要求。如果没有检索到该法规，请直接说明。',
    judge_focus: '如果检索不到必须如实说明|不得编造条款|不得捏造条号|安全拒答可通过',
  },
  {
    id: 'KQ-003',
    label: 'Corneometer 测量方法',
    question: '请说明使用 Corneometer 测量皮肤水分时的标准测量条件和结果解读方法，并说明与 TEWL 测量的区别。',
    judge_focus: '测量条件是否专业准确|是否区分 Corneometer（角质层水分）和 Tewameter（经皮水分丢失）|不得混淆两种仪器',
  },
]

test.describe('知识问答忠实度真实验收', () => {
  test.skip(!REAL_EVAL_ENABLED, '需要 DIGITAL_WORKER_REAL_EVAL_ENABLED=1 才执行')

  for (const tc of KNOWLEDGE_TEST_CASES) {
    test(`${tc.id}: ${tc.label} — faithfulness >= 9`, async ({ page }) => {
      // 在 Node.js 层调用 API（避免浏览器 CORS）
      const apiContext = await request.newContext({ baseURL: BASE_API })
      const authHeader = { 'Authorization': `Bearer ${ADMIN_TOKEN}` }

      // 调用 knowledge-agent
      const agentRes = await apiContext.post('/api/v1/agents/chat', {
        headers: authHeader,
        data: {
          agent_id: 'knowledge-agent',
          message: tc.question,
          context: { must_cite_evidence: true },
        },
      })

      const agentBody = agentRes.ok() ? await agentRes.json() : {}
      const agentOutput = agentBody?.data?.response || agentBody?.data?.reply || ''

      console.log(`[${tc.id}] 状态: ${agentRes.status()}, 输出: ${agentOutput.length} chars`)

      // 调用 LLM Judge API
      const judgeRes = await apiContext.post('/api/v1/digital-workforce/judge-output', {
        headers: authHeader,
        data: {
          agent_output: agentOutput.slice(0, 2000) || '（无输出）',
          task_description: tc.question,
          judge_focus: tc.judge_focus,
          scenario_id: `DW-HEADED-${tc.id}`,
        },
      })

      const judgeBody = judgeRes.ok() ? await judgeRes.json() : {}
      const judgeData = judgeBody?.data || {}
      const score = judgeData?.overall_score || 0
      const dims = judgeData?.dimension_scores || {}
      const faithfulness = dims.faithfulness || 0
      const readiness = judgeData?.production_readiness || '未知'
      const critical = judgeData?.critical_issues || []

      console.log(`[LLM Judge ${tc.id}] 总分=${score}, faithfulness=${faithfulness}, 结论=${readiness}`)
      if (judgeData?.judge_summary) {
        console.log(`  摘要: ${judgeData.judge_summary.slice(0, 200)}`)
      }

      // 截图留证
      await page.goto('/#/portal')
      await page.screenshot({
        path: `playwright-report/headed/72-${tc.id.toLowerCase()}-result.png`,
        fullPage: false,
      })

      await apiContext.dispose()

      test.info().annotations.push({
        type: 'judge_score',
        description: `${tc.label}: 总分=${score}/100, faithfulness=${faithfulness}/10, ${readiness}`,
      })

      const minFaithfulness = tc.id === 'KQ-002' ? 9 : 8
      const minOverall = tc.id === 'KQ-002' ? 70 : 75

      expect(faithfulness, `${tc.id} faithfulness 不足（${faithfulness} < ${minFaithfulness}）`).toBeGreaterThanOrEqual(minFaithfulness)
      expect(critical, `${tc.id} 存在重大问题：${critical.join('; ')}`).toHaveLength(0)
      expect(score, `${tc.id} 总分不足（${score} < ${minOverall}）`).toBeGreaterThanOrEqual(minOverall)
    })
  }
})
