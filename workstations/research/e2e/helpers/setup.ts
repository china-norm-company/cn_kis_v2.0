import { type Page, expect } from '@playwright/test'
import {
  AUTH_TOKEN,
  RESEARCH_MANAGER,
  authProfileData,
  authProfileResponse,
  myTodoItems,
  myTodoSummary,
  notifications,
  clients,
  businessFunnel,
  projectBusiness,
  changes,
  changeImpact,
  managerOverview,
  delegatedTasks,
  trendsData,
  portfolioData,
  resourceConflicts,
  teamMembers,
  teamCapacity,
  unassignedWorkorders,
  memberWorkorders,
  feasibilityAssessments,
  proposals,
  proposalDetail,
  protocols,
  projectDashboard,
  closeouts,
  visits,
  subjects,
  knowledgeEntries,
  quotes,
  contracts,
  accounts,
  schedulingSlots,
  opportunities,
} from './mock-data'

export async function injectAuth(page: Page) {
  await page.addInitScript(
    ({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
    },
    { token: AUTH_TOKEN, user: RESEARCH_MANAGER, profile: authProfileData },
  )
}

export async function navigateTo(page: Page, path: string, waitForText?: string) {
  await page.goto(path)
  if (waitForText) {
    await expect(page.getByText(waitForText).first()).toBeVisible({ timeout: 8000 })
  }
}

export async function setupApiMocks(page: Page) {
  // ===== Catch-all FIRST (LIFO: later routes override earlier ones) =====
  await page.route('**/api/v1/**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { items: [], total: 0 } },
      })
    } else {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { success: true } },
      })
    }
  })

  // ===== Auth =====
  await page.route('**/api/v1/auth/profile**', async (route) => {
    await route.fulfill({ json: authProfileResponse })
  })

  // ===== My Todo =====
  await page.route('**/api/v1/dashboard/my-todo**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: myTodoItems, summary: myTodoSummary } },
    })
  })

  // ===== Notification Inbox =====
  await page.route('**/api/v1/notification/inbox**', async (route) => {
    const url = new URL(route.request().url())
    const status = url.searchParams.get('status')
    const filtered = status === 'unread'
      ? notifications.filter(n => n.status !== 'read')
      : notifications
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          items: filtered,
          total: filtered.length,
          unread_count: notifications.filter(n => n.status !== 'read').length,
        },
      },
    })
  })

  // ===== Mark Notification Read =====
  await page.route(/\/api\/v1\/notification\/\d+\/read/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: '已标记已读', data: { id: 1, status: 'read' } },
    })
  })

  // ===== Notification List (legacy) =====
  await page.route('**/api/v1/notification/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: notifications, total: notifications.length } },
    })
  })

  // ===== CRM Clients =====
  await page.route(/\/api\/v1\/crm\/clients\/(\d+)\/communications/, async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          items: [
            { id: 1, type: 'phone', content: '沟通项目排期，客户确认2月启动', sender: '张研究', create_time: new Date().toISOString() },
            { id: 2, type: 'email', content: '发送方案初稿给客户审阅', sender: '张研究', create_time: new Date(Date.now() - 86400000).toISOString() },
            { id: 3, type: 'meeting', content: '项目启动会，确定样本量和时间线', sender: '客户方李总', create_time: new Date(Date.now() - 172800000).toISOString() },
          ],
        },
      },
    })
  })

  await page.route(/\/api\/v1\/crm\/clients\/(\d+)\/insight/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { insight: '该客户为战略级客户，近一年合作5个项目，累计营收120万，客户满意度高。建议加强新品评测合作。' } },
    })
  })

  await page.route(/\/api\/v1\/crm\/clients\/(\d+)$/, async (route) => {
    const match = route.request().url().match(/clients\/(\d+)/)
    const clientId = match ? Number(match[1]) : 0
    const client = clients.find(c => c.id === clientId) ?? clients[0]
    await route.fulfill({ json: { code: 200, msg: 'OK', data: client } })
  })

  await page.route(/\/api\/v1\/crm\/clients\/stats/, async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: { total_count: clients.length, active_client_count: 2, total_revenue: 2300000 },
      },
    })
  })

  await page.route('**/api/v1/crm/clients/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: clients, total: clients.length } },
    })
  })

  // ===== Business Pipeline =====
  await page.route('**/api/v1/dashboard/business-pipeline**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { funnel: businessFunnel, projects: projectBusiness } },
    })
  })

  // ===== Changes / Workflow =====
  await page.route(/\/api\/v1\/workflow\/changes\/(\d+)\/impact/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: changeImpact },
    })
  })

  await page.route('**/api/v1/workflow/changes/create**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: {
        code: 200, msg: '变更已创建',
        data: { id: 99, business_type: body?.business_type, status: 'pending', ...body },
      },
    })
  })

  await page.route('**/api/v1/workflow/changes/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: changes, total: changes.length } },
    })
  })

  // ===== Manager Overview / Dashboard =====
  await page.route('**/api/v1/dashboard/manager-overview**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: managerOverview },
    })
  })

  await page.route('**/api/v1/dashboard/trends**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: trendsData },
    })
  })

  await page.route('**/api/v1/dashboard/alerts**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: managerOverview.alerts },
    })
  })

  await page.route('**/api/v1/dashboard/activities**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: [
          { id: 1, title: '完成工单 HYD-W35', type: 'workorder', time: '10:30' },
          { id: 2, title: '审批方案变更', type: 'workflow', time: '09:15' },
        ],
      },
    })
  })

  await page.route('**/api/v1/dashboard/project-analysis**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { analysis: '本月项目整体进展良好...' } },
    })
  })

  // ===== Workorder (delegated tasks) =====
  await page.route('**/api/v1/workorder/create**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: {
        code: 200, msg: '任务已创建',
        data: { id: 99, ...body, status: 'pending', create_time: new Date().toISOString() },
      },
    })
  })

  await page.route('**/api/v1/workorder/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: delegatedTasks, total: delegatedTasks.length } },
    })
  })

  // ===== Portfolio =====
  await page.route('**/api/v1/dashboard/portfolio**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: portfolioData } })
  })

  // ===== Resource Conflicts =====
  await page.route('**/api/v1/dashboard/resource-conflicts**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: resourceConflicts } },
    })
  })

  // ===== Team =====
  await page.route('**/api/v1/dashboard/team-overview**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { members: teamMembers } },
    })
  })

  await page.route('**/api/v1/dashboard/team-capacity**', async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: teamCapacity } })
  })

  // ===== Workorder assignments =====
  await page.route(/\/api\/v1\/workorder\/\d+\/manual-assign/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { id: 1, status: 'assigned' } },
    })
  })

  await page.route('**/api/v1/workorder/auto-assign**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { assigned: unassignedWorkorders.length } },
    })
  })

  // ===== Scheduling Slots =====
  await page.route('**/api/v1/scheduling/slots**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { items: schedulingSlots, total: schedulingSlots.length } },
      })
    }
  })

  await page.route(/\/api\/v1\/scheduling\/slots\/\d+$/, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      await route.fulfill({
        json: { code: 200, msg: 'OK', data: { id: 101, ...body, status: 'scheduled' } },
      })
    }
  })

  // ===== Feasibility =====
  await page.route('**/api/v1/feasibility/assessments/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: feasibilityAssessments, total: feasibilityAssessments.length } },
    })
  })

  await page.route('**/api/v1/feasibility/assessments/stats**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { total: 2, completed: 1, in_progress: 1 } },
    })
  })

  // ===== Proposals =====
  await page.route('**/api/v1/proposal/proposals/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: proposals, total: proposals.length } },
    })
  })

  await page.route(/\/api\/v1\/proposal\/proposals\/\d+$/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: proposalDetail },
    })
  })

  await page.route('**/api/v1/proposal/proposals/create**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: { code: 200, msg: '方案已创建', data: { id: 99, ...body, stage: 'draft', version: 'v0.1' } },
    })
  })

  // ===== Protocols =====
  await page.route('**/api/v1/protocol/protocols/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: protocols, total: protocols.length } },
    })
  })

  await page.route(/\/api\/v1\/protocol\/protocols\/\d+$/, async (route) => {
    const match = route.request().url().match(/protocols\/(\d+)/)
    const pid = match ? Number(match[1]) : 1
    const p = protocols.find(x => x.id === pid) ?? protocols[0]
    await route.fulfill({ json: { code: 200, msg: 'OK', data: p } })
  })

  // ===== Protocol Dashboard =====
  await page.route(/\/api\/v1\/protocol\/\d+\/dashboard/, async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: projectDashboard } })
  })

  // ===== Closeout =====
  await page.route('**/api/v1/closeout/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: closeouts, total: closeouts.length } },
    })
  })

  // ===== Visits =====
  await page.route('**/api/v1/visit/plans/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: visits, total: visits.length } },
    })
  })

  // ===== Subjects =====
  await page.route('**/api/v1/subject/subjects/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: subjects, total: subjects.length } },
    })
  })

  // ===== Knowledge =====
  await page.route('**/api/v1/knowledge/entries/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: knowledgeEntries, total: knowledgeEntries.length } },
    })
  })

  // ===== Finance =====
  await page.route('**/api/v1/finance/quotes/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: quotes, total: quotes.length } },
    })
  })

  await page.route('**/api/v1/finance/quotes/create**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: { code: 200, msg: '报价已创建', data: { id: 99, ...body, status: 'draft' } },
    })
  })

  await page.route(/\/api\/v1\/finance\/contracts\/\d+$/, async (route) => {
    await route.fulfill({ json: { code: 200, msg: 'OK', data: contracts[0] } })
  })

  await page.route('**/api/v1/finance/contracts/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: contracts, total: contracts.length } },
    })
  })

  await page.route(/\/api\/v1\/finance\/contracts\/\d+\/payment-terms/, async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: contracts[0].payment_terms } },
    })
  })

  await page.route('**/api/v1/finance/invoices/create**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: { code: 200, msg: '发票已创建', data: { id: 99, ...body, status: 'draft' } },
    })
  })

  // ===== CRM Opportunities =====
  await page.route('**/api/v1/crm/opportunities/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: opportunities, total: opportunities.length } },
    })
  })

  await page.route('**/api/v1/crm/opportunities/create**', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: { code: 200, msg: '商机已创建', data: { id: 99, ...body, stage: body?.stage ?? 'lead' } },
    })
  })

  // ===== Identity / Accounts =====
  await page.route('**/api/v1/identity/accounts/list**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: accounts, total: accounts.length } },
    })
  })

  await page.route('**/api/v1/auth/accounts**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { items: accounts, total: accounts.length } },
    })
  })

  // ===== Agents (general catch-all FIRST, then specific overrides — LIFO) =====
  await page.route('**/api/v1/agents/**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { content: 'AI 洞察分析内容...' } },
    })
  })

  await page.route('**/api/v1/agents/chat**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: { content: 'AI 洞察分析内容...' } },
    })
  })

  await page.route('**/api/v1/agents/sessions**', async (route) => {
    await route.fulfill({
      json: { code: 200, msg: 'OK', data: [] },
    })
  })

  await page.route('**/api/v1/agents/list**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: [
          { id: 'general-assistant', name: 'general-assistant', display_name: '通用助手', description: 'AI通用对话' },
          { id: 'protocol-agent', name: 'protocol-agent', display_name: '协议助手', description: '协议相关咨询' },
          { id: 'analysis-agent', name: 'analysis-agent', display_name: '分析助手', description: '数据分析' },
          { id: 'report-agent', name: 'report-agent', display_name: '报告助手', description: '报告生成' },
        ],
      },
    })
  })

  // ===== Proposal Communications =====
  await page.route('**/api/v1/proposal/communications**', async (route) => {
    await route.fulfill({
      json: {
        code: 200, msg: 'OK',
        data: {
          items: [
            { id: 1, type: 'meeting', title: '方案评审会', content: '讨论方案细节', sender: '张研究', create_time: new Date().toISOString() },
          ],
        },
      },
    })
  })

}
