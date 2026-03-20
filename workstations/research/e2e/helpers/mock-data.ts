/**
 * 研究台 E2E 测试模拟数据
 */
export const AUTH_TOKEN = 'test-research-manager-token-e2e'

export const RESEARCH_MANAGER = {
  id: 1,
  name: '张研究',
  email: 'zhang.research@cnkis.com',
  avatar: '',
  role: 'project_manager',
}

export const authProfileData = {
  user: RESEARCH_MANAGER,
  permissions: [
    'dashboard.overview.read', 'dashboard.stats.read',
    'dashboard.activities.read', 'dashboard.feishu_scan.read',
    'dashboard.project_analysis.read', 'dashboard.hot_topics.read',
    'feasibility.assessment.read', 'feasibility.assessment.write',
    'proposal.proposal.read', 'proposal.proposal.write',
    'protocol.protocol.read', 'protocol.protocol.write',
    'closeout.closeout.read',
    'visit.plan.read',
    'subject.subject.read',
    'system.notification.read',
  ],
}

export const authProfileResponse = {
  code: 200,
  msg: 'OK',
  data: authProfileData,
}

// --- My Todo ---
export const myTodoItems = [
  {
    id: 'approval-1',
    type: 'approval',
    title: '审批: 方案变更审批',
    detail: 'protocol_amendment',
    entity_id: 1,
    entity_type: 'workflow_instance',
    urgency: 'high',
    created_at: new Date().toISOString(),
    link: '/workflow/1',
  },
  {
    id: 'workorder-10',
    type: 'overdue_workorder',
    title: '工单逾期: 保湿功效评价-003',
    detail: '已逾期 3 天',
    entity_id: 10,
    entity_type: 'workorder',
    urgency: 'critical',
    created_at: new Date().toISOString(),
    link: '/workorder/10',
  },
  {
    id: 'change-5',
    type: 'pending_change',
    title: '变更待处理: protocol_amendment',
    detail: '',
    entity_id: 5,
    entity_type: 'workflow_instance',
    urgency: 'medium',
    created_at: new Date().toISOString(),
    link: '/changes/5',
  },
  {
    id: 'visit-20',
    type: 'upcoming_visit',
    title: '访视: 第3次随访',
    detail: `日期: ${new Date().toISOString().split('T')[0]}`,
    entity_id: 20,
    entity_type: 'schedule_slot',
    urgency: 'medium',
    created_at: null,
    link: '/visits',
  },
]

export const myTodoSummary = {
  approvals: 1,
  overdue_workorders: 1,
  pending_changes: 1,
  upcoming_visits: 1,
  unread_notifications: 3,
  total: 4,
}

// --- Notifications ---
export const notifications = [
  {
    id: 1, title: '工单逾期预警: 保湿功效评价-003',
    content: '工单已逾期3天，请尽快处理',
    channel: 'feishu_card', priority: 'high', status: 'sent',
    source_type: 'workorder', source_id: 10,
    sent_at: new Date().toISOString(),
    create_time: new Date().toISOString(),
  },
  {
    id: 2, title: '审批完成: 设备采购申请',
    content: '您的设备采购申请已批准',
    channel: 'in_app', priority: 'normal', status: 'sent',
    source_type: 'workflow_instance', source_id: 3,
    sent_at: new Date().toISOString(),
    create_time: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 3, title: '变更请求: 样本量调整',
    content: '项目ABC的样本量变更请求需要您确认',
    channel: 'feishu_card', priority: 'urgent', status: 'delivered',
    source_type: 'workflow_instance', source_id: 5,
    sent_at: new Date().toISOString(),
    create_time: new Date(Date.now() - 7200000).toISOString(),
  },
]

// --- Clients ---
export const clients = [
  {
    id: 1, name: '美丽日化集团', level: 'strategic', industry: '日化',
    contact_name: '李总', contact_phone: '13800138001', contact_email: 'li@meiriri.com',
    address: '上海市浦东新区',
    total_projects: 5, total_revenue: 1200000,
    opportunity_count: 2,
    projects: [
      { id: 1, title: '保湿功效评价', code: 'HYD-2026-001', status: 'active', start_date: '2026-01-15' },
      { id: 2, title: '美白功效评价', code: 'WHT-2026-002', status: 'active', start_date: '2026-02-01' },
      { id: 3, title: '防晒评价', code: 'SUN-2025-008', status: 'completed', start_date: '2025-06-01', end_date: '2025-12-15' },
    ],
  },
  {
    id: 2, name: '自然堂科技', level: 'key', industry: '化妆品',
    contact_name: '王经理', contact_phone: '13900139002', contact_email: 'wang@zrt.com',
    address: '北京市朝阳区',
    total_projects: 3, total_revenue: 800000,
    opportunity_count: 1,
    projects: [
      { id: 4, title: '抗衰老功效评价', code: 'ANT-2026-003', status: 'active', start_date: '2026-01-20' },
    ],
  },
  {
    id: 3, name: '花西子品牌', level: 'potential', industry: '彩妆',
    contact_name: '陈总监', contact_phone: '13700137003', contact_email: 'chen@hxz.com',
    address: '杭州市西湖区',
    total_projects: 1, total_revenue: 300000,
    opportunity_count: 0,
    projects: [],
  },
]

// --- Business Pipeline ---
export const businessFunnel = {
  opportunities: { count: 8, amount: 3500000 },
  quotes: { count: 5, amount: 2800000 },
  contracts: { count: 4, amount: 2200000 },
  payments: { count: 3, amount: 1500000 },
}

export const projectBusiness = [
  {
    project_id: 1, project_title: '保湿功效评价', project_code: 'HYD-2026-001',
    contract_amount: 500000, invoiced: 300000, received: 200000,
    outstanding: 300000, collection_rate: 40, overdue: true,
  },
  {
    project_id: 2, project_title: '美白功效评价', project_code: 'WHT-2026-002',
    contract_amount: 450000, invoiced: 450000, received: 450000,
    outstanding: 0, collection_rate: 100, overdue: false,
  },
  {
    project_id: 4, project_title: '抗衰老功效评价', project_code: 'ANT-2026-003',
    contract_amount: 600000, invoiced: 200000, received: 100000,
    outstanding: 500000, collection_rate: 16.7, overdue: true,
  },
]

// --- Changes (Workflow Instances) ---
export const changes = [
  {
    id: 1, business_type: 'protocol_amendment', status: 'pending',
    current_step: 1, initiator_name: '张研究',
    form_data: { description: '客户要求将样本量从30人增加到50人' },
    create_time: new Date().toISOString(),
  },
  {
    id: 2, business_type: 'schedule_change', status: 'approved',
    current_step: 2, initiator_name: '张研究',
    form_data: { description: '第2批次访视日期推迟一周' },
    create_time: new Date(Date.now() - 86400000).toISOString(),
  },
]

export const changeImpact = {
  affected_workorders: 5,
  affected_schedules: 3,
  cost_impact: 25000,
  summary: '样本量增加20人，预计影响5个工单和3个排程，增加成本约2.5万元',
  recommendations: [
    '建议与客户确认追加预算',
    '调整第3-5批次排程以容纳新增样本',
    '通知质量部更新偏差阈值',
  ],
}

// --- Manager Overview ---
export const managerOverview = {
  kpi: {
    active_projects: 6, total_subjects: 145, week_completed: 23,
    overdue_workorders: 3, pending_payment: 850000, open_deviations: 2,
  },
  project_health: [
    {
      id: 1, title: '保湿功效评价', code: 'HYD-2026-001', product_category: '护肤',
      sample_size: 30, enrolled: 25, enrollment_rate: 83.3,
      wo_total: 40, wo_done: 35, completion_rate: 87.5,
      deviation_count: 0, capa_count: 0, overdue_wo: 0,
      health: 'healthy' as const, risk_score: 0,
    },
    {
      id: 4, title: '抗衰老功效评价', code: 'ANT-2026-003', product_category: '护肤',
      sample_size: 50, enrolled: 20, enrollment_rate: 40,
      wo_total: 30, wo_done: 10, completion_rate: 33.3,
      deviation_count: 2, capa_count: 1, overdue_wo: 3,
      health: 'critical' as const, risk_score: 14,
    },
  ],
  alerts: [
    {
      type: 'overdue_workorder', severity: 'high',
      title: '工单逾期: 抗衰老功效评价-W15',
      detail: '截止 2026-02-15，已逾期 4 天',
      entity_id: 15, entity_type: 'workorder',
    },
    {
      type: 'calibration_expiring', severity: 'medium',
      title: '设备校准即将到期: 皮肤分析仪-A3',
      detail: '到期日 2026-02-25',
      entity_id: 8, entity_type: 'resource_item',
    },
  ],
}

// --- Delegated Tasks ---
export const delegatedTasks = [
  {
    id: 1, title: '跟进保湿项目偏差闭环', description: '偏差DEV-001需要质量部确认纠正措施',
    assigned_to_name: '李质量', status: 'in_progress',
    due_date: '2026-02-28', create_time: new Date().toISOString(),
  },
  {
    id: 2, title: '协调设备校准排程', description: '皮肤分析仪A3需要在月底前完成校准',
    assigned_to_name: '王设备', status: 'pending',
    due_date: '2026-02-25', create_time: new Date(Date.now() - 86400000).toISOString(),
  },
]

// --- Trends ---
export const trendsData = {
  workorder: {
    series: Array.from({ length: 14 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - 13 + i)
      return {
        date: d.toISOString().split('T')[0],
        created: 3 + Math.floor(Math.random() * 4),
        completed: 2 + Math.floor(Math.random() * 3),
        backlog: 5 + Math.floor(Math.random() * 5),
      }
    }),
    granularity: 'day',
    total_created: 50,
    total_completed: 40,
    current_backlog: 10,
  },
  revenue: {
    series: [
      { month: '2025-10', contracted: 200000, received: 180000, receivable: 20000 },
      { month: '2025-11', contracted: 350000, received: 300000, receivable: 70000 },
      { month: '2025-12', contracted: 500000, received: 400000, receivable: 170000 },
      { month: '2026-01', contracted: 600000, received: 450000, receivable: 320000 },
      { month: '2026-02', contracted: 650000, received: 500000, receivable: 470000 },
    ],
  },
}

// --- Portfolio (with milestone-style data for PortfolioPage) ---
export const portfolioData = {
  active_count: 4,
  total_enrolled: 95,
  total_sample_size: 160,
  total_contract_amount: 2050000,
  projects: [
    {
      id: 1, title: '保湿功效评价', code: 'HYD-2026-001', status: 'active',
      enrolled: 25, sample_size: 30, contract_amount: 500000,
      milestones: { fsi: '2026-01-15', lsi: '2026-03-01', lso: '2026-05-01', dbl: '2026-06-15' },
    },
    {
      id: 2, title: '美白功效评价', code: 'WHT-2026-002', status: 'enrolling',
      enrolled: 30, sample_size: 40, contract_amount: 450000,
      milestones: { fsi: '2026-02-01', lsi: '2026-04-01', lso: null, dbl: null },
    },
    {
      id: 4, title: '抗衰老功效评价', code: 'ANT-2026-003', status: 'active',
      enrolled: 20, sample_size: 50, contract_amount: 600000,
      milestones: { fsi: '2026-01-20', lsi: '2026-04-15', lso: '2026-06-30', dbl: '2026-08-15' },
    },
    {
      id: 5, title: '防晒SPF测定', code: 'SUN-2026-004', status: 'planning',
      enrolled: 0, sample_size: 40, contract_amount: 500000,
      milestones: { fsi: '2026-03-15', lsi: null, lso: null, dbl: null },
    },
  ],
}

// --- Resource Conflicts ---
export const resourceConflicts = [
  {
    id: 1, type: 'personnel_overlap', description: '评估员张三在2/20同时被分配到保湿和美白两个项目',
    severity: 'high' as const, projects: ['HYD-2026-001', 'WHT-2026-002'],
    detected_at: new Date().toISOString(),
    person_id: 5, date: '2026-02-20', count: 2,
    slots: [
      { id: 101, visit_node: '保湿-V3随访', start_time: '09:00', end_time: '11:00' },
      { id: 102, visit_node: '美白-V2随访', start_time: '10:00', end_time: '12:00' },
    ],
  },
  {
    id: 2, type: 'equipment_conflict', description: 'VISIA设备在2/22有双项目预约冲突',
    severity: 'medium' as const, projects: ['ANT-2026-003', 'SUN-2026-004'],
    detected_at: new Date(Date.now() - 86400000).toISOString(),
    person_id: null, date: '2026-02-22', count: 2,
    slots: [
      { id: 103, visit_node: '抗衰-V1基线', start_time: '14:00', end_time: '16:00' },
      { id: 104, visit_node: '防晒-预试验', start_time: '15:00', end_time: '17:00' },
    ],
  },
]

// --- Team Overview ---
export const teamMembers = [
  { id: 1, name: '张三', role: '评估员', active_workorders: 8, completed_this_week: 5, overdue_count: 1, load_rate: 110 },
  { id: 2, name: '李四', role: 'CRC', active_workorders: 5, completed_this_week: 4, overdue_count: 0, load_rate: 75 },
  { id: 3, name: '王五', role: '评估员', active_workorders: 3, completed_this_week: 2, overdue_count: 0, load_rate: 50 },
  { id: 4, name: '赵六', role: '仪器操作', active_workorders: 6, completed_this_week: 3, overdue_count: 2, load_rate: 95 },
]

export const teamCapacity = {
  total_members: 4,
  avg_load_rate: 82,
  total_utilization: 78,
}

// --- Unassigned workorders for team page ---
export const unassignedWorkorders = [
  { id: 50, title: '保湿-V4数据录入', status: 'pending', assigned_to: null, due_date: '2026-02-25', work_order_type: 'data_entry' },
  { id: 51, title: '美白-V2仪器检测', status: 'pending', assigned_to: null, due_date: '2026-02-23', work_order_type: 'measurement' },
  { id: 52, title: '抗衰-V1样本处理', status: 'pending', assigned_to: null, due_date: '2026-02-24', work_order_type: 'sample' },
]

// --- Member workorders (for expand) ---
export const memberWorkorders = [
  { id: 30, title: '保湿-V3 Corneometer测量', status: 'in_progress', assigned_to: 1, due_date: '2026-02-20', work_order_type: 'measurement' },
  { id: 31, title: '保湿-V3 TEWL测量', status: 'pending', assigned_to: 1, due_date: '2026-02-21', work_order_type: 'measurement' },
]

// --- Feasibility Assessments ---
export const feasibilityAssessments = [
  {
    id: 1, title: '祛痘产品功效评价可行性', client_name: '美丽日化集团',
    status: 'completed', score: 85, created_at: '2026-01-10',
    dimensions: { scientific: 90, resource: 80, timeline: 85, compliance: 88, cost: 82, risk: 78 },
  },
  {
    id: 2, title: '新型防晒剂SPF测试可行性', client_name: '自然堂科技',
    status: 'in_progress', score: null, created_at: '2026-02-05',
    dimensions: null,
  },
]

// --- Proposals ---
export const proposals = [
  { id: 1, title: '保湿功效评价方案', client_name: '美丽日化集团', stage: 'finalized', version: 'v3.0', created_at: '2025-12-01', updated_at: '2026-01-10' },
  { id: 2, title: '美白功效评价方案', client_name: '美丽日化集团', stage: 'client_review', version: 'v2.1', created_at: '2026-01-05', updated_at: '2026-01-28' },
  { id: 3, title: '抗衰老功效评价方案', client_name: '自然堂科技', stage: 'internal_review', version: 'v1.0', created_at: '2026-01-20', updated_at: '2026-02-10' },
  { id: 4, title: '防晒SPF测定方案', client_name: '花西子品牌', stage: 'draft', version: 'v0.1', created_at: '2026-02-12', updated_at: '2026-02-12' },
]

export const proposalDetail = {
  id: 1, title: '保湿功效评价方案', client_name: '美丽日化集团',
  stage: 'finalized', version: 'v3.0', description: '评估保湿产品在连续使用28天后的角质层含水量变化',
  created_at: '2025-12-01', updated_at: '2026-01-10',
  opportunity_id: 1, protocol_id: 1,
  versions: [
    { version: 'v3.0', note: '客户确认定稿', created_at: '2026-01-10' },
    { version: 'v2.1', note: '根据内审意见修改样本量', created_at: '2026-01-05' },
    { version: 'v1.0', note: '初稿', created_at: '2025-12-01' },
  ],
  checklist: [
    { id: 1, item: '样本量计算已确认', checked: true },
    { id: 2, item: '检测方法已选定', checked: true },
    { id: 3, item: '客户签字确认', checked: true },
    { id: 4, item: '转协议已完成', checked: true },
  ],
}

// --- Protocols ---
export const protocols = [
  { id: 1, title: '保湿功效评价', code: 'HYD-2026-001', status: 'active', client_name: '美丽日化集团', sample_size: 30, created_at: '2026-01-15' },
  { id: 2, title: '美白功效评价', code: 'WHT-2026-002', status: 'active', client_name: '美丽日化集团', sample_size: 40, created_at: '2026-02-01' },
  { id: 4, title: '抗衰老功效评价', code: 'ANT-2026-003', status: 'active', client_name: '自然堂科技', sample_size: 50, created_at: '2026-01-20' },
]

// --- Project Dashboard ---
export const projectDashboard = {
  protocol: { id: 1, title: '保湿功效评价', code: 'HYD-2026-001', efficacy_type: '功效测试', sample_size: 30 },
  enrollment: { total: 30, enrolled: 25, rate: 83.3 },
  workorders: {
    total: 40, completed: 35,
    by_status: [{ status: 'completed', count: 35 }, { status: 'in_progress', count: 3 }, { status: 'pending', count: 2 }],
  },
  quality: { deviations: 0, capas: 0 },
  finance: { contract_amount: 500000, invoiced: 300000, received: 200000 },
  team: [
    { id: 1, name: '张三', role: '评估员' },
    { id: 2, name: '李四', role: 'CRC' },
  ],
}

// --- Closeout ---
export const closeouts = [
  {
    id: 1, protocol_id: 3, protocol_title: '防晒评价', protocol_code: 'SUN-2025-008',
    status: 'in_progress', progress: 75, created_at: '2025-12-15',
    checklist_summary: { total: 16, completed: 12 },
  },
]

// --- Visits ---
export const visits = [
  { id: 1, subject_code: 'HYD-S001', visit_name: '第3次随访', scheduled_date: new Date().toISOString().split('T')[0], status: 'scheduled', protocol_title: '保湿功效评价' },
  { id: 2, subject_code: 'WHT-S005', visit_name: '基线访视', scheduled_date: new Date().toISOString().split('T')[0], status: 'scheduled', protocol_title: '美白功效评价' },
  { id: 3, subject_code: 'ANT-S012', visit_name: '第1次随访', scheduled_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], status: 'scheduled', protocol_title: '抗衰老功效评价' },
]

// --- Subjects ---
export const subjects = [
  { id: 1, code: 'HYD-S001', name: '受试者001', gender: '女', age: 28, protocol_title: '保湿功效评价', status: 'active', enrolled_date: '2026-01-20' },
  { id: 2, code: 'HYD-S002', name: '受试者002', gender: '女', age: 35, protocol_title: '保湿功效评价', status: 'active', enrolled_date: '2026-01-22' },
  { id: 3, code: 'WHT-S005', name: '受试者005', gender: '女', age: 32, protocol_title: '美白功效评价', status: 'active', enrolled_date: '2026-02-05' },
]

// --- Knowledge ---
export const knowledgeEntries = [
  { id: 1, title: '保湿功效评价SOP', type: 'sop', tags: ['保湿', 'SOP'], updated_at: '2026-01-15' },
  { id: 2, title: 'TEWL测量操作规范', type: 'protocol', tags: ['TEWL', '仪器'], updated_at: '2026-01-10' },
  { id: 3, title: '受试者入组标准模板', type: 'template', tags: ['入组', '模板'], updated_at: '2025-12-20' },
]

// --- Finance (quotes, contracts for BusinessPipeline operations) ---
export const quotes = [
  { id: 1, title: '保湿功效评价报价', client_name: '美丽日化集团', status: 'accepted', amount: 500000, created_at: '2025-11-20' },
  { id: 2, title: '防晒SPF测定报价', client_name: '花西子品牌', status: 'draft', amount: 500000, created_at: '2026-02-10' },
]

export const contracts = [
  {
    id: 1, title: '保湿功效评价合同', protocol_id: 1, client_name: '美丽日化集团',
    status: 'active', amount: 500000, signed_date: '2026-01-10',
    payment_terms: [
      { id: 1, milestone: '合同签订', percentage: 30, amount: 150000, status: 'paid' },
      { id: 2, milestone: '中期报告', percentage: 40, amount: 200000, status: 'pending' },
      { id: 3, milestone: '结项报告', percentage: 30, amount: 150000, status: 'pending' },
    ],
  },
]

// --- Accounts (for assignee selector) ---
export const accounts = [
  { id: 1, username: 'zhangyan', display_name: '张研究', name: '张研究', role: 'project_manager' },
  { id: 5, username: 'zhangsan', display_name: '张三', name: '张三', role: 'evaluator' },
  { id: 6, username: 'lisi', display_name: '李四', name: '李四', role: 'crc' },
  { id: 7, username: 'wangwu', display_name: '王五', name: '王五', role: 'evaluator' },
  { id: 8, username: 'zhaoliu', display_name: '赵六', name: '赵六', role: 'instrument_operator' },
  { id: 10, name: '李质量', role: 'quality_manager' },
  { id: 11, name: '王设备', role: 'equipment_manager' },
  { id: 12, name: '陈财务', role: 'finance' },
]

// --- Scheduling Slots ---
export const schedulingSlots = [
  { id: 101, visit_node_name: '保湿-V3随访', scheduled_date: '2026-02-20', start_time: '09:00', end_time: '11:00', status: 'scheduled', assigned_to_id: 5 },
  { id: 102, visit_node_name: '美白-V2随访', scheduled_date: '2026-02-20', start_time: '10:00', end_time: '12:00', status: 'conflict', assigned_to_id: 5 },
  { id: 103, visit_node_name: '抗衰-V1基线', scheduled_date: '2026-02-22', start_time: '14:00', end_time: '16:00', status: 'scheduled', assigned_to_id: 7 },
]

// --- Opportunities ---
export const opportunities = [
  { id: 1, title: '美丽日化-新品祛痘评价', client_id: 1, stage: 'proposal', estimated_amount: 400000, probability: 70 },
  { id: 2, title: '自然堂-敏感肌修复评价', client_id: 2, stage: 'qualification', estimated_amount: 350000, probability: 40 },
]
