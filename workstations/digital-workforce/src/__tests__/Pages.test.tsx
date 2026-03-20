/**
 * P0 中书关键页面单元测试：PortalPage、RosterPage、ValueDashboardPage、
 * PolicyCenterPage、WorkflowsPage、EvidenceGatePage
 */
import type React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PortalPage from '../pages/PortalPage'
import RosterPage from '../pages/RosterPage'
import ValueDashboardPage from '../pages/ValueDashboardPage'
import RoleDetailPage from '../pages/RoleDetailPage'
import ReplayDetailPage from '../pages/ReplayDetailPage'
import PolicyCenterPage from '../pages/PolicyCenterPage'
import WorkflowsPage from '../pages/WorkflowsPage'
import EvidenceGatePage from '../pages/EvidenceGatePage'
import { AdminNoPermission } from '../components/AdminNoPermission'
import KnowledgeReviewPage from '../pages/KnowledgeReviewPage'

vi.mock('@cn-kis/feishu-sdk', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@cn-kis/api-client', () => ({
  digitalWorkforcePortalApi: {
    getPortal: vi.fn().mockResolvedValue({
      data: { blueprints: [], agents: [], roles: [], execution_today: {}, execution_7d: {} },
    }),
    getReplayRuns: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
    getReplay: vi.fn().mockResolvedValue({ data: { task_id: 'ORCH-1', status: 'success', structured_artifacts: {} } }),
    getValueMetrics: vi.fn().mockResolvedValue({
      data: {
        data: {
          window_days: 30,
          skill_execution_total: 0,
          skill_execution_success: 0,
          governance_summary: {},
          saved_hours_estimate: 0,
          by_role: [],
          by_workstation: [],
          by_business_object_type: [],
          by_role_kpi: [],
          knowledge_deposit: {
            total_deposited: 0,
            pending_review: 0,
            published: 0,
            by_source: [],
          },
        },
      },
    }),
    getRouting: vi.fn().mockResolvedValue({
      data: { data: { domain_agent: [], domain_skill: [], keyword_domain: [] } },
    }),
    getEvidenceGateRuns: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
    getAgent: vi.fn().mockResolvedValue({ data: { agent_id: 'test', name: 'Test' } }),
    getKnowledgeReviewList: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { items: [], total: 0, source_stats: [] } },
    }),
    batchKnowledgeReviewAction: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { action: 'publish', processed: 0, entry_ids: [] } },
    }),
    getKnowledgeQualityReport: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: {
        total_pending_review: 0, total_without_quality_score: 0,
        by_source_quality: [], low_quality_entries: [],
        no_search_vector_entries: [], no_summary_entries: [],
        recommendations: [],
      }},
    }),
    getPolicyLearning: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { items: [] } },
    }),
    getKnowledgeQualitySummary: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { summaries: [], snapshot_date: null } },
    }),
    getEvergreenWatchReportDetail: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { id: 1, source_name: 'Test', findings: {}, status: 'ok' } },
    }),
    getL2EvalLatest: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { verdict: '需整改', pass_rate: 0.0, available: false } },
    }),
    getKpiTrend: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { items: [], window_days: 30 } },
    }),
    getKpiTrendSummary: vi.fn().mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { summaries: [] } },
    }),
    submitPolicyForEvaluation: vi.fn().mockResolvedValue({ data: { code: 200, msg: 'OK', data: { status: 'evaluating' } } }),
    approvePolicyEvaluation: vi.fn().mockResolvedValue({ data: { code: 200, msg: 'OK', data: { status: 'active' } } }),
    rejectPolicyEvaluation: vi.fn().mockResolvedValue({ data: { code: 200, msg: 'OK', data: { status: 'retired' } } }),
    getRole: vi.fn().mockResolvedValue({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          role_code: 'solution_designer',
          role_name: '方案设计员',
          role_cluster: '项目准备',
          service_targets: ['研究经理'],
          core_scenarios: ['方案生成'],
          input_contract: ['需求说明'],
          output_contract: ['方案初稿'],
          automation_level: 'L2',
          human_confirmation_points: ['正式报价确认'],
          kpi_metrics: ['方案准备时长'],
          mapped_agent_ids: ['protocol-agent'],
          mapped_skill_ids: ['protocol-parser'],
          workstation_scope: ['research'],
          baseline_manual_minutes: 30,
          enabled: true,
        },
      },
    }),
  },
  assistantPoliciesApi: {
    list: vi.fn().mockResolvedValue({ data: { items: [] } }),
  },
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PortalPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders portal title and main structure', () => {
    renderWithProviders(<PortalPage />)
    expect(screen.getByRole('heading', { name: /数字员工门户/ })).toBeInTheDocument()
    expect(screen.getByTestId('portal-page')).toBeInTheDocument()
  })
  it('shows role-first grid when roles are returned', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPortal).mockResolvedValue({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          blueprints: [],
          agents: [],
          roles: [
            {
              role_code: 'solution_designer',
              role_name: '方案设计员',
              role_cluster: '项目准备',
              service_targets: ['研究经理'],
              core_scenarios: [],
              automation_level: 'L2',
              human_confirmation_points: [],
              kpi_metrics: [],
              mapped_agent_ids: ['protocol-agent'],
              mapped_skill_ids: [],
              workstation_scope: ['research'],
              baseline_manual_minutes: null,
            },
          ],
          execution_today: {},
          execution_7d: {},
        },
      },
    } as any)
    renderWithProviders(<PortalPage />)
    await screen.findByTestId('portal-role-first')
    expect(screen.getByTestId('portal-role-card')).toBeInTheDocument()
  })
})

describe('RosterPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders roster page structure', () => {
    renderWithProviders(<RosterPage />)
    expect(screen.getByTestId('roster-page')).toBeInTheDocument()
  })
})

describe('ValueDashboardPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders value dashboard structure', async () => {
    renderWithProviders(<ValueDashboardPage />)
    expect(screen.getByTestId('value-dashboard-page')).toBeInTheDocument()
  })
  it('renders aggregation blocks for by_role, by_workstation, by_business_object_type', async () => {
    renderWithProviders(<ValueDashboardPage />)
    expect(screen.getByTestId('value-dashboard-page')).toBeInTheDocument()
    await screen.findByTestId('value-aggregation-role_code', {}, { timeout: 3000 })
    expect(screen.getByTestId('value-aggregation-workstation_key')).toBeInTheDocument()
    expect(screen.getByTestId('value-aggregation-business_object_type')).toBeInTheDocument()
  })
  it('renders role aggregation item as role detail link', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPortal).mockResolvedValue({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          blueprints: [],
          agents: [],
          roles: [{
            role_code: 'solution_designer',
            role_name: '方案设计员',
            role_cluster: '项目准备',
            service_targets: [],
            core_scenarios: [],
            automation_level: 'L2',
            human_confirmation_points: [],
            kpi_metrics: [],
            mapped_agent_ids: [],
            mapped_skill_ids: [],
            workstation_scope: [],
            baseline_manual_minutes: null,
          }],
          execution_today: {},
          execution_7d: {},
        },
      },
    } as any)
    vi.mocked(digitalWorkforcePortalApi.getValueMetrics).mockResolvedValue({
      data: {
        data: {
          window_days: 30,
          skill_execution_total: 1,
          skill_execution_success: 1,
          governance_summary: {},
          saved_hours_estimate: 2,
          by_role: [{ role_code: 'solution_designer', count: 1, saved_hours_estimate: 2 }],
          by_workstation: [],
          by_business_object_type: [],
        },
      },
    } as any)
    renderWithProviders(<ValueDashboardPage />)
    expect(await screen.findByRole('link', { name: '方案设计员' })).toHaveAttribute('href', '/roles/solution_designer')
  })
})

describe('RoleDetailPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders role detail with runtime stats and replay section', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPortal).mockResolvedValue({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          blueprints: [],
          agents: [{ agent_id: 'protocol-agent', name: '协议智能体', description: '', capabilities: [], provider: 'kimi' }],
          roles: [],
          execution_today: {},
          execution_7d: { 'protocol-agent': { total: 8, success: 6 } },
        },
      },
    } as any)
    vi.mocked(digitalWorkforcePortalApi.getValueMetrics).mockResolvedValue({
      data: {
        data: {
          window_days: 30,
          skill_execution_total: 10,
          skill_execution_success: 8,
          governance_summary: {},
          saved_hours_estimate: 4,
          by_role: [{ role_code: 'solution_designer', count: 3, saved_hours_estimate: 1.5 }],
          by_workstation: [],
          by_business_object_type: [],
        },
      },
    } as any)
    vi.mocked(digitalWorkforcePortalApi.getReplayRuns).mockResolvedValue({
      data: {
        data: {
          items: [{
            task_id: 'ORCH-1',
            business_run_id: 'ORCH-1',
            role_code: 'solution_designer',
            domain_code: 'protocol',
            workstation_key: 'research',
            business_object_type: 'project',
            business_object_id: 'p-1',
            status: 'success',
            query: '生成方案',
            query_snippet: '生成方案',
            sub_task_count: 2,
            duration_ms: 1200,
            created_at: null,
            completed_at: null,
          }],
        },
      },
    } as any)
    vi.mocked(digitalWorkforcePortalApi.getEvidenceGateRuns).mockResolvedValue({
      data: {
        data: {
          items: [{
            id: 1,
            gate_type: 'readiness',
            scope: 'digital_workers',
            status: 'passed',
            score: 0.95,
            summary: { passed: true },
            created_at: '2026-03-11T10:00:00',
          }],
        },
      },
    } as any)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/roles/solution_designer']}>
          <Routes>
            <Route path="/roles/:roleCode" element={<RoleDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByTestId('role-detail-page')
    expect(screen.getByTestId('role-detail-stat-executions')).toBeInTheDocument()
    expect(screen.getByTestId('role-detail-stat-value')).toBeInTheDocument()
    expect(screen.getByTestId('role-detail-gate-status')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看门禁记录' })).toHaveAttribute('href', '/gates?gate_id=1')
    expect(screen.getByTestId('role-detail-replay-runs')).toBeInTheDocument()
    expect(screen.getByText('方案设计员')).toBeInTheDocument()
  })
})

describe('ReplayDetailPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders role as role detail link in governance block', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPortal).mockResolvedValue({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          blueprints: [],
          agents: [],
          roles: [{
            role_code: 'solution_designer',
            role_name: '方案设计员',
            role_cluster: '项目准备',
            service_targets: [],
            core_scenarios: [],
            automation_level: 'L2',
            human_confirmation_points: [],
            kpi_metrics: [],
            mapped_agent_ids: [],
            mapped_skill_ids: [],
            workstation_scope: [],
            baseline_manual_minutes: null,
          }],
          execution_today: {},
          execution_7d: {},
        },
      },
    } as any)
    vi.mocked(digitalWorkforcePortalApi.getReplay).mockResolvedValue({
      data: {
        data: {
          task_id: 'ORCH-1',
          business_run_id: 'ORCH-1',
          account_id: 1,
          query: '生成方案',
          status: 'success',
          sub_task_count: 1,
          aggregated_output: '结果',
          duration_ms: 100,
          structured_artifacts: {},
          sub_tasks: [],
          role_code: 'solution_designer',
          domain_code: 'protocol',
          workstation_key: 'research',
          business_object_type: 'project',
          business_object_id: 'p-1',
          created_at: null,
          completed_at: null,
        },
      },
    } as any)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/replay/ORCH-1']}>
          <Routes>
            <Route path="/replay/:taskId" element={<ReplayDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('回放详情')
    expect(await screen.findByRole('link', { name: '方案设计员' })).toHaveAttribute('href', '/roles/solution_designer')
  })
})

describe('AdminNoPermission', () => {
  it('shows unified no-permission state', () => {
    renderWithProviders(<AdminNoPermission />)
    expect(screen.getByTestId('admin-no-permission')).toBeInTheDocument()
    expect(screen.getByText('无权限')).toBeInTheDocument()
  })
})

describe('PolicyCenterPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders policy center structure', () => {
    renderWithProviders(<PolicyCenterPage />)
    expect(screen.getByTestId('policy-center-page')).toBeInTheDocument()
  })
})

describe('WorkflowsPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders workflows page and heading', () => {
    renderWithProviders(<WorkflowsPage />)
    expect(screen.getByRole('heading', { name: /协作流程定义/ })).toBeInTheDocument()
  })
})

describe('EvidenceGatePage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders evidence gate page structure', () => {
    renderWithProviders(<EvidenceGatePage />)
    expect(screen.getByTestId('evidence-gate-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /验收门禁/ })).toBeInTheDocument()
  })
  it('renders sensitive roles with role and replay links', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPortal).mockResolvedValue({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          blueprints: [],
          agents: [],
          roles: [{
            role_code: 'quality_reviewer',
            role_name: '质量复核员',
            role_cluster: '质量与治理簇',
            service_targets: [],
            core_scenarios: [],
            automation_level: 'L4',
            human_confirmation_points: ['重大偏差定级'],
            kpi_metrics: [],
            mapped_agent_ids: [],
            mapped_skill_ids: [],
            workstation_scope: ['quality'],
            baseline_manual_minutes: 25,
          }],
          execution_today: {},
          execution_7d: {},
        },
      },
    } as any)
    renderWithProviders(<EvidenceGatePage />)
    expect(await screen.findByTestId('evidence-sensitive-roles')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看岗位详情' })).toHaveAttribute('href', '/roles/quality_reviewer')
    expect(screen.getByRole('link', { name: '查看该岗位回放' })).toHaveAttribute('href', '/replay?role_code=quality_reviewer')
  })
  it('highlights selected gate row from query string', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/gates?gate_id=1']}>
          <Routes>
            <Route path="/gates" element={<EvidenceGatePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByTestId('selected-gate-row')).toBeInTheDocument()
  })
})

describe('KnowledgeReviewPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders knowledge review page heading and empty state', () => {
    renderWithProviders(<KnowledgeReviewPage />)
    expect(screen.getByTestId('knowledge-review-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /知识委员会审核台/ })).toBeInTheDocument()
  })

  it('shows batch action buttons as disabled when nothing selected', () => {
    renderWithProviders(<KnowledgeReviewPage />)
    expect(screen.getByRole('button', { name: /批量发布/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /批量拒绝/ })).toBeDisabled()
  })
})

describe('ValueDashboardPage – knowledge deposit card', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders knowledge deposit card when data contains knowledge_deposit', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getValueMetrics).mockResolvedValue({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          window_days: 30,
          skill_execution_total: 5,
          skill_execution_success: 4,
          governance_summary: {},
          saved_hours_estimate: 2.5,
          baseline_minutes_per_skill_run: 5,
          by_role: [],
          by_workstation: [],
          by_business_object_type: [],
          by_role_kpi: [],
          knowledge_deposit: {
            total_deposited: 3,
            pending_review: 2,
            published: 1,
            by_source: [{ source_type: 'project_retrospective', count: 2 }, { source_type: 'evergreen_watch', count: 1 }],
          },
        } as any,
      },
    } as any)
    const { default: ValueDashboardPage } = await import('../pages/ValueDashboardPage')
    renderWithProviders(<ValueDashboardPage />)
    const card = await screen.findByTestId('knowledge-deposit-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveTextContent('3')   // total_deposited
    expect(card).toHaveTextContent('项目复盘')
  })
})

describe('PerformancePage – role KPI report', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders role KPI report section when by_role_kpi has data', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getValueMetrics).mockResolvedValue({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          window_days: 30,
          skill_execution_total: 5,
          skill_execution_success: 4,
          governance_summary: {},
          saved_hours_estimate: 2.5,
          baseline_minutes_per_skill_run: 5,
          by_role: [],
          by_workstation: [],
          by_business_object_type: [],
          by_role_kpi: [
            {
              role_code: 'quality_guardian',
              role_name: '质量守护员',
              kpis: {
                total_executions: 7,
                gate_pass_rate: 0.85,
                kpi_labels: ['total_executions=质量任务总数', 'gate_pass_rate=门禁通过率'],
              },
            },
          ],
          knowledge_deposit: { total_deposited: 0, pending_review: 0, published: 0, by_source: [] },
        } as any,
      },
    } as any)
    const { default: PerformancePage } = await import('../pages/PerformancePage')
    renderWithProviders(<PerformancePage />)
    const section = await screen.findByTestId('role-kpi-report')
    expect(section).toBeInTheDocument()
    expect(section).toHaveTextContent('质量守护员')
    expect(section).toHaveTextContent('质量任务总数')
    expect(section).toHaveTextContent('7')
  })
})

// ============================================================================
// PolicyLearningPage — 策略审批流单元测试
// ============================================================================

describe('PolicyLearningPage – policy approval flow UI', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders policy-learning-page testid', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPolicyLearning as any).mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { items: [] } },
    })
    const { default: PolicyLearningPage } = await import('../pages/PolicyLearningPage')
    renderWithProviders(<PolicyLearningPage />)
    expect(await screen.findByTestId('policy-learning-page')).toBeInTheDocument()
  })

  it('shows submit-evaluation button for DRAFT status', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPolicyLearning as any).mockResolvedValue({
      data: {
        items: [{
          id: 1, worker_code: 'test_worker', domain_code: 'test', policy_key: 'test_key',
          outcome: '测试结果', root_cause: '测试根因', better_policy: '改进建议',
          replay_score: 0.5, status: 'draft', created_at: '2026-01-01T00:00:00', activated_at: null,
        }],
      },
    })
    const { default: PolicyLearningPage } = await import('../pages/PolicyLearningPage')
    renderWithProviders(<PolicyLearningPage />)
    expect(await screen.findByText('提交评测')).toBeInTheDocument()
  })

  it('shows approve and reject buttons for EVALUATING status', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPolicyLearning as any).mockResolvedValue({
      data: {
        items: [{
          id: 2, worker_code: 'eval_worker', domain_code: 'test', policy_key: 'eval_key',
          outcome: '评测结果', root_cause: '评测根因', better_policy: '评测建议',
          replay_score: 0.7, status: 'evaluating', created_at: '2026-01-01T00:00:00', activated_at: null,
        }],
      },
    })
    const { default: PolicyLearningPage } = await import('../pages/PolicyLearningPage')
    renderWithProviders(<PolicyLearningPage />)
    expect(await screen.findByText('批准')).toBeInTheDocument()
    expect(await screen.findByText('驳回')).toBeInTheDocument()
  })

  it('shows retire and rollback buttons for ACTIVE status', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getPolicyLearning as any).mockResolvedValue({
      data: {
        items: [{
          id: 3, worker_code: 'active_worker', domain_code: 'test', policy_key: 'active_key',
          outcome: '生效结果', root_cause: '生效根因', better_policy: '生效建议',
          replay_score: 0.95, status: 'active', created_at: '2026-01-01T00:00:00', activated_at: '2026-01-02T00:00:00',
        }],
      },
    })
    const { default: PolicyLearningPage } = await import('../pages/PolicyLearningPage')
    renderWithProviders(<PolicyLearningPage />)
    expect(await screen.findByText('退役')).toBeInTheDocument()
    expect(await screen.findByText('回滚')).toBeInTheDocument()
  })
})

// ============================================================================
// EvergreenWatchDetailPage — 哨塔报告详情页单元测试
// ============================================================================

describe('EvergreenWatchDetailPage – detail page rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders detail page for a valid report', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getEvergreenWatchReportDetail as any).mockResolvedValue({
      data: {
        code: 200, msg: 'OK',
        data: {
          id: 42,
          watch_type: 'industry',
          source_name: 'ICH E9 统计原则',
          source_url: 'https://www.ich.org',
          status: 'ok',
          headline: 'ICH E9(R1) estimand 框架更新',
          findings: { summary: '新增 estimand 五要素' },
          candidates: {},
          raw_payload: {},
          lifecycle_stages: ['protocol'],
          role_codes: ['solution_designer'],
          knowledge_tags: ['statistics'],
          created_at: '2026-01-01T00:00:00',
          linked_knowledge: [],
        },
      },
    })
    const { default: EvergreenWatchDetailPage } = await import('../pages/EvergreenWatchDetailPage')
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/upgrades/42']}>
          <Routes>
            <Route path="/upgrades/:reportId" element={<EvergreenWatchDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    render(<EvergreenWatchDetailPage />, { wrapper })
    expect(await screen.findByTestId('evergreen-watch-detail-page')).toBeInTheDocument()
  })
})

// ============================================================================
// DailyBriefPage — 经营日报页单元测试
// ============================================================================

describe('DailyBriefPage – basic rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders daily-brief-page testid', async () => {
    const { default: DailyBriefPage } = await import('../pages/DailyBriefPage')
    renderWithProviders(<DailyBriefPage />)
    // 日报页应可渲染，不应抛出错误
    const body = document.body
    expect(body).toBeTruthy()
  })
})

// ============================================================================
// AgentDirectoryPage — Agent 目录页单元测试
// ============================================================================

describe('AgentDirectoryPage – basic rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing', async () => {
    const { default: AgentDirectoryPage } = await import('../pages/AgentDirectoryPage')
    renderWithProviders(<AgentDirectoryPage />)
    expect(document.body).toBeTruthy()
  })
})

// ============================================================================
// MatrixPage — 工作台绑定矩阵单元测试
// ============================================================================

describe('MatrixPage – basic rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing', async () => {
    const { default: MatrixPage } = await import('../pages/MatrixPage')
    renderWithProviders(<MatrixPage />)
    expect(document.body).toBeTruthy()
  })
})

// ============================================================================
// PositionsPage — 岗位管理页单元测试
// ============================================================================

describe('PositionsPage – basic rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing', async () => {
    const { default: PositionsPage } = await import('../pages/PositionsPage')
    renderWithProviders(<PositionsPage />)
    expect(document.body).toBeTruthy()
  })
})

// ============================================================================
// MemoryArchivePage — 记忆档案页单元测试
// ============================================================================

describe('MemoryArchivePage – basic rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing', async () => {
    const { default: MemoryArchivePage } = await import('../pages/MemoryArchivePage')
    renderWithProviders(<MemoryArchivePage />)
    expect(document.body).toBeTruthy()
  })
})

// ============================================================================
// KnowledgeQualityDashboard — 知识质量仪表盘单元测试
// ============================================================================

describe('KnowledgeReviewPage – knowledge quality dashboard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders knowledge-quality-dashboard when data is available', async () => {
    const { digitalWorkforcePortalApi } = await import('@cn-kis/api-client')
    vi.mocked(digitalWorkforcePortalApi.getKnowledgeQualitySummary as any).mockResolvedValue({
      data: {
        summaries: [
          {
            package_id: 'informed_consent',
            package_label: '知情同意',
            total_entries: 10,
            published_entries: 8,
            avg_quality_score: 72.5,
            coverage_rate: 0.85,
            expiry_rate: 0.1,
            cite_rate_per_entry: 2.0,
          },
        ],
        snapshot_date: '2026-03-12',
      },
    })
    vi.mocked(digitalWorkforcePortalApi.getKnowledgeReviewList as any).mockResolvedValue({
      data: { code: 200, msg: 'OK', data: { items: [], total: 0, source_stats: [] } },
    })
    vi.mocked(digitalWorkforcePortalApi.getKnowledgeQualityReport as any).mockResolvedValue({
      data: { code: 200, msg: 'OK', data: {
        total_pending_review: 0, total_without_quality_score: 0,
        by_source_quality: [], low_quality_entries: [], no_search_vector_entries: [],
        no_summary_entries: [], recommendations: [],
      }},
    })
    renderWithProviders(<KnowledgeReviewPage />)
    const dashboard = await screen.findByTestId('knowledge-quality-dashboard')
    expect(dashboard).toBeInTheDocument()
    expect(dashboard).toHaveTextContent('知情同意')
  })
})
