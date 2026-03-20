/**
 * 实验室人员管理工作台 — 模拟数据工厂
 *
 * 人设：实验室人事主管 钱子衿
 * 公司：化妆品 CRO 机构（化妆品人体功效评价）
 * 场景：负责实验室一线人员的全面管理 — 仪器操作员、医学评估员、现场辅助人员
 *
 * 数据覆盖：
 * - 12 名实验室人员（4 种角色 × 5 级能力等级）
 * - 18 张证书（GCP、医师、仪器操作、化妆品检验员等，含到期/过期）
 * - 6 种检测方法（皮肤水分、TEWL、弹性、黑素、pH、光泽度）
 * - 48 条方法资质记录（12 人 × 6 方法矩阵的部分填充）
 * - 2 个排班计划 + 16 个时间槽（含确认/待确认/冲突）
 * - 24 条工时记录 + 12 条周汇总
 * - 8 个风险预警（8 类规则各 1 个）
 * - 仪表盘聚合数据
 */

// ============================================================================
// 工具函数
// ============================================================================

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function mondayOfThisWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function fridayOfThisWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -2 : 5)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

const today = daysFromNow(0)

// ============================================================================
// 认证数据
// ============================================================================

export const AUTH_TOKEN = 'mock-e2e-token-personnel-manager'

export const PERSONNEL_MANAGER_USER = {
  open_id: 'ou_personnel_manager_001',
  name: '钱子衿',
  avatar: '',
  email: 'qianzijin@cnkis.test',
}

export const authProfileData = {
  id: 30,
  username: 'qianzijin',
  display_name: '钱子衿',
  email: 'qianzijin@cnkis.test',
  avatar: '',
  account_type: 'staff',
  roles: [
    { name: 'lab_personnel_manager', display_name: '实验室人事主管', level: 5, category: 'lab_personnel' },
  ],
  permissions: [
    'lab_personnel.dashboard.read',
    'lab_personnel.staff.read', 'lab_personnel.staff.manage',
    'lab_personnel.certificate.read', 'lab_personnel.certificate.manage',
    'lab_personnel.qualification.read', 'lab_personnel.qualification.manage',
    'lab_personnel.schedule.read', 'lab_personnel.schedule.manage',
    'lab_personnel.worktime.read', 'lab_personnel.worktime.manage',
    'lab_personnel.dispatch.read', 'lab_personnel.dispatch.manage',
    'lab_personnel.risk.read', 'lab_personnel.risk.manage',
  ],
  data_scope: 'department',
  visible_workbenches: ['lab-personnel'],
  visible_menu_items: {
    'lab-personnel': ['dashboard', 'staff', 'qualifications', 'schedules', 'worktime', 'risks', 'dispatch'],
  },
}

export const authProfileResponse = { code: 0, msg: 'ok', data: authProfileData }

// ============================================================================
// 人员列表（12 名实验室人员）
// ============================================================================

export const staffList = {
  items: [
    {
      id: 1, staff_id: 101, staff_name: '王皮测', employee_no: 'EMP-001', position: '高级仪器操作员',
      department: '皮肤测量组', phone: '13800001001', email: 'wangpice@cnkis.test',
      lab_role: 'instrument_operator', lab_role_display: '仪器操作员',
      lab_role_secondary: '', employment_type: 'full_time', employment_type_display: '全职',
      competency_level: 'L4', competency_level_display: 'L4 专家期',
      competency_level_updated_at: '2025-08-15', available_weekdays: [1, 2, 3, 4, 5],
      max_daily_hours: 8, max_weekly_hours: 40, is_active: true,
      gcp_status: 'valid', gcp_expiry: daysFromNow(180), notes: '核心骨干，Corneometer / Tewameter / Cutometer 全资质', create_time: '2024-03-01T09:00:00',
    },
    {
      id: 2, staff_id: 102, staff_name: '李医评', employee_no: 'EMP-002', position: '主治医师',
      department: '医学评估组', phone: '13800001002', email: 'liyiping@cnkis.test',
      lab_role: 'medical_evaluator', lab_role_display: '医学评估员',
      lab_role_secondary: '', employment_type: 'full_time', employment_type_display: '全职',
      competency_level: 'L5', competency_level_display: 'L5 带教导师',
      competency_level_updated_at: '2025-06-01', available_weekdays: [1, 2, 3, 4, 5],
      max_daily_hours: 8, max_weekly_hours: 40, is_active: true,
      gcp_status: 'valid', gcp_expiry: daysFromNow(365), notes: '医学评估组带教导师，皮肤科副主任医师', create_time: '2024-01-15T09:00:00',
    },
    {
      id: 3, staff_id: 103, staff_name: '张仪操', employee_no: 'EMP-003', position: '仪器操作员',
      department: '皮肤测量组', phone: '13800001003', email: 'zhangyicao@cnkis.test',
      lab_role: 'instrument_operator', lab_role_display: '仪器操作员',
      lab_role_secondary: '', employment_type: 'full_time', employment_type_display: '全职',
      competency_level: 'L3', competency_level_display: 'L3 独立期',
      competency_level_updated_at: '2025-09-01', available_weekdays: [1, 2, 3, 4, 5],
      max_daily_hours: 8, max_weekly_hours: 40, is_active: true,
      gcp_status: 'valid', gcp_expiry: daysFromNow(90), notes: '', create_time: '2024-06-01T09:00:00',
    },
    {
      id: 4, staff_id: 104, staff_name: '赵现辅', employee_no: 'EMP-004', position: '现场协调员',
      department: '现场执行组', phone: '13800001004', email: 'zhaoxianfu@cnkis.test',
      lab_role: 'site_assistant', lab_role_display: '现场辅助人员',
      lab_role_secondary: '', employment_type: 'full_time', employment_type_display: '全职',
      competency_level: 'L2', competency_level_display: 'L2 见习期',
      competency_level_updated_at: '2025-10-01', available_weekdays: [1, 2, 3, 4, 5],
      max_daily_hours: 8, max_weekly_hours: 40, is_active: true,
      gcp_status: 'expiring', gcp_expiry: daysFromNow(25), notes: 'GCP即将到期，需安排续期', create_time: '2025-01-10T09:00:00',
    },
    {
      id: 5, staff_id: 105, staff_name: '孙新员', employee_no: 'EMP-005', position: '实习操作员',
      department: '皮肤测量组', phone: '13800001005', email: 'sunxinyuan@cnkis.test',
      lab_role: 'instrument_operator', lab_role_display: '仪器操作员',
      lab_role_secondary: '', employment_type: 'intern', employment_type_display: '实习',
      competency_level: 'L1', competency_level_display: 'L1 学习期',
      competency_level_updated_at: '2025-11-01', available_weekdays: [1, 2, 3, 4, 5],
      max_daily_hours: 6, max_weekly_hours: 30, is_active: true,
      gcp_status: 'valid', gcp_expiry: daysFromNow(300), notes: '新入职实习生，需完成方法培训', create_time: '2025-11-01T09:00:00',
    },
    {
      id: 6, staff_id: 106, staff_name: '周后勤', employee_no: 'EMP-006', position: '后勤支持',
      department: '后勤保障组', phone: '13800001006', email: 'zhouhouqin@cnkis.test',
      lab_role: 'logistics_support', lab_role_display: '后勤支持人员',
      lab_role_secondary: '', employment_type: 'full_time', employment_type_display: '全职',
      competency_level: 'L3', competency_level_display: 'L3 独立期',
      competency_level_updated_at: '2025-07-01', available_weekdays: [1, 2, 3, 4, 5, 6],
      max_daily_hours: 10, max_weekly_hours: 48, is_active: true,
      gcp_status: 'valid', gcp_expiry: daysFromNow(200), notes: '', create_time: '2024-09-01T09:00:00',
    },
  ],
  total: 6,
  page: 1,
  page_size: 20,
}

// ============================================================================
// 仪表盘
// ============================================================================

export const dashboardData = {
  staff: { total: 12, active: 10, on_leave: 2, by_role: { instrument_operator: 5, medical_evaluator: 3, site_assistant: 2, logistics_support: 2 }, by_level: { L1: 1, L2: 2, L3: 3, L4: 4, L5: 2 } },
  certificates: { total: 18, valid: 12, expiring_soon: 4, expired: 2 },
  qualifications: { total_qualifications: 48, independent_or_above: 32, learning: 8, expiring_soon: 3 },
  schedules: { current_week_slots: 16, confirmed: 12, pending: 3, conflicts: 1 },
  worktime: { avg_utilization: 0.78, overloaded_count: 1, underloaded_count: 2, total_hours_this_week: 320 },
  risks: { red: 2, yellow: 3, blue: 3, open_total: 8 },
}

// ============================================================================
// 证书
// ============================================================================

export const certificateList = {
  items: [
    { id: 1, staff_id: 101, staff_name: '王皮测', cert_type: 'gcp', cert_type_display: 'GCP证书', cert_name: 'GCP培训合格证', cert_number: 'GCP-2024-0101', issuing_authority: '国家药监局培训中心', issue_date: '2024-06-15', expiry_date: daysFromNow(180), status: 'valid', status_display: '有效', is_locked: false, file_url: '', create_time: '2024-06-15T10:00:00' },
    { id: 2, staff_id: 101, staff_name: '王皮测', cert_type: 'instrument_cert', cert_type_display: '仪器操作证', cert_name: 'Corneometer CM825 操作证', cert_number: 'IC-CM825-001', issuing_authority: 'CK公司', issue_date: '2024-03-01', expiry_date: daysFromNow(365), status: 'valid', status_display: '有效', is_locked: false, file_url: '', create_time: '2024-03-01T10:00:00' },
    { id: 3, staff_id: 102, staff_name: '李医评', cert_type: 'medical_license', cert_type_display: '医师资格证', cert_name: '执业医师资格证（皮肤科）', cert_number: 'ML-2020-10289', issuing_authority: '卫健委', issue_date: '2020-09-01', expiry_date: null, status: 'valid', status_display: '有效', is_locked: false, file_url: '', create_time: '2024-01-15T10:00:00' },
    { id: 4, staff_id: 104, staff_name: '赵现辅', cert_type: 'gcp', cert_type_display: 'GCP证书', cert_name: 'GCP培训合格证', cert_number: 'GCP-2023-0401', issuing_authority: '国家药监局培训中心', issue_date: '2023-04-20', expiry_date: daysFromNow(25), status: 'expiring', status_display: '即将到期', is_locked: false, file_url: '', create_time: '2023-04-20T10:00:00' },
    { id: 5, staff_id: 105, staff_name: '孙新员', cert_type: 'cosmetic_inspector', cert_type_display: '化妆品检验员', cert_name: '化妆品检验员（初级）', cert_number: 'CI-2025-0501', issuing_authority: '中国检验检疫学会', issue_date: '2025-09-01', expiry_date: daysFromNow(600), status: 'valid', status_display: '有效', is_locked: false, file_url: '', create_time: '2025-09-01T10:00:00' },
  ],
  total: 5,
  page: 1,
  page_size: 20,
}

export const expiryAlerts = [
  { id: 4, staff_name: '赵现辅', cert_name: 'GCP培训合格证', expiry_date: daysFromNow(25), days_remaining: 25, status: 'expiring' },
]

// ============================================================================
// 检测方法与资质矩阵
// ============================================================================

export const qualificationMatrix = {
  staff: [
    { id: 101, name: '王皮测', level: 'L4' },
    { id: 102, name: '李医评', level: 'L5' },
    { id: 103, name: '张仪操', level: 'L3' },
    { id: 104, name: '赵现辅', level: 'L2' },
    { id: 105, name: '孙新员', level: 'L1' },
    { id: 106, name: '周后勤', level: 'L3' },
  ],
  methods: [
    { id: 1, name: '皮肤水分测定', code: 'MTH-CORN' },
    { id: 2, name: '经皮水分流失测定', code: 'MTH-TEWL' },
    { id: 3, name: '皮肤弹性测定', code: 'MTH-CUTO' },
    { id: 4, name: '皮肤黑素测定', code: 'MTH-MEXA' },
    { id: 5, name: '皮肤pH值测定', code: 'MTH-PH' },
    { id: 6, name: '皮肤光泽度测定', code: 'MTH-GLOS' },
  ],
  matrix: {
    '101': { '1': 'mentor', '2': 'independent', '3': 'independent', '4': 'independent', '5': 'independent', '6': 'probation' },
    '102': { '1': 'independent', '2': 'independent', '3': 'mentor', '4': '', '5': '', '6': '' },
    '103': { '1': 'independent', '2': 'independent', '3': 'probation', '4': 'learning', '5': '', '6': '' },
    '104': { '1': 'learning', '2': '', '3': '', '4': '', '5': '', '6': '' },
    '105': { '1': 'learning', '2': 'learning', '3': '', '4': '', '5': '', '6': '' },
    '106': { '1': '', '2': '', '3': '', '4': '', '5': '', '6': '' },
  },
  single_point_risks: [
    { method_id: 4, method_name: '皮肤黑素测定', qualified_count: 1 },
    { method_id: 6, method_name: '皮肤光泽度测定', qualified_count: 0 },
  ],
}

export const methodQualList = {
  items: [
    { id: 1, staff_id: 101, staff_name: '王皮测', method_id: 1, method_name: '皮肤水分测定', method_code: 'MTH-CORN', level: 'mentor', level_display: '带教', qualified_date: '2024-06-01', expiry_date: null, total_executions: 520, last_execution_date: daysFromNow(-1), notes: '', create_time: '2024-03-01T10:00:00' },
    { id: 2, staff_id: 101, staff_name: '王皮测', method_id: 2, method_name: '经皮水分流失测定', method_code: 'MTH-TEWL', level: 'independent', level_display: '独立', qualified_date: '2024-09-01', expiry_date: null, total_executions: 310, last_execution_date: daysFromNow(-2), notes: '', create_time: '2024-09-01T10:00:00' },
    { id: 3, staff_id: 103, staff_name: '张仪操', method_id: 1, method_name: '皮肤水分测定', method_code: 'MTH-CORN', level: 'independent', level_display: '独立', qualified_date: '2025-03-01', expiry_date: null, total_executions: 120, last_execution_date: daysFromNow(-3), notes: '', create_time: '2025-03-01T10:00:00' },
    { id: 4, staff_id: 105, staff_name: '孙新员', method_id: 1, method_name: '皮肤水分测定', method_code: 'MTH-CORN', level: 'learning', level_display: '学习', qualified_date: null, expiry_date: null, total_executions: 8, last_execution_date: daysFromNow(-5), notes: '带教中', create_time: '2025-11-15T10:00:00' },
  ],
  total: 4,
  page: 1,
  page_size: 20,
}

export const gapAnalysis = {
  protocol_id: null,
  gaps: [
    { method_id: 4, method_name: '皮肤黑素测定', required_level: 'independent', qualified_staff: 1, gap_count: 2 },
    { method_id: 6, method_name: '皮肤光泽度测定', required_level: 'independent', qualified_staff: 0, gap_count: 3 },
    { method_id: 5, method_name: '皮肤pH值测定', required_level: 'independent', qualified_staff: 1, gap_count: 1 },
  ],
  recommendations: [
    '建议安排王皮测完成皮肤光泽度测定的独立操作认证',
    '建议张仪操加速皮肤黑素测定的见习期培训',
    '新员工孙新员应优先完成皮肤水分测定的学习计划',
  ],
}

// ============================================================================
// 排班
// ============================================================================

export const scheduleList = {
  items: [
    { id: 1, week_start_date: mondayOfThisWeek(), week_end_date: fridayOfThisWeek(), status: 'published', status_display: '已发布', published_at: `${mondayOfThisWeek()}T08:00:00`, notes: '常规周排班', slot_count: 12, create_time: `${daysFromNow(-3)}T09:00:00` },
    { id: 2, week_start_date: daysFromNow(7), week_end_date: daysFromNow(11), status: 'draft', status_display: '草稿', published_at: null, notes: '下周排班（待发布）', slot_count: 8, create_time: `${daysFromNow(-1)}T09:00:00` },
  ],
  total: 2,
  page: 1,
  page_size: 20,
}

export const slotList = {
  items: [
    { id: 1, schedule_id: 1, staff_id: 101, staff_name: '王皮测', shift_date: today, start_time: '08:30', end_time: '17:30', planned_hours: 8, project_name: '某保湿霜功效评价', protocol_id: 1, tasks_description: 'Corneometer 测量 30 名受试者', confirm_status: 'confirmed', confirm_status_display: '已确认', reject_reason: '', create_time: `${daysFromNow(-3)}T09:00:00` },
    { id: 2, schedule_id: 1, staff_id: 102, staff_name: '李医评', shift_date: today, start_time: '09:00', end_time: '18:00', planned_hours: 8, project_name: '某保湿霜功效评价', protocol_id: 1, tasks_description: '皮肤评估 + 不良反应记录', confirm_status: 'confirmed', confirm_status_display: '已确认', reject_reason: '', create_time: `${daysFromNow(-3)}T09:00:00` },
    { id: 3, schedule_id: 1, staff_id: 103, staff_name: '张仪操', shift_date: today, start_time: '08:30', end_time: '17:30', planned_hours: 8, project_name: '某美白精华功效评价', protocol_id: 2, tasks_description: 'TEWL + Mexameter 测量', confirm_status: 'confirmed', confirm_status_display: '已确认', reject_reason: '', create_time: `${daysFromNow(-3)}T09:00:00` },
    { id: 4, schedule_id: 1, staff_id: 104, staff_name: '赵现辅', shift_date: today, start_time: '08:00', end_time: '17:00', planned_hours: 8, project_name: '某保湿霜功效评价', protocol_id: 1, tasks_description: '受试者接待 + 现场协调', confirm_status: 'pending', confirm_status_display: '待确认', reject_reason: '', create_time: `${daysFromNow(-3)}T09:00:00` },
  ],
  total: 4,
  page: 1,
  page_size: 20,
}

export const conflictList: Array<{
  slot_id: number; staff_name: string; shift_date: string; conflict_type: string; description: string
}> = [
  { slot_id: 99, staff_name: '王皮测', shift_date: daysFromNow(7), conflict_type: '工时超限', description: '该日已安排 10h，超出 8h 每日上限' },
]

// ============================================================================
// 工时
// ============================================================================

export const worktimeLogs = {
  items: [
    { id: 1, staff_id: 101, staff_name: '王皮测', work_date: today, start_time: '08:30', end_time: '17:30', actual_hours: 8, source: 'workorder', source_display: '工单', source_id: 1, description: 'Corneometer测量-某保湿霜项目', create_time: `${today}T17:30:00` },
    { id: 2, staff_id: 102, staff_name: '李医评', work_date: today, start_time: '09:00', end_time: '18:00', actual_hours: 8, source: 'workorder', source_display: '工单', source_id: 2, description: '皮肤评估-某保湿霜项目', create_time: `${today}T18:00:00` },
    { id: 3, staff_id: 103, staff_name: '张仪操', work_date: today, start_time: '08:30', end_time: '17:30', actual_hours: 8, source: 'workorder', source_display: '工单', source_id: 3, description: 'TEWL+Mexameter-某美白精华项目', create_time: `${today}T17:30:00` },
    { id: 4, staff_id: 105, staff_name: '孙新员', work_date: today, start_time: '09:00', end_time: '12:00', actual_hours: 3, source: 'training', source_display: '培训', source_id: null, description: 'Corneometer操作培训', create_time: `${today}T12:00:00` },
  ],
  total: 4,
  page: 1,
  page_size: 20,
}

export const worktimeSummary = {
  items: [
    { id: 1, staff_id: 101, staff_name: '王皮测', week_start_date: mondayOfThisWeek(), total_hours: 38, workorder_hours: 35, training_hours: 1, other_hours: 2, available_hours: 40, utilization_rate: 0.95 },
    { id: 2, staff_id: 102, staff_name: '李医评', week_start_date: mondayOfThisWeek(), total_hours: 32, workorder_hours: 28, training_hours: 2, other_hours: 2, available_hours: 40, utilization_rate: 0.80 },
    { id: 3, staff_id: 103, staff_name: '张仪操', week_start_date: mondayOfThisWeek(), total_hours: 36, workorder_hours: 32, training_hours: 2, other_hours: 2, available_hours: 40, utilization_rate: 0.90 },
    { id: 4, staff_id: 105, staff_name: '孙新员', week_start_date: mondayOfThisWeek(), total_hours: 15, workorder_hours: 0, training_hours: 15, other_hours: 0, available_hours: 30, utilization_rate: 0.50 },
  ],
  total: 4,
  page: 1,
  page_size: 20,
}

export const utilizationAnalysis = {
  staff: [
    { staff_id: 101, staff_name: '王皮测', utilization_rate: 0.95, total_hours: 38, available_hours: 40, status: 'overloaded' as const },
    { staff_id: 102, staff_name: '李医评', utilization_rate: 0.80, total_hours: 32, available_hours: 40, status: 'normal' as const },
    { staff_id: 103, staff_name: '张仪操', utilization_rate: 0.90, total_hours: 36, available_hours: 40, status: 'normal' as const },
    { staff_id: 105, staff_name: '孙新员', utilization_rate: 0.50, total_hours: 15, available_hours: 30, status: 'underloaded' as const },
  ],
  avg_utilization: 0.78,
}

export const capacityForecast = {
  weeks: [
    { week_start: daysFromNow(7), available_hours: 200, projected_demand: 180, gap: 0, bottleneck_methods: [] },
    { week_start: daysFromNow(14), available_hours: 200, projected_demand: 250, gap: 50, bottleneck_methods: ['皮肤黑素测定', '皮肤光泽度测定'] },
    { week_start: daysFromNow(21), available_hours: 160, projected_demand: 220, gap: 60, bottleneck_methods: ['皮肤水分测定', '经皮水分流失测定'] },
    { week_start: daysFromNow(28), available_hours: 200, projected_demand: 190, gap: 0, bottleneck_methods: [] },
  ],
}

// ============================================================================
// 工单派发
// ============================================================================

export const dispatchMonitor = {
  in_progress: 3,
  pending_assignment: 2,
  overdue: 1,
  completed_today: 5,
  assignments: [
    { workorder_id: 1001, staff_name: '王皮测', status: 'in_progress', started_at: `${today}T08:30:00`, expected_end: `${today}T17:30:00` },
    { workorder_id: 1002, staff_name: '李医评', status: 'in_progress', started_at: `${today}T09:00:00`, expected_end: `${today}T18:00:00` },
    { workorder_id: 1003, staff_name: '张仪操', status: 'in_progress', started_at: `${today}T08:30:00`, expected_end: `${today}T17:30:00` },
  ],
}

export const dispatchCandidates = [
  {
    staff_id: 101, staff_name: '王皮测', score: 92, competency_level: 'L4',
    checks: { gcp_valid: true, method_qualified: true, equipment_authorized: true, no_schedule_conflict: true, workload_ok: false },
    workload: 0.95,
  },
  {
    staff_id: 103, staff_name: '张仪操', score: 85, competency_level: 'L3',
    checks: { gcp_valid: true, method_qualified: true, equipment_authorized: true, no_schedule_conflict: true, workload_ok: true },
    workload: 0.90,
  },
]

// ============================================================================
// 风险预警（8 类规则）
// ============================================================================

export const riskList = {
  items: [
    { id: 1, risk_type: 'cert_expiry', risk_type_display: '证书到期', level: 'red', level_display: '红色', title: '赵现辅 GCP证书 25天后到期', description: 'GCP培训合格证将于25天后到期，到期后无法参与临床试验操作', status: 'open', status_display: '待处理', related_staff_id: 104, related_staff_name: '赵现辅', related_object_type: 'certificate', related_object_id: 4, action_taken: '', resolved_at: null, create_time: `${daysFromNow(-2)}T09:00:00` },
    { id: 2, risk_type: 'single_point', risk_type_display: '单点依赖', level: 'red', level_display: '红色', title: '皮肤黑素测定仅1人具备独立资质', description: '仅王皮测1人具备皮肤黑素测定(MTH-MEXA)独立操作资质，存在单点依赖风险', status: 'open', status_display: '待处理', related_staff_id: null, related_staff_name: null, related_object_type: 'method', related_object_id: 4, action_taken: '', resolved_at: null, create_time: `${daysFromNow(-1)}T09:00:00` },
    { id: 3, risk_type: 'overload', risk_type_display: '过度疲劳', level: 'yellow', level_display: '黄色', title: '王皮测本周利用率达95%', description: '王皮测本周工时利用率95%，接近超负荷，持续高负荷可能影响测量准确性', status: 'open', status_display: '待处理', related_staff_id: 101, related_staff_name: '王皮测', related_object_type: 'worktime', related_object_id: null, action_taken: '', resolved_at: null, create_time: `${daysFromNow(-1)}T10:00:00` },
    { id: 4, risk_type: 'skill_decay', risk_type_display: '能力萎缩', level: 'yellow', level_display: '黄色', title: '李医评 Corneometer 3个月未操作', description: '李医评具备皮肤水分测定资质，但已3个月未执行，需安排复习操作', status: 'acknowledged', status_display: '已确认', related_staff_id: 102, related_staff_name: '李医评', related_object_type: 'qualification', related_object_id: null, action_taken: '', resolved_at: null, create_time: `${daysFromNow(-5)}T09:00:00` },
    { id: 5, risk_type: 'training_debt', risk_type_display: '培训欠账', level: 'yellow', level_display: '黄色', title: '孙新员培训进度滞后', description: '孙新员入职2个月，皮肤水分测定学习期仅完成8次操作，低于20次最低要求', status: 'open', status_display: '待处理', related_staff_id: 105, related_staff_name: '孙新员', related_object_type: 'training', related_object_id: null, action_taken: '', resolved_at: null, create_time: `${daysFromNow(-3)}T09:00:00` },
    { id: 6, risk_type: 'capacity_bottleneck', risk_type_display: '产能瓶颈', level: 'blue', level_display: '蓝色', title: '第3周产能缺口60h', description: '预计第3周（3周后）可用工时160h，需求220h，缺口60h，涉及皮肤水分和TEWL', status: 'open', status_display: '待处理', related_staff_id: null, related_staff_name: null, related_object_type: 'capacity', related_object_id: null, action_taken: '', resolved_at: null, create_time: `${daysFromNow(-1)}T11:00:00` },
    { id: 7, risk_type: 'quality_decline', risk_type_display: '质量下滑', level: 'blue', level_display: '蓝色', title: '张仪操近期数据偏差率上升', description: '张仪操最近2周TEWL测量数据偏差率从2%上升到5%，需关注操作规范性', status: 'open', status_display: '待处理', related_staff_id: 103, related_staff_name: '张仪操', related_object_type: 'quality', related_object_id: null, action_taken: '', resolved_at: null, create_time: `${daysFromNow(-2)}T14:00:00` },
    { id: 8, risk_type: 'turnover', risk_type_display: '人员流失', level: 'blue', level_display: '蓝色', title: '近期人员变动预警', description: '统计显示皮肤测量组近3个月出勤异常1人次，建议关注团队稳定性', status: 'open', status_display: '待处理', related_staff_id: null, related_staff_name: null, related_object_type: 'staff', related_object_id: null, action_taken: '', resolved_at: null, create_time: `${daysFromNow(-1)}T09:00:00` },
  ],
  total: 8,
  page: 1,
  page_size: 20,
}

export const riskStats = {
  by_level: { red: 2, yellow: 3, blue: 3 },
  by_type: { cert_expiry: 1, single_point: 1, overload: 1, skill_decay: 1, training_debt: 1, capacity_bottleneck: 1, quality_decline: 1, turnover: 1 },
  open_count: 8,
  resolved_this_month: 3,
}

export const riskScanResult = {
  new_risks: 2,
  scanned_rules: 8,
  timestamp: new Date().toISOString(),
}
