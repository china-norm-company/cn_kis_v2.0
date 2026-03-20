/**
 * Headed 验收 71 — 质量守护员真实 Agent 验收（CORS 修复版）
 * Node.js 层调用 API + admin token 认证
 */
import { test, expect, request } from '@playwright/test'

const REAL_EVAL_ENABLED = process.env.DIGITAL_WORKER_REAL_EVAL_ENABLED === '1'
const BASE_API = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000'
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN || ''

test.describe('质量守护员真实 Agent 验收', () => {
  test.skip(!REAL_EVAL_ENABLED, '需要 DIGITAL_WORKER_REAL_EVAL_ENABLED=1 才执行')

  test('质量守护员分析偏差输出证据链和 CAPA 草稿，LLM Judge 综合评分 >= 80 且 risk_control >= 8', async ({ page }) => {
    // 在 Node.js 层调用 API（避免浏览器 CORS）
    const apiContext = await request.newContext({ baseURL: BASE_API })
    const authHeader = { 'Authorization': `Bearer ${ADMIN_TOKEN}` }

    const agentRes = await apiContext.post('/api/v1/agents/chat', {
      headers: authHeader,
      data: {
        agent_id: 'quality-guardian',
        message: (
          '请分析以下偏差事件并给出完整评估：\n\n' +
          '偏差描述：样品存储温度超标。\n' +
          '详情：第4周访视样品在运输过程中，记录显示温度达到28°C（要求：2-8°C），持续时间约4小时。\n' +
          '涉及样品批次：LOT-2026-0312-A/B/C，共3批次。\n\n' +
          '请输出：\n' +
          '1. 偏差严重程度建议（Critical/Major/Minor）及判断依据\n' +
          '2. 受影响样品的数据可用性风险评估\n' +
          '3. 需要立即采取的行动清单\n' +
          '4. CAPA 草稿（根因分析方向 + 纠正措施 + 预防措施）'
        ),
        context: {
          workstation_key: 'quality',
          business_object_type: 'deviation',
          business_object_id: 'DEV-TEST-001',
        },
      },
    })

    const agentBody = agentRes.ok() ? await agentRes.json() : {}
    const agentOutput = agentBody?.data?.response || agentBody?.data?.reply || ''

    console.log(`[质量守护员] 状态: ${agentRes.status()}, 输出长度: ${agentOutput.length}`)
    console.log(`[质量守护员] 输出片段: ${agentOutput.slice(0, 300)}`)

    expect(agentOutput.length, `质量守护员 Agent 未返回有效内容（status=${agentRes.status()}）`).toBeGreaterThan(100)

    // 调用 judge-output API 打分
    const judgeRes = await apiContext.post('/api/v1/digital-workforce/judge-output', {
      headers: authHeader,
      data: {
        agent_output: agentOutput.slice(0, 3000),
        task_description: '分析样品存储温度超标偏差（28°C，要求2-8°C，持续4小时，3批次），给出偏差等级建议、数据可用性风险、即时行动清单和 CAPA 草稿。',
        judge_focus: '偏差分级依据准确性|数据可用性风险评估完整性|CAPA 草稿可执行性|风险控制边界清晰度|不武断替代人类定级决策',
        scenario_id: 'DW-HEADED-071',
      },
    })

    const judgeBody = judgeRes.ok() ? await judgeRes.json() : {}
    const judgeData = judgeBody?.data || {}
    const score = judgeData?.overall_score || 0
    const dims = judgeData?.dimension_scores || {}
    const riskControl = dims.risk_control || 0
    const readiness = judgeData?.production_readiness || '未知'
    const critical = judgeData?.critical_issues || []

    console.log(`[LLM Judge] 总分=${score}, risk_control=${riskControl}, 结论=${readiness}`)
    if (judgeData?.judge_summary) {
      console.log(`  Judge 摘要: ${judgeData.judge_summary.slice(0, 200)}`)
    }

    // 截图留证
    await page.goto('/#/gates')
    await expect(page.locator('[data-testid="evidence-gate-page"]')).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: 'playwright-report/headed/71-quality-result.png', fullPage: false })

    await apiContext.dispose()

    test.info().annotations.push({
      type: 'judge_score',
      description: `总分: ${score}/100 | risk_control: ${riskControl}/10 | 生产可行性: ${readiness}`,
    })

    expect(score, `LLM Judge 总分不足（${score} < 80）`).toBeGreaterThanOrEqual(80)
    expect(riskControl, `risk_control 不足（${riskControl} < 8）`).toBeGreaterThanOrEqual(8)
    expect(critical, `存在重大问题：${critical.join('; ')}`).toHaveLength(0)
  })
})
