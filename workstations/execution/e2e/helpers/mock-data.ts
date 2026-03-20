/**
 * 模拟数据工厂 — 实验室执行工作台
 *
 * 字段名严格对齐前端 API 客户端类型定义（packages/api-client/src/modules/workorder.ts）。
 * 覆盖三种角色（CRC主管、CRC协调员、排程员）的全部场景。
 */

// ============================================================================
// 通用常量
// ============================================================================
export const AUTH_TOKEN = 'mock-e2e-token-execution-001'
const TODAY = new Date().toISOString().split('T')[0]

// ============================================================================
// 三种角色用户
// ============================================================================
export const CRC_SUPERVISOR_USER = {
  open_id: 'ou_test_crc_supervisor_001',
  name: '陈主管',
  avatar: '',
  email: 'chen.zhuguan@cnkis.test',
}

export const CRC_USER = {
  open_id: 'ou_test_crc_001',
  name: '李协调',
  avatar: '',
  email: 'li.xietiao@cnkis.test',
}

export const SCHEDULER_USER = {
  open_id: 'ou_test_scheduler_001',
  name: '王排程',
  avatar: '',
  email: 'wang.paicheng@cnkis.test',
}

export const TECHNICIAN_USER = {
  open_id: 'ou_test_technician_001',
  name: '赵执行',
  avatar: '',
  email: 'zhao.zhixing@cnkis.test',
}

// ============================================================================
// Auth Profile — 四种角色（technician 用于 DefaultDashboard / 中书触点 E2E）
// ============================================================================
export function buildAuthProfile(role: 'crc_supervisor' | 'crc' | 'scheduler' | 'technician') {
  const configs = {
    crc_supervisor: {
      id: 1, username: 'crc_supervisor_chen', display_name: '陈主管',
      email: CRC_SUPERVISOR_USER.email, account_type: 'crc_supervisor',
      roles: [{ name: 'crc_supervisor', display_name: 'CRC主管', level: 4, category: 'execution' }],
      permissions: [
        'dashboard.stats.read', 'workorder.workorder.read', 'workorder.workorder.update',
        'visit.plan.read', 'subject.subject.read', 'protocol.protocol.read', 'edc.crf.read',
      ],
      data_scope: 'global',
      visible_workbenches: ['execution'],
      visible_menu_items: { execution: ['dashboard', 'workorders', 'scheduling', 'analytics'] },
    },
    crc: {
      id: 2, username: 'crc_li', display_name: '李协调',
      email: CRC_USER.email, account_type: 'crc',
      roles: [{ name: 'crc', display_name: 'CRC协调员', level: 3, category: 'execution' }],
      permissions: [
        'dashboard.stats.read', 'workorder.workorder.read', 'workorder.workorder.update',
        'visit.plan.read', 'subject.subject.read', 'protocol.protocol.read', 'edc.crf.read',
      ],
      data_scope: 'self',
      visible_workbenches: ['execution'],
      visible_menu_items: { execution: ['dashboard', 'workorders', 'visits', 'subjects', 'changes', 'edc'] },
    },
    scheduler: {
      id: 3, username: 'scheduler_wang', display_name: '王排程',
      email: SCHEDULER_USER.email, account_type: 'scheduler',
      roles: [{ name: 'scheduler', display_name: '排程员', level: 3, category: 'execution' }],
      permissions: [
        'dashboard.stats.read', 'workorder.workorder.read', 'workorder.workorder.assign',
        'visit.plan.read', 'edc.crf.read',
      ],
      data_scope: 'global',
      visible_workbenches: ['execution'],
      visible_menu_items: { execution: ['dashboard', 'workorders', 'scheduling', 'lims', 'analytics'] },
    },
    technician: {
      id: 4, username: 'technician_zhao', display_name: '赵执行',
      email: TECHNICIAN_USER.email, account_type: 'technician',
      roles: [{ name: 'technician', display_name: '执行员', level: 2, category: 'execution' }],
      permissions: ['dashboard.stats.read', 'workorder.workorder.read', 'workorder.workorder.update'],
      data_scope: 'self',
      visible_workbenches: ['execution'],
      visible_menu_items: { execution: ['dashboard', 'workorders'] },
    },
  }
  const cfg = configs[role]
  return { ...cfg, avatar: '' }
}

// ============================================================================
// CRC主管仪表盘 — 字段对齐 workorderApi.crcDashboard() 返回类型
// ============================================================================
export const crcSupervisorDashboard = {
  summary: {
    total_work_orders: 120,
    today_scheduled: 15,
    active_work_orders: 42,
    completed_today: 8,
  },
  project_progress: [
    {
      protocol_id: 1, protocol_title: 'HYD-2026-001 保湿功效评价',
      total: 50, completed: 32, in_progress: 10, pending: 6, overdue: 2,
      completion_rate: 64.0,
    },
    {
      protocol_id: 2, protocol_title: 'ANT-2026-003 抗衰老功效评价',
      total: 40, completed: 10, in_progress: 15, pending: 15, overdue: 0,
      completion_rate: 25.0,
    },
    {
      protocol_id: 3, protocol_title: 'WH-2026-002 美白功效评价',
      total: 30, completed: 28, in_progress: 1, pending: 0, overdue: 1,
      completion_rate: 93.3,
    },
  ],
  crc_workload: [
    { user_id: 2, user_name: '李协调', active_count: 8, project_count: 3, today_count: 4, overdue_count: 1 },
    { user_id: 4, user_name: '赵CRC', active_count: 5, project_count: 2, today_count: 6, overdue_count: 0 },
    { user_id: 5, user_name: '钱CRC', active_count: 3, project_count: 2, today_count: 3, overdue_count: 0 },
  ],
  pending_decisions: [
    {
      type: 'scheduling_conflict', id: 1,
      title: '受试者S-012排程冲突', description: 'S-012与其他受试者检测时间重叠',
      work_order_id: 301, work_order_title: 'S-012 皮肤水分测试',
      severity: 'high', created_at: new Date().toISOString(),
    },
    {
      type: 'protocol_amendment', id: 2,
      title: '保湿项目方案修订响应', description: '方案V2.0增加TEWL检测时间点',
      work_order_id: 302, work_order_title: 'HYD-2026-001 方案修订',
      severity: 'medium', created_at: new Date().toISOString(),
    },
  ],
  risk_alerts: [
    { type: 'workorder_overdue', level: 'warning', message: 'HYD-2026-001 有2个逾期工单', count: 2 },
    { type: 'workload_imbalance', level: 'info', message: '李协调今日工单偏多（8个待处理）', count: 1 },
  ],
}

// ============================================================================
// CRC协调员仪表盘 — 字段对齐 workorderApi.crcMyDashboard() 返回类型
// ============================================================================
export const crcDashboard = {
  my_projects: [
    {
      protocol_id: 1, protocol_title: 'HYD-2026-001 保湿功效评价',
      total: 50, completed: 32, in_progress: 10, pending: 5, completion_rate: 64.0,
    },
    {
      protocol_id: 2, protocol_title: 'ANT-2026-003 抗衰老功效评价',
      total: 40, completed: 10, in_progress: 15, pending: 12, completion_rate: 25.0,
    },
  ],
  today_timeline: [
    {
      id: 201, title: '检测室环境确认', status: 'completed',
      scheduled_date: TODAY, due_date: null, work_order_type: 'environment',
      protocol_title: 'HYD-2026-001 保湿功效评价',
      start_time: '08:00', end_time: '08:30',
    },
    {
      id: 202, title: 'S-001 皮肤水分测试', status: 'in_progress',
      scheduled_date: TODAY, due_date: `${TODAY}T12:00:00`, work_order_type: 'detection',
      protocol_title: 'HYD-2026-001 保湿功效评价', subject_name: 'S-001 王丽',
      start_time: '09:00', end_time: '10:00',
    },
    {
      id: 203, title: 'S-003 面部图像采集', status: 'pending',
      scheduled_date: TODAY, due_date: `${TODAY}T14:00:00`, work_order_type: 'imaging',
      protocol_title: 'ANT-2026-003 抗衰老功效评价', subject_name: 'S-003 李雪',
      start_time: '10:30', end_time: '11:30',
    },
    {
      id: 204, title: 'S-005 色素评估', status: 'pending',
      scheduled_date: TODAY, due_date: `${TODAY}T15:30:00`, work_order_type: 'detection',
      protocol_title: 'WH-2026-002 美白功效评价', subject_name: 'S-005 赵薇',
      start_time: '14:00', end_time: '15:00',
    },
    {
      id: 205, title: 'S-008 TEWL 检测', status: 'pending',
      scheduled_date: TODAY, due_date: `${TODAY}T17:00:00`, work_order_type: 'detection',
      protocol_title: 'HYD-2026-001 保湿功效评价', subject_name: 'S-008 刘洋',
      start_time: '16:00', end_time: '17:00',
    },
  ],
  my_stats: {
    total_active: 8,
    today_scheduled: 5,
    today_completed: 1,
    week_completed: 18,
    overdue: 1,
  },
  recent_exceptions: [
    {
      id: 1, work_order_id: 198,
      exception_type: 'subject_no_show', severity: 'medium', status: 'open',
      description: '受试者S-010未按时到达',
      created_at: new Date().toISOString(),
    },
  ],
}

// ============================================================================
// 排程员仪表盘 — 字段对齐 workorderApi.schedulerDashboard() 返回类型
// ============================================================================
export const schedulerDashboard = {
  pending_assignment: {
    total: 3,
    items: [
      { id: 301, title: 'S-015 基线访视检测', scheduled_date: TODAY, due_date: `${TODAY}T12:00:00`, work_order_type: 'detection' },
      { id: 302, title: 'S-018 第2周访视', scheduled_date: TODAY, due_date: `${TODAY}T15:00:00`, work_order_type: 'detection' },
      { id: 303, title: 'S-022 第4周访视', scheduled_date: TODAY, due_date: `${TODAY}T17:00:00`, work_order_type: 'detection' },
    ],
  },
  resource_overview: {
    equipment: { total: 15, active: 10, calibration_due: 2 },
    personnel: { total: 8, on_duty: 5 },
    venue: { total: 4, available: 2 },
  },
  conflict_warnings: [
    {
      slot_id: 101, plan_id: 1, plan_name: 'Corneometer CM825 排程',
      visit_node_name: 'V2-第2周访视', scheduled_date: TODAY,
      conflict_reason: '10:00-11:00有重复预约',
    },
    {
      slot_id: 102, plan_id: 2, plan_name: '检测室B排程',
      visit_node_name: 'V3-第3周访视', scheduled_date: TODAY,
      conflict_reason: '明日预约已满',
    },
  ],
  weekly_capacity: {
    week_start: TODAY,
    week_end: (() => { const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0] })(),
    total_scheduled: 20,
    total_completed: 12,
    daily: [
      { date: TODAY, total: 5, completed: 3 },
      { date: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })(), total: 4, completed: 0 },
      { date: (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0] })(), total: 3, completed: 0 },
    ],
  },
}

// ============================================================================
// 跨项目排程概览 — schedulingApi.crossProjectOverview()
// ============================================================================
export const crossProjectOverview = {
  items: [
    { id: 1, protocol_title: 'HYD-2026-001', total_slots: 100, completed_slots: 64, conflict_count: 1, status: 'active' },
    { id: 2, protocol_title: 'ANT-2026-003', total_slots: 80, completed_slots: 20, conflict_count: 0, status: 'active' },
  ],
  total: 2,
  total_plans: 2,
  total_conflicts: 1,
}

// ============================================================================
// 项目执行上下文 — workorderApi.getProjectContext() 返回类型
// ============================================================================
export const projectContext = {
  id: 1,
  protocol_id: 1,
  key_requirements: [
    { category: '受试者准备', content: '每次检测前需确认受试者空腹状态', priority: 'high' },
    { category: '环境条件', content: '检测室温度必须22±1°C', priority: 'high' },
  ],
  special_notes: '本项目赞助商要求每日邮件汇报进展',
  execution_guidelines: { detection: '严格按照 SOP-DET-001 V3.0 执行' },
  updated_by: 1,
  update_time: new Date().toISOString(),
  decision_logs: [
    {
      id: 1, decision_type: 'scheduling', scope: 'minor',
      title: '受试者S-012排程调整',
      description: '因受试者请假，将访视推迟至下周一',
      rationale: '在方案允许的访视窗口期内',
      impact: '无重大影响', outcome: 'approved',
      decided_by: 1, decision_time: new Date().toISOString(),
    },
  ],
  change_responses: [
    {
      id: 1, change_source: 'protocol_amendment',
      change_description: '方案修订V2.0：增加TEWL检测时间点',
      impact_assessment: '需要增加每位受试者约10分钟检测时间',
      response_actions: [
        { action: '已调整排程模板', assignee_id: 1, deadline: TODAY, status: 'completed' },
        { action: '通知所有CRC', assignee_id: 1, deadline: TODAY, status: 'completed' },
      ],
      status: 'completed',
      received_at: new Date().toISOString(),
    },
  ],
}

// ============================================================================
// KPI 指标 — workorderApi.analyticsKpi() 返回类型
// ============================================================================
export const kpiData = {
  on_time_completion_rate: 94.5,
  quality_audit_pass_rate: 91.0,
  exception_rate: 3.2,
  equipment_utilization: 78.5,
  avg_workorders_per_person: 6.8,
  avg_turnaround_hours: 4.2,
  details: {
    total_workorders: 120,
    completed_workorders: 90,
    on_time_completed: 85,
    total_audits: 60,
    passed_audits: 55,
    total_exceptions: 4,
    total_equipment: 15,
    assignee_count: 8,
  },
}

// ============================================================================
// 分析概览 — workorderApi.analyticsSummary() 返回类型
// ============================================================================
export const analyticsSummary = {
  summary: { total: 120, completed: 90, completion_rate: 75.0, overdue: 3, overdue_rate: 2.5 },
  status_distribution: [
    { status: 'completed', count: 90 },
    { status: 'in_progress', count: 18 },
    { status: 'pending', count: 8 },
    { status: 'review', count: 4 },
  ],
  daily_trend: [],
  by_assignee: [
    { assigned_to: 2, total: 42, completed: 38 },
    { assigned_to: 4, total: 38, completed: 30 },
  ],
}

// ============================================================================
// 工单列表
// ============================================================================
export const workOrderList = {
  items: [
    {
      id: 201, title: 'S-001 皮肤水分含量测试', status: 'pending',
      work_order_type: 'detection', scheduled_date: TODAY,
      assigned_to: 2, protocol_title: 'HYD-2026-001 保湿功效评价',
      create_time: new Date().toISOString(), due_date: null,
    },
    {
      id: 202, title: 'S-003 面部图像采集', status: 'in_progress',
      work_order_type: 'imaging', scheduled_date: TODAY,
      assigned_to: 2, protocol_title: 'ANT-2026-003 抗衰老功效评价',
      create_time: new Date().toISOString(), due_date: null,
    },
    {
      id: 203, title: 'S-005 色素/红斑测试', status: 'completed',
      work_order_type: 'detection', scheduled_date: TODAY,
      assigned_to: 4, protocol_title: 'WH-2026-002 美白功效评价',
      create_time: new Date().toISOString(), due_date: null,
    },
  ],
  total: 3,
}

// ============================================================================
// 协议（项目）数据
// ============================================================================
export const protocolList = {
  items: [
    { id: 1, title: 'HYD-2026-001 保湿功效评价', code: 'HYD-2026-001', status: 'active', sample_size: 60 },
    { id: 2, title: 'ANT-2026-003 抗衰老功效评价', code: 'ANT-2026-003', status: 'active', sample_size: 50 },
    { id: 3, title: 'WH-2026-002 美白功效评价', code: 'WH-2026-002', status: 'active', sample_size: 40 },
  ],
  total: 3,
}

export const protocolDetail = {
  id: 1, title: 'HYD-2026-001 保湿功效评价', code: 'HYD-2026-001',
  status: 'active', sample_size: 60,
}

// ============================================================================
// CRF 模板 — edcApi.getTemplate() 返回类型
// ============================================================================
export const crfTemplate = {
  id: 10,
  name: '皮肤水分含量检测 CRF',
  version: '1.0',
  is_active: true,
  schema: {
    title: '皮肤水分含量检测',
    description: '使用 Corneometer 检测受试者面部各部位皮肤水分含量',
    questions: [
      {
        id: 'ambient_temp', type: 'number', title: '环境温度(°C)',
        required: true, min: 15, max: 35, step: 0.1, unit: '°C',
        placeholder: '请输入检测环境温度',
      },
      {
        id: 'ambient_humidity', type: 'number', title: '环境湿度(%)',
        required: true, min: 20, max: 80, step: 1, unit: '%',
        placeholder: '请输入检测环境湿度',
      },
      {
        id: 'skin_condition', type: 'select', title: '皮肤状态',
        required: true,
        options: [
          { value: 'normal', label: '正常' },
          { value: 'dry', label: '偏干' },
          { value: 'oily', label: '偏油' },
          { value: 'combination', label: '混合' },
        ],
      },
      {
        id: 'forehead_moisture', type: 'number', title: '额部水分值',
        required: true, repeat: 3, auto_average: true,
        min: 0, max: 100, step: 0.1, unit: 'AU',
      },
      {
        id: 'adverse_event', type: 'radio', title: '不良反应',
        required: true,
        options: [
          { value: 'none', label: '无' },
          { value: 'mild', label: '轻度' },
          { value: 'moderate', label: '中度' },
          { value: 'severe', label: '重度' },
        ],
      },
      {
        id: 'notes', type: 'textarea', title: '备注',
        required: false, placeholder: '请输入备注信息',
      },
    ],
  },
  create_time: new Date().toISOString(),
}

// ============================================================================
// CRF 记录 — edcApi.listRecords() / createRecord() / updateRecord() 返回类型
// ============================================================================
export const crfRecordDraft = {
  id: 501,
  template_id: 10,
  template_name: '皮肤水分含量检测 CRF',
  work_order_id: 202,
  status: 'draft',
  data: { ambient_temp: 22.5, ambient_humidity: 45 },
  create_time: new Date().toISOString(),
  update_time: new Date().toISOString(),
}

export const crfRecordSubmitted = {
  id: 501,
  template_id: 10,
  template_name: '皮肤水分含量检测 CRF',
  work_order_id: 202,
  status: 'submitted',
  data: {
    ambient_temp: 22.5, ambient_humidity: 45,
    skin_condition: 'normal', forehead_moisture: 42.3,
    adverse_event: 'none', notes: '',
  },
  create_time: new Date().toISOString(),
  update_time: new Date().toISOString(),
}

export const crfValidationResult: Array<{ field_name: string; severity: string; message: string }> = []

// ============================================================================
// QR 码解析 — qrcodeApi.resolve() 返回类型
// ============================================================================
export const qrCodeResolveResult = {
  id: 1,
  qr_hash: 'abc123def456',
  entity_type: 'subject',
  entity_id: 1,
  label: 'S-001 王丽',
  entity_detail: {
    name: 'S-001 王丽',
    gender: '女',
    skin_type: 'II型',
    risk_level: 'low',
  },
  today_work_orders: [
    { id: 202, title: 'S-001 皮肤水分测试', status: 'in_progress' },
    { id: 203, title: 'S-001 TEWL 检测', status: 'pending' },
  ],
}

export const qrCodeResolveResultSingle = {
  ...qrCodeResolveResult,
  today_work_orders: [
    { id: 202, title: 'S-001 皮肤水分测试', status: 'in_progress' },
  ],
}

// ============================================================================
// 工单检查清单 — workorderApi.getChecklists() 返回类型
// ============================================================================
export const workOrderChecklists = [
  {
    id: 1, work_order_id: 202, item_text: '确认受试者身份',
    is_mandatory: true, is_checked: false, sort_order: 1,
  },
  {
    id: 2, work_order_id: 202, item_text: '检查设备校准状态',
    is_mandatory: true, is_checked: false, sort_order: 2,
  },
  {
    id: 3, work_order_id: 202, item_text: '确认环境温湿度达标',
    is_mandatory: true, is_checked: false, sort_order: 3,
  },
  {
    id: 4, work_order_id: 202, item_text: '记录受试者不适主诉（如有）',
    is_mandatory: false, is_checked: false, sort_order: 4,
  },
]

// ============================================================================
// 工单质量审计结果 — workorderApi.getQualityAudit() 返回类型
// ============================================================================
export const qualityAuditResults = [
  {
    id: 1, work_order_id: 202, result: 'auto_pass',
    completeness: 0.95, has_anomaly: false,
    reviewer_comment: '',
    create_time: new Date().toISOString(),
  },
]

// ============================================================================
// 进展报告 — workorderApi.generateProgressReport() 返回类型
// ============================================================================
export const progressReport = {
  protocol_id: 1,
  report_date: new Date().toISOString().split('T')[0],
  generated_at: new Date().toISOString(),
  workorder_summary: {
    today_total: 12, today_completed: 8, today_in_progress: 3,
    today_completion_rate: 66.7,
    overall_total: 120, overall_completed: 90, overall_completion_rate: 75.0,
    overdue_count: 1,
  },
  exceptions: [
    { id: 1, type: 'subject_no_show', severity: 'medium', description: '受试者S-010未按时到达', status: 'open', work_order_id: 198 },
  ],
  sample_status: { distributed: 45, returned: 42, pending_return: 3 },
  tomorrow_preview: { date: '2026-02-20', total_scheduled: 10, subjects_count: 6 },
  highlights: ['HYD-2026-001完成率达到64%'],
  issues: ['1个逾期工单'],
}

// ============================================================================
// 产能预测 — schedulingApi.predictProgress() 返回类型
// ============================================================================
export const capacityPrediction = {
  plan_id: 1,
  predicted_completion_date: '2026-04-15',
  confidence: 0.85,
  bottleneck_resources: [
    { resource_type: 'equipment', resource_name: 'Corneometer CM825', utilization: 0.95, suggestion: '建议增加一台设备或延长工作时间' },
    { resource_type: 'personnel', resource_name: 'CRC团队', utilization: 0.88, suggestion: '考虑临时增加人手' },
  ],
  schedule_adjustments: [
    { slot_id: 101, original_date: '2026-03-01', suggested_date: '2026-03-03', reason: '资源冲突' },
  ],
  risk_factors: ['设备CM825利用率接近饱和', '周三/周四为排程高峰'],
}

// ============================================================================
// 工单详情（含 crf_template_id，用于 CRF 内嵌测试）
// ============================================================================
export const workOrderDetailWithCRF = {
  id: 202, title: 'S-001 皮肤水分测试', status: 'in_progress',
  work_order_type: 'detection', scheduled_date: TODAY,
  assigned_to: 2, protocol_title: 'HYD-2026-001 保湿功效评价',
  create_time: new Date().toISOString(), due_date: null,
  description: '使用Corneometer检测受试者S-001面部皮肤水分含量',
  subject_name: 'S-001 王丽', visit_node_name: 'V1-基线访视',
  activity_name: '皮肤水分检测',
  crf_template_id: 10,
  resources: [
    {
      id: 1, resource_category_name: 'Corneometer CM825',
      resource_item_name: 'CM825-001', is_mandatory: true,
      required_quantity: 1, next_calibration_date: '2026-06-15',
    },
  ],
  completed_at: null,
}
