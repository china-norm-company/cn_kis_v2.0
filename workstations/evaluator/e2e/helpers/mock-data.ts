/**
 * 模拟数据工厂
 *
 * 提供贴近真实化妆品 CRO 行业的测试数据，
 * 覆盖技术评估人员日常工作的所有信息需求。
 */

// ============================================================================
// 评估员身份
// ============================================================================
export const EVALUATOR_USER = {
  open_id: 'ou_test_evaluator_001',
  name: '张技评',
  avatar: '',
  email: 'zhang.jiping@cnkis.test',
}

export const AUTH_TOKEN = 'mock-e2e-token-evaluator-001'

// ============================================================================
// Dashboard 数据
// ============================================================================
export const dashboardData = {
  date: new Date().toISOString().split('T')[0],
  role: 'instrument_operator',
  stats: {
    pending: 3,
    accepted: 1,
    preparing: 0,
    in_progress: 2,
    completed: 5,
    total: 11,
  },
  work_orders: [
    {
      id: 101,
      title: 'Corneometer 皮肤水分含量测试',
      description: '受试者 S-001 第2次访视 皮肤含水量检测',
      status: 'pending',
      work_order_type: 'detection',
      scheduled_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 3600000).toISOString(),
      subject_name: 'S-001 王丽',
      protocol_title: 'HYD-2026-001 保湿功效评价',
    },
    {
      id: 102,
      title: 'VISIA 面部图像采集',
      description: '受试者 S-003 基线访视 全面部拍摄',
      status: 'in_progress',
      work_order_type: 'imaging',
      scheduled_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 7200000).toISOString(),
      subject_name: 'S-003 李雪',
      protocol_title: 'ANT-2026-003 抗衰老功效评价',
    },
    {
      id: 103,
      title: 'Mexameter 皮肤色素/红斑测试',
      description: '受试者 S-005 第4次访视 色素沉着评估',
      status: 'pending',
      work_order_type: 'detection',
      scheduled_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 10800000).toISOString(),
      subject_name: 'S-005 赵薇',
      protocol_title: 'WH-2026-002 美白功效评价',
    },
    {
      id: 104,
      title: 'Cutometer 皮肤弹性测试',
      description: '受试者 S-002 第3次访视 弹性参数检测',
      status: 'completed',
      work_order_type: 'detection',
      scheduled_date: new Date().toISOString(),
      due_date: new Date(Date.now() - 3600000).toISOString(),
      subject_name: 'S-002 陈明',
      protocol_title: 'ANT-2026-003 抗衰老功效评价',
    },
    {
      id: 105,
      title: 'Tewameter 经皮水分流失测试',
      description: '受试者 S-008 第1次访视 基线 TEWL 检测',
      status: 'pending',
      work_order_type: 'detection',
      scheduled_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 14400000).toISOString(),
      subject_name: 'S-008 刘洋',
      protocol_title: 'HYD-2026-001 保湿功效评价',
    },
  ],
  waiting_subjects: [
    { id: 1, name: 'S-001 王丽', checkin_time: '09:15', queue_number: 'A01' },
    { id: 2, name: 'S-003 李雪', checkin_time: '09:30', queue_number: 'A02' },
    { id: 3, name: 'S-008 刘洋', checkin_time: '09:45', queue_number: 'A03' },
  ],
  environment: {
    temperature: 22.5,
    humidity: 48,
    recorded_at: new Date().toISOString(),
    is_compliant: true,
  },
  instruments: [
    { id: 1, name: 'Corneometer CM825', calibration_status: 'valid', next_calibration_date: '2026-06-15' },
    { id: 2, name: 'VISIA CR3000', calibration_status: 'valid', next_calibration_date: '2026-05-20' },
    { id: 3, name: 'Mexameter MX18', calibration_status: 'expiring_soon', next_calibration_date: '2026-03-01' },
    { id: 4, name: 'Cutometer MPA580', calibration_status: 'valid', next_calibration_date: '2026-07-10' },
  ],
}

// ============================================================================
// 工单详情（用于 ExecutePage）
// ============================================================================
export const workOrderDetail = {
  id: 101,
  title: 'Corneometer 皮肤水分含量测试',
  description: '受试者 S-001 第2次访视 皮肤含水量检测',
  status: 'pending',
  work_order_type: 'detection',
  scheduled_date: new Date().toISOString(),
  due_date: new Date(Date.now() + 3600000).toISOString(),
  subject_name: 'S-001 王丽',
  subject_skin_type: '混合偏干',
  subject_risk_level: '低风险',
  protocol_title: 'HYD-2026-001 保湿功效评价',
  visit_node_name: 'V2 - 第2周访视',
  enrollment_id: 'ENR-2026-001-001',
  activity_name: '皮肤含水量测定（Corneometer）',
  resources: [
    { resource_category_name: '仪器', resource_item_name: 'Corneometer CM825', required_quantity: 1 },
    { resource_category_name: '耗材', resource_item_name: '探头保护膜', required_quantity: 5 },
    { resource_category_name: '耗材', resource_item_name: '75% 酒精棉球', required_quantity: 10 },
  ],
  checklist_items: [],
}

// ============================================================================
// 实验步骤
// ============================================================================
export const experimentSteps = [
  {
    id: 1001,
    step_number: 1,
    step_name: '受试者身份核验',
    step_description: '核对受试者编号、姓名、协议号，确认入组资格和知情同意书状态',
    estimated_duration_minutes: 2,
    status: 'pending',
    started_at: null,
    completed_at: null,
    actual_duration_minutes: null,
    execution_data: {},
    result: '',
    skip_reason: '',
  },
  {
    id: 1002,
    step_number: 2,
    step_name: '检测部位准备',
    step_description: '清洁检测区域（左前臂内侧），标记 5 个测试点位（间距 2cm），静置 20 分钟适应环境',
    estimated_duration_minutes: 5,
    status: 'pending',
    started_at: null,
    completed_at: null,
    actual_duration_minutes: null,
    execution_data: {},
    result: '',
    skip_reason: '',
  },
  {
    id: 1003,
    step_number: 3,
    step_name: '仪器校准确认',
    step_description: '使用标准校准块校准 Corneometer CM825，记录校准值（标准值 42±2）',
    estimated_duration_minutes: 3,
    status: 'pending',
    started_at: null,
    completed_at: null,
    actual_duration_minutes: null,
    execution_data: {},
    result: '',
    skip_reason: '',
  },
  {
    id: 1004,
    step_number: 4,
    step_name: '数据采集（5 点位测量）',
    step_description: '每个测试点位测量 3 次取平均值，探头垂直接触皮肤表面，保持恒定压力 1 秒',
    estimated_duration_minutes: 10,
    status: 'pending',
    started_at: null,
    completed_at: null,
    actual_duration_minutes: null,
    execution_data: {},
    result: '',
    skip_reason: '',
  },
  {
    id: 1005,
    step_number: 5,
    step_name: '数据审核与提交',
    step_description: '检查所有测量值的完整性和合理性，标记异常值（偏差 > 20%），提交检测数据',
    estimated_duration_minutes: 5,
    status: 'pending',
    started_at: null,
    completed_at: null,
    actual_duration_minutes: null,
    execution_data: {},
    result: '',
    skip_reason: '',
  },
]

// ============================================================================
// 排程数据
// ============================================================================
function getWeekRange(offset = 0) {
  const now = new Date()
  const day = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + 1 + offset * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    week_start: monday.toISOString().split('T')[0],
    week_end: sunday.toISOString().split('T')[0],
  }
}

export function buildScheduleData(offset = 0) {
  const { week_start, week_end } = getWeekRange(offset)
  const daily: Record<string, any[]> = {}

  const monday = new Date(week_start)
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = d.toISOString().split('T')[0]
    if (i < 5) {
      daily[key] = [
        {
          id: 200 + i * 3,
          title: `检测任务 ${i * 3 + 1}`,
          status: i < 2 ? 'completed' : 'pending',
          work_order_type: 'detection',
        },
        {
          id: 201 + i * 3,
          title: `检测任务 ${i * 3 + 2}`,
          status: 'pending',
          work_order_type: 'detection',
        },
      ]
    } else {
      daily[key] = []
    }
  }

  return {
    week_start,
    week_end,
    daily_schedule: daily,
    total_this_week: 10,
    next_week_count: 8,
  }
}

// ============================================================================
// SOP / 知识库数据
// ============================================================================
export const sopList = [
  {
    id: 1,
    title: 'SOP-DET-001 Corneometer 皮肤含水量测定标准操作规程',
    sop_number: 'SOP-DET-001',
    version: 'V3.0',
    category: '检测方法',
    status: 'active',
  },
  {
    id: 2,
    title: 'SOP-DET-002 Cutometer 皮肤弹性测定标准操作规程',
    sop_number: 'SOP-DET-002',
    version: 'V2.1',
    category: '检测方法',
    status: 'active',
  },
  {
    id: 3,
    title: 'SOP-DET-003 VISIA 面部成像分析标准操作规程',
    sop_number: 'SOP-DET-003',
    version: 'V1.5',
    category: '检测方法',
    status: 'active',
  },
  {
    id: 4,
    title: 'SOP-QC-010 检测室环境监控管理规程',
    sop_number: 'SOP-QC-010',
    version: 'V2.0',
    category: '质量控制',
    status: 'active',
  },
]

// ============================================================================
// 个人成长 / 资质数据
// ============================================================================
export const profileData = {
  role: 'instrument_operator',
  performance: {
    month_completed: 42,
    month_approved: 40,
    approval_rate: 95.2,
    on_time_rate: 97.6,
  },
  qualifications: [
    {
      qualification_name: 'Corneometer 操作资质',
      qualification_code: 'QUAL-DET-CM-2024',
      obtained_date: '2024-06-15',
      expiry_date: '2026-06-15',
      status: 'valid',
    },
    {
      qualification_name: 'VISIA 操作资质',
      qualification_code: 'QUAL-DET-VS-2025',
      obtained_date: '2025-01-20',
      expiry_date: '2027-01-20',
      status: 'valid',
    },
    {
      qualification_name: 'Mexameter 操作资质',
      qualification_code: 'QUAL-DET-MX-2024',
      obtained_date: '2024-03-10',
      expiry_date: '2026-03-10',
      status: 'valid',
    },
    {
      qualification_name: 'GCP 培训证书',
      qualification_code: 'GCP-2025-10086',
      obtained_date: '2025-05-01',
      expiry_date: '2026-05-01',
      status: 'valid',
    },
  ],
  trainings: [
    {
      training_name: 'Corneometer CM825 年度考核',
      training_date: '2026-01-15',
      status: 'completed',
      score: 96,
    },
    {
      training_name: 'GCP 年度继续教育',
      training_date: '2026-02-10',
      status: 'completed',
      score: 92,
    },
    {
      training_name: '新版 SOP-DET-001 V3.0 培训',
      training_date: '2026-02-20',
      status: 'pending',
      score: null,
    },
  ],
  monthly_trend: [
    { month: '2025-09', completed: 35, approved: 33, approval_rate: 94.3, on_time_rate: 97.1 },
    { month: '2025-10', completed: 38, approved: 36, approval_rate: 94.7, on_time_rate: 96.8 },
    { month: '2025-11', completed: 40, approved: 38, approval_rate: 95.0, on_time_rate: 97.5 },
    { month: '2025-12', completed: 36, approved: 35, approval_rate: 97.2, on_time_rate: 98.0 },
    { month: '2026-01', completed: 44, approved: 42, approval_rate: 95.5, on_time_rate: 97.7 },
    { month: '2026-02', completed: 42, approved: 40, approval_rate: 95.2, on_time_rate: 97.6 },
  ],
}

// ============================================================================
// 扫码解析结果
// ============================================================================
export const scanResult = {
  entity_type: 'subject',
  entity_detail: {
    name: 'S-001 王丽',
    gender: '女',
    skin_type: '混合偏干',
    risk_level: 'low',
  },
  today_work_orders: [
    {
      id: 101,
      title: 'Corneometer 皮肤水分含量测试',
      status: 'pending',
    },
  ],
}

// ============================================================================
// Auth Profile（权限画像）
// ============================================================================
export const authProfileData = {
  id: 1,
  username: 'evaluator_zhang',
  display_name: '张技评',
  email: 'zhang.jiping@cnkis.test',
  avatar: '',
  account_type: 'evaluator',
  roles: [
    { name: 'evaluator', display_name: '技术评估员', level: 3, category: 'lab' },
  ],
  permissions: [
    'workorder.workorder.read',
    'workorder.workorder.update',
    'workorder.step.read',
    'workorder.step.update',
    'workorder.exception.create',
    'workorder.detection.create',
    'quality.sop.read',
    'evaluator.dashboard.read',
    'evaluator.workorder.read',
    'evaluator.workorder.execute',
    'evaluator.step.read',
    'evaluator.step.execute',
    'evaluator.detection.create',
    'evaluator.detection.execute',
    'evaluator.exception.create',
    'evaluator.exception.read',
    'evaluator.profile.read',
    'evaluator.schedule.read',
    'signature.signature.create',
  ],
  data_scope: 'self',
  visible_workbenches: ['evaluator'],
  visible_menu_items: {
    evaluator: ['dashboard', 'scan', 'schedule', 'knowledge', 'growth'],
  },
}

export const authProfileResponse = {
  code: 0,
  msg: 'ok',
  data: authProfileData,
}

// ============================================================================
// 变更通知和系统公告
// ============================================================================
export const changeRequests = [
  {
    id: 1,
    title: '方案 HYD-2026-001 修订：增加 D28 访视点',
    description: '根据审评意见，在原 D0/D14/D42 的基础上增加 D28 中期访视，涵盖含水量和 TEWL 检测。',
    change_type: 'protocol_amendment',
    status: 'approved',
    created_at: '2026-02-15T10:00:00Z',
  },
  {
    id: 2,
    title: 'SOP-DET-001 V3.0 更新：Corneometer 探头更换周期调整',
    description: '将探头更换周期从 500 次缩短为 300 次，适配新款 CM825 探头。',
    change_type: 'sop_update',
    status: 'pending',
    created_at: '2026-02-18T14:30:00Z',
  },
]

export const announcements = [
  {
    id: 1,
    title: '系统维护通知：2026年2月22日凌晨 2:00-4:00',
    content: '届时系统将进行数据库升级维护，预计影响 2 小时。请提前保存数据。',
    is_important: true,
    published_at: '2026-02-19T09:00:00Z',
  },
  {
    id: 2,
    title: '新功能上线：仪器检测管理面板',
    content: '评估台新增仪器检测创建、执行和 QC 判定功能，详见操作手册。',
    is_important: false,
    published_at: '2026-02-20T08:00:00Z',
  },
]

// 工单评论
export const workOrderComments = [
  {
    id: 1,
    author_name: '李调度',
    content: '该受试者今日状态良好，可以正常检测',
    created_at: '2026-02-20T09:00:00Z',
  },
  {
    id: 2,
    author_name: '张技评',
    content: '收到，准备开始执行',
    created_at: '2026-02-20T09:15:00Z',
  },
]
