/**
 * 进思·客户台 Headed 测试评分报告器
 *
 * 18 个业务场景加权评分体系
 *
 * 阶段一 S01-S03: 25%  (客户画像与关键人管理)
 * 阶段二 S04-S06 + S10-S12: 30%  (产品矩阵/创新日历/健康度/预警)
 * 阶段三 S07-S09 + S13-S15: 25%  (商机/赋能/简报)
 * 阶段四 S16-S18: 20%  (满意度/里程碑/报表)
 */
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'

const SCENARIO_WEIGHTS: Record<string, number> = {
  S01: 9,
  S02: 9,
  S03: 7,
  S04: 5,
  S05: 5,
  S06: 5,
  S07: 5,
  S08: 4,
  S09: 4,
  S10: 5,
  S11: 5,
  S12: 5,
  S13: 5,
  S14: 4,
  S15: 4,
  S16: 7,
  S17: 6,
  S18: 6,
}

const TOTAL_WEIGHT = Object.values(SCENARIO_WEIGHTS).reduce((a, b) => a + b, 0)

interface ScenarioResult {
  id: string
  title: string
  weight: number
  total: number
  passed: number
  failed: number
  skipped: number
  tests: { name: string; status: string; duration: number }[]
}

export default class ScoringReporter implements Reporter {
  private scenarios: Map<string, ScenarioResult> = new Map()
  private startTime = 0

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startTime = Date.now()
    console.log('\n╔════════════════════════════════════════════════════════════╗')
    console.log('║    进思·客户台 — 业务全景 Headed 测试评分                  ║')
    console.log('╚════════════════════════════════════════════════════════════╝\n')
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const file = test.parent?.parent?.title || test.location.file
    const scenarioId = this.extractScenarioId(file)
    if (!scenarioId) return

    if (!this.scenarios.has(scenarioId)) {
      this.scenarios.set(scenarioId, {
        id: scenarioId,
        title: test.parent?.title || scenarioId,
        weight: SCENARIO_WEIGHTS[scenarioId] || 0,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        tests: [],
      })
    }

    const s = this.scenarios.get(scenarioId)!
    s.total++
    if (result.status === 'passed') s.passed++
    else if (result.status === 'failed') s.failed++
    else s.skipped++

    s.tests.push({
      name: test.title,
      status: result.status,
      duration: result.duration,
    })
  }

  onEnd(result: FullResult) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1)

    console.log('\n┌─────────────────────────────────────────────────────────────────────┐')
    console.log('│  场景评分明细                                                       │')
    console.log('├──────┬────────────────────────────────┬──────┬──────┬──────┬─────────┤')
    console.log('│ 编号 │ 场景名称                       │ 权重 │ 通过 │ 总数 │ 得分    │')
    console.log('├──────┼────────────────────────────────┼──────┼──────┼──────┼─────────┤')

    let totalScore = 0

    const sorted = [...this.scenarios.values()].sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    )

    for (const s of sorted) {
      const passRate = s.total > 0 ? s.passed / s.total : 0
      const normalizedWeight = (s.weight / TOTAL_WEIGHT) * 100
      const score = passRate * normalizedWeight
      totalScore += score

      const icon = s.failed > 0 ? '✗' : s.skipped > 0 ? '○' : '✓'
      const title = s.title.substring(0, 28).padEnd(28)
      console.log(
        `│ ${icon} ${s.id} │ ${title} │ ${String(s.weight).padStart(3)}% │ ${String(s.passed).padStart(4)} │ ${String(s.total).padStart(4)} │ ${score.toFixed(1).padStart(6)}分 │`,
      )
    }

    console.log('├──────┴────────────────────────────────┴──────┴──────┴──────┼─────────┤')

    const grade = totalScore >= 90 ? 'A — 可发布生产'
      : totalScore >= 70 ? 'B — 有条件发布'
      : totalScore >= 60 ? 'C — 需修复后复测'
      : 'D — 不可发布'
    console.log(
      `│ 总评分 (${grade})                                         │ ${totalScore.toFixed(1).padStart(6)}分 │`,
    )
    console.log('└────────────────────────────────────────────────────────────┴─────────┘')

    const failures = sorted.flatMap(s =>
      s.tests.filter(t => t.status === 'failed').map(t => ({ scenario: s.id, ...t })),
    )
    if (failures.length > 0) {
      console.log('\n⚠ 失败用例:')
      for (const f of failures) {
        console.log(`  ${f.scenario} — ${f.name}`)
      }
    }

    console.log(`\n⏱ 总耗时: ${elapsed}s | 状态: ${result.status}`)
    console.log('')
  }

  private extractScenarioId(fileOrTitle: string): string | null {
    const match = fileOrTitle.match(/S(\d{2})/)
    return match ? `S${match[1]}` : null
  }
}
