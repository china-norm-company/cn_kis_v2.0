/**
 * Headed 验收 70 — 闭环一真实 Agent 验收（需求→方案→报价，CORS 修复版）
 * Node.js 层调用 API + admin token 认证
 */
import { test, expect, request } from '@playwright/test'

const REAL_EVAL_ENABLED = process.env.DIGITAL_WORKER_REAL_EVAL_ENABLED === '1'
const BASE_API = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000'
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN || ''

test.describe('闭环一真实 Agent 验收（需求→方案→报价）', () => {
  test.skip(!REAL_EVAL_ENABLED, '需要 DIGITAL_WORKER_REAL_EVAL_ENABLED=1 才执行')

  test('真实编排产出需求摘要和方案初稿，LLM Judge 综合评分 >= 80', async ({ page }) => {
    // 在 Node.js 层发起真实 Agent 调用（避免浏览器 CORS 问题）
    const apiContext = await request.newContext({ baseURL: BASE_API })
    const authHeader = { 'Authorization': `Bearer ${ADMIN_TOKEN}` }

    // 直接调用 orchestration-agent（闭环一：需求→方案→报价）
    console.log('[闭环一] 调用 orchestration-agent 执行需求分析编排...')
    const orchRes = await apiContext.post('/api/v1/dashboard/orchestrate', {
      headers: authHeader,
      data: {
        query: (
          '请为以下客户需求完成需求分析与方案准备：\n' +
          '客户：某知名化妆品品牌\n' +
          '需求：证明新型精华液保湿功效，目标30-45岁女性，6周双盲研究，60人\n' +
          '预算：30-50万\n\n' +
          '请输出：\n' +
          '1. 需求摘要（demand_summary）\n' +
          '2. 需求缺口清单（gap_list）\n' +
          '3. 方案初稿（solution_draft：研究设计、主要终点、访视安排）\n' +
          '4. 报价输入项（quote_inputs：人员、检测项目、时间周期）'
        ),
        context: {
          workstation_key: 'crm',
          business_object_type: 'opportunity',
          business_object_id: 'test-opp-headed-001',
        },
      },
    })

    const orchBody = orchRes.ok() ? await orchRes.json() : {}
    const taskId = orchBody?.data?.task_id || ''
    const agentOutput = orchBody?.data?.aggregated_output || ''

    console.log(`[闭环一] 编排状态: ${orchRes.status()}, task_id: ${taskId}, 输出长度: ${agentOutput.length}`)

    // 如果有 task_id，等待并获取结构化产物
    let structuredText = agentOutput
    if (taskId) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      const replayRes = await apiContext.get(`/api/v1/digital-workforce/replay/${taskId}`, {
        headers: authHeader,
      })
      if (replayRes.ok()) {
        const replayBody = await replayRes.json()
        const artifacts = replayBody?.data?.structured_artifacts || {}
        if (Object.keys(artifacts).length > 0) {
          structuredText = JSON.stringify(artifacts, null, 2)
          console.log('[闭环一] 获取到结构化产物:', Object.keys(artifacts).join(', '))
        }
      }
    }

    // 使用有效内容（至少要有 Agent 输出或结构化产物）
    const evalText = structuredText.length > 50 ? structuredText : agentOutput

    // 截图记录 UI 状态（先导航到门户页）
    await page.goto('/#/portal')
    await expect(page.locator('[data-testid="portal-page"]')).toBeVisible({ timeout: 20000 })
    await page.screenshot({ path: 'playwright-report/headed/70-portal-during-eval.png', fullPage: false })

    if (taskId) {
      await page.goto(`/#/replay/${encodeURIComponent(taskId)}`)
      await page.waitForTimeout(2000)
      await page.screenshot({ path: 'playwright-report/headed/70-replay-result.png', fullPage: true })
    }

    // 调用 LLM Judge API 打分
    console.log(`[闭环一] 调用 LLM Judge 打分，输出长度: ${evalText.length}`)
    const judgeRes = await apiContext.post('/api/v1/digital-workforce/judge-output', {
      headers: authHeader,
      data: {
        agent_output: evalText.slice(0, 3000) || '（无输出，编排未完成）',
        task_description: (
          '从客户需求（某化妆品品牌新型精华液保湿功效评价，60人6周双盲）' +
          '生成方案初稿和报价输入项。要求包含：需求摘要、需求缺口、方案框架、报价输入清单。'
        ),
        judge_focus: '方案完整性（三要素：研究设计/终点/访视）|报价输入项是否可用|专业准确性|需求缺口是否识别|不捏造数据',
        scenario_id: 'DW-HEADED-070',
      },
    })

    const judgeBody = judgeRes.ok() ? await judgeRes.json() : {}
    const judgeData = judgeBody?.data || {}
    const score = judgeData?.overall_score || 0
    const readiness = judgeData?.production_readiness || '未知'
    const critical = judgeData?.critical_issues || []
    const suggestions = judgeData?.improvement_suggestions || []

    console.log(`[LLM Judge] 闭环一评分: 总分=${score}, 结论=${readiness}`)
    if (judgeData?.judge_summary) {
      console.log(`  摘要: ${judgeData.judge_summary.slice(0, 300)}`)
    }
    if (suggestions.length > 0) {
      console.log(`  改进建议: ${suggestions.join(' | ')}`)
    }

    await apiContext.dispose()

    test.info().annotations.push({
      type: 'judge_score',
      description: `总分: ${score}/100 | 生产可行性: ${readiness}`,
    })
    if (suggestions.length > 0) {
      test.info().annotations.push({ type: 'improvement', description: suggestions.join('; ') })
    }

    // 通过标准：总分 >= 80，无 critical_issues
    expect(score, `LLM Judge 总分不足（${score} < 80）。生产可行性: ${readiness}`).toBeGreaterThanOrEqual(80)
    expect(critical, `存在重大问题：${critical.join('; ')}`).toHaveLength(0)
  })
})
