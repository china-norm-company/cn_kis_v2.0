/**
 * 设备管理工作台 — 模拟数据工厂
 *
 * 设计原则：
 * - 数据贴近化妆品 CRO 真实业务场景
 * - 设备名称、型号、校准周期均参考行业实际
 * - 数据之间存在业务关联（逾期设备、待维修设备、活跃使用等）
 * - 每个数据点都服务于某个业务验证目标
 */

const today = new Date().toISOString().split('T')[0]
const now = new Date().toISOString()

// 计算相对日期
function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ============================================================================
// 设备管理员身份
// ============================================================================
export const EQUIPMENT_MANAGER_USER = {
  open_id: 'ou_test_equipment_mgr_001',
  name: '李器衡',
  avatar: '',
  email: 'li.qiheng@cnkis.test',
}

export const AUTH_TOKEN = 'mock-e2e-token-equipment-mgr-001'

export const authProfileData = {
  id: 10,
  username: 'equipment_li',
  display_name: '李器衡',
  email: 'li.qiheng@cnkis.test',
  avatar: '',
  account_type: 'equipment_manager',
  roles: [
    { name: 'equipment_manager', display_name: '设备管理员', level: 3, category: 'support' },
  ],
  permissions: [
    'resource.equipment.read', 'resource.equipment.create', 'resource.equipment.update',
    'resource.calibration.read', 'resource.calibration.create',
    'resource.maintenance.read', 'resource.maintenance.create', 'resource.maintenance.update',
    'resource.usage.read',
    'resource.authorization.read', 'resource.authorization.create',
    'resource.method.read', 'resource.method.create', 'resource.method.update',
  ],
  data_scope: 'all',
  visible_workbenches: ['equipment'],
  visible_menu_items: {
    equipment: ['ledger', 'calibration', 'maintenance', 'usage', 'detection-methods'],
  },
}

export const authProfileResponse = { code: 0, msg: 'ok', data: authProfileData }

// ============================================================================
// 设备管理仪表盘数据
// 场景：周一早晨，设备管理员打开工作台
// ============================================================================
export const dashboardData = {
  summary: {
    total: 28,
    active: 22,
    maintenance: 3,
    calibrating: 1,
    idle: 1,
    retired: 1,
  },
  calibration_alerts: {
    overdue: 2,        // 2台设备校准已逾期！紧急
    due_in_7_days: 3,  // 3台7天内到期，需要立即安排
    due_in_30_days: 5, // 5台30天内到期，列入本月计划
  },
  maintenance_overview: {
    pending: 4,        // 4个待处理维护工单
    in_progress: 2,    // 2个进行中
    completed_this_month: 8,
  },
  recent_activities: [
    { type: 'calibration', equipment_name: 'Corneometer CM825 #1', description: '校准完成，结果：通过', time: new Date(Date.now() - 3600000).toISOString() },
    { type: 'maintenance', equipment_name: 'VISIA-CR #2', description: '预防性维护：镜头清洁完成', time: new Date(Date.now() - 7200000).toISOString() },
    { type: 'calibration', equipment_name: 'Tewameter TM300 #1', description: '校准不通过，已锁定设备', time: new Date(Date.now() - 86400000).toISOString() },
    { type: 'maintenance', equipment_name: 'Cutometer MPA580', description: '紧急维修：密封圈更换', time: new Date(Date.now() - 172800000).toISOString() },
  ],
  usage_today: {
    total_uses: 12,
    active_now: 3,
  },
}

// ============================================================================
// 设备台账数据 — 28台设备的代表性子集
// ============================================================================
export const equipmentList = {
  items: [
    {
      id: 1, name: 'Corneometer CM825 #1', code: 'EQ-CORN-001',
      category_id: 101, category_name: '皮肤水分测试仪',
      status: 'active', status_display: '在用',
      location: '恒温恒湿室A', manufacturer: 'Courage+Khazaka',
      model_number: 'CM825', serial_number: 'CK-2024-001',
      purchase_date: '2024-03-15', warranty_expiry: '2027-03-15',
      calibration_info: { last_date: '2026-01-15', next_due_date: '2026-04-15', days_remaining: 57, status: 'valid' },
      authorized_operators_count: 5, usage_count_30d: 42, manager_id: 10, create_time: '2024-03-15T10:00:00',
    },
    {
      id: 2, name: 'Corneometer CM825 #2', code: 'EQ-CORN-002',
      category_id: 101, category_name: '皮肤水分测试仪',
      status: 'active', status_display: '在用',
      location: '恒温恒湿室A', manufacturer: 'Courage+Khazaka',
      model_number: 'CM825', serial_number: 'CK-2024-002',
      purchase_date: '2024-03-15', warranty_expiry: '2027-03-15',
      calibration_info: { last_date: '2026-01-20', next_due_date: daysFromNow(5), days_remaining: 5, status: 'urgent' },
      authorized_operators_count: 5, usage_count_30d: 38, manager_id: 10, create_time: '2024-03-15T10:00:00',
    },
    {
      id: 3, name: 'VISIA-CR #1', code: 'EQ-VISIA-001',
      category_id: 102, category_name: '面部成像分析系统',
      status: 'active', status_display: '在用',
      location: '影像采集室', manufacturer: 'Canfield Scientific',
      model_number: 'VISIA-CR Gen7', serial_number: 'VS-2023-100',
      purchase_date: '2023-06-20', warranty_expiry: '2026-06-20',
      calibration_info: { last_date: '2026-02-01', next_due_date: '2026-05-01', days_remaining: 73, status: 'valid' },
      authorized_operators_count: 3, usage_count_30d: 28, manager_id: 10, create_time: '2023-06-20T10:00:00',
    },
    {
      id: 4, name: 'VISIA-CR #2', code: 'EQ-VISIA-002',
      category_id: 102, category_name: '面部成像分析系统',
      status: 'maintenance', status_display: '维护中',
      location: '影像采集室', manufacturer: 'Canfield Scientific',
      model_number: 'VISIA-CR Gen7', serial_number: 'VS-2024-200',
      purchase_date: '2024-01-10', warranty_expiry: '2027-01-10',
      calibration_info: { last_date: '2025-12-15', next_due_date: '2026-03-15', days_remaining: 26, status: 'expiring' },
      authorized_operators_count: 3, usage_count_30d: 0, manager_id: 10, create_time: '2024-01-10T10:00:00',
    },
    {
      id: 5, name: 'Mexameter MX18 #1', code: 'EQ-MEXA-001',
      category_id: 103, category_name: '皮肤色素测试仪',
      status: 'active', status_display: '在用',
      location: '恒温恒湿室A', manufacturer: 'Courage+Khazaka',
      model_number: 'MX18', serial_number: 'MX-2024-001',
      purchase_date: '2024-05-10', warranty_expiry: '2027-05-10',
      calibration_info: { last_date: '2025-12-01', next_due_date: daysFromNow(-3), days_remaining: -3, status: 'overdue' },
      authorized_operators_count: 4, usage_count_30d: 15, manager_id: 10, create_time: '2024-05-10T10:00:00',
    },
    {
      id: 6, name: 'Cutometer MPA580', code: 'EQ-CUTO-001',
      category_id: 104, category_name: '皮肤弹性测试仪',
      status: 'maintenance', status_display: '维护中',
      location: '恒温恒湿室B', manufacturer: 'Courage+Khazaka',
      model_number: 'MPA580', serial_number: 'CT-2023-001',
      purchase_date: '2023-08-01', warranty_expiry: '2026-08-01',
      calibration_info: { last_date: '2025-11-15', next_due_date: daysFromNow(-10), days_remaining: -10, status: 'overdue' },
      authorized_operators_count: 3, usage_count_30d: 0, manager_id: 10, create_time: '2023-08-01T10:00:00',
    },
    {
      id: 7, name: 'Tewameter TM300 #1', code: 'EQ-TEWA-001',
      category_id: 105, category_name: 'TEWL测试仪',
      status: 'calibrating', status_display: '校准中',
      location: '恒温恒湿室A', manufacturer: 'Courage+Khazaka',
      model_number: 'TM300', serial_number: 'TW-2024-001',
      purchase_date: '2024-02-20', warranty_expiry: '2027-02-20',
      calibration_info: { last_date: daysFromNow(-1), next_due_date: daysFromNow(89), days_remaining: 89, status: 'valid' },
      authorized_operators_count: 4, usage_count_30d: 20, manager_id: 10, create_time: '2024-02-20T10:00:00',
    },
    {
      id: 8, name: '皮肤 pH 计 #1', code: 'EQ-PH-001',
      category_id: 106, category_name: '皮肤pH测试仪',
      status: 'active', status_display: '在用',
      location: '恒温恒湿室B', manufacturer: 'Courage+Khazaka',
      model_number: 'PH905', serial_number: 'PH-2024-001',
      purchase_date: '2024-04-01', warranty_expiry: '2027-04-01',
      calibration_info: { last_date: '2026-01-10', next_due_date: daysFromNow(25), days_remaining: 25, status: 'expiring' },
      authorized_operators_count: 5, usage_count_30d: 18, manager_id: 10, create_time: '2024-04-01T10:00:00',
    },
  ],
  total: 28,
  page: 1,
  page_size: 20,
}

// ============================================================================
// 设备详情（Corneometer CM825 #1 完整档案）
// ============================================================================
export const equipmentDetail = {
  ...equipmentList.items[0],
  category_path: '设备 > 皮肤测量仪器 > 水分测量',
  calibration_cycle_days: 90,
  attributes: { probe_type: 'standard', measurement_range: '0-120 AU' },
  recent_calibrations: [
    { id: 201, calibration_type: 'internal', calibration_date: '2026-01-15', next_due_date: '2026-04-15', calibrator: '李器衡', certificate_no: 'CAL-2026-0115-001', certificate_file_url: '', result: 'pass', notes: '标准块校准值42.1，在标准范围42±2内', create_time: '2026-01-15T09:00:00' },
    { id: 200, calibration_type: 'internal', calibration_date: '2025-10-15', next_due_date: '2026-01-15', calibrator: '李器衡', certificate_no: 'CAL-2025-1015-001', certificate_file_url: '', result: 'pass', notes: '', create_time: '2025-10-15T09:00:00' },
    { id: 199, calibration_type: 'external', calibration_date: '2025-07-15', next_due_date: '2025-10-15', calibrator: '计量院', certificate_no: 'EXT-CAL-2025-0715', certificate_file_url: '/files/cal-cert-199.pdf', result: 'pass', notes: '年度外部校准', create_time: '2025-07-15T09:00:00' },
  ],
  recent_maintenances: [
    { id: 301, title: '季度预防性维护', maintenance_type: 'preventive', status: 'completed', maintenance_date: '2026-01-20', description: '探头清洁、连接线检查、软件更新', performed_by: '李器衡', cost: null, create_time: '2026-01-20T10:00:00' },
    { id: 300, title: '探头灵敏度异常修复', maintenance_type: 'corrective', status: 'completed', maintenance_date: '2025-11-05', description: '操作员反馈测量值偏低，更换探头密封圈后恢复正常', performed_by: '厂商技术支持', cost: 800, create_time: '2025-11-05T10:00:00' },
  ],
  recent_usages: [
    { id: 401, usage_type: 'workorder', usage_date: today, start_time: new Date(Date.now() - 3600000).toISOString(), end_time: new Date(Date.now() - 1800000).toISOString(), duration_minutes: 30, operator_id: 1, operator_name: '张技评', notes: '工单 WO-2026-0217-001', create_time: now },
    { id: 400, usage_type: 'workorder', usage_date: today, start_time: new Date(Date.now() - 7200000).toISOString(), end_time: new Date(Date.now() - 5400000).toISOString(), duration_minutes: 30, operator_id: 2, operator_name: '王检测', notes: '工单 WO-2026-0217-002', create_time: now },
    { id: 399, usage_type: 'manual', usage_date: daysFromNow(-1), start_time: null, end_time: null, duration_minutes: 15, operator_id: 3, operator_name: '赵实习', notes: '培训使用', create_time: now },
  ],
  authorizations: [
    { id: 501, operator_id: 1, operator_name: '张技评', authorized_at: '2025-06-15', expires_at: '2026-06-15', notes: 'Corneometer 高级操作资质' },
    { id: 502, operator_id: 2, operator_name: '王检测', authorized_at: '2025-08-01', expires_at: '2026-08-01', notes: 'Corneometer 标准操作资质' },
    { id: 503, operator_id: 3, operator_name: '赵实习', authorized_at: '2026-01-10', expires_at: '2026-07-10', notes: '培训中，需监督使用' },
    { id: 504, operator_id: 4, operator_name: '陈评估', authorized_at: '2025-03-01', expires_at: '2026-03-01', notes: '授权即将到期' },
    { id: 505, operator_id: 5, operator_name: '刘检测', authorized_at: '2025-09-15', expires_at: '2026-09-15', notes: '' },
  ],
}

// ============================================================================
// 校准计划数据
// ============================================================================
export const calibrationPlanData = {
  overdue: {
    count: 2,
    items: [
      { id: 5, name: 'Mexameter MX18 #1', code: 'EQ-MEXA-001', next_calibration_date: daysFromNow(-3), location: '恒温恒湿室A' },
      { id: 6, name: 'Cutometer MPA580', code: 'EQ-CUTO-001', next_calibration_date: daysFromNow(-10), location: '恒温恒湿室B' },
    ],
  },
  due_in_7_days: {
    count: 3,
    items: [
      { id: 2, name: 'Corneometer CM825 #2', code: 'EQ-CORN-002', next_calibration_date: daysFromNow(5), location: '恒温恒湿室A' },
      { id: 9, name: 'Sebumeter SM815', code: 'EQ-SEBU-001', next_calibration_date: daysFromNow(3), location: '恒温恒湿室A' },
      { id: 10, name: 'Glossymeter GL200', code: 'EQ-GLOS-001', next_calibration_date: daysFromNow(6), location: '恒温恒湿室B' },
    ],
  },
  due_this_month: {
    count: 5,
    items: [
      { id: 2, name: 'Corneometer CM825 #2', code: 'EQ-CORN-002', next_calibration_date: daysFromNow(5), location: '恒温恒湿室A' },
      { id: 8, name: '皮肤 pH 计 #1', code: 'EQ-PH-001', next_calibration_date: daysFromNow(25), location: '恒温恒湿室B' },
      { id: 9, name: 'Sebumeter SM815', code: 'EQ-SEBU-001', next_calibration_date: daysFromNow(3), location: '恒温恒湿室A' },
      { id: 10, name: 'Glossymeter GL200', code: 'EQ-GLOS-001', next_calibration_date: daysFromNow(6), location: '恒温恒湿室B' },
      { id: 11, name: 'Reviscometer RVM600', code: 'EQ-REVI-001', next_calibration_date: daysFromNow(20), location: '恒温恒湿室A' },
    ],
  },
}

// ============================================================================
// 校准记录列表
// ============================================================================
export const calibrationList = {
  items: [
    { id: 201, equipment_id: 1, equipment_name: 'Corneometer CM825 #1', equipment_code: 'EQ-CORN-001', calibration_type: 'internal', calibration_date: '2026-01-15', next_due_date: '2026-04-15', calibrator: '李器衡', certificate_no: 'CAL-2026-0115-001', certificate_file_url: '', result: 'pass', notes: '', create_time: '2026-01-15T09:00:00' },
    { id: 202, equipment_id: 7, equipment_name: 'Tewameter TM300 #1', equipment_code: 'EQ-TEWA-001', calibration_type: 'internal', calibration_date: daysFromNow(-1), next_due_date: daysFromNow(89), calibrator: '李器衡', certificate_no: 'CAL-2026-0216-001', certificate_file_url: '', result: 'fail', notes: '测量值偏差超过允许范围，已送外部校准', create_time: new Date(Date.now() - 86400000).toISOString() },
    { id: 203, equipment_id: 3, equipment_name: 'VISIA-CR #1', equipment_code: 'EQ-VISIA-001', calibration_type: 'external', calibration_date: '2026-02-01', next_due_date: '2026-05-01', calibrator: '计量院', certificate_no: 'EXT-CAL-2026-0201', certificate_file_url: '/files/cert-203.pdf', result: 'pass', notes: '年度外部校准', create_time: '2026-02-01T09:00:00' },
  ],
  total: 3,
  page: 1,
  page_size: 20,
}

// ============================================================================
// 维护工单数据
// ============================================================================
export const maintenanceList = {
  items: [
    { id: 301, equipment_id: 4, equipment_name: 'VISIA-CR #2', equipment_code: 'EQ-VISIA-002', title: '灯管亮度不均匀', maintenance_type: 'corrective', maintenance_type_display: '纠正性维护', status: 'pending', status_display: '待处理', maintenance_date: today, description: '操作员反馈：拍摄图像左侧偏暗，疑似UV灯管老化', performed_by: '', cost: null, next_maintenance_date: null, reported_by_id: 1, assigned_to_id: null, completed_at: null, result_notes: '', requires_recalibration: false, create_time: new Date(Date.now() - 7200000).toISOString() },
    { id: 302, equipment_id: 6, equipment_name: 'Cutometer MPA580', equipment_code: 'EQ-CUTO-001', title: '密封圈磨损更换', maintenance_type: 'emergency', maintenance_type_display: '紧急维修', status: 'in_progress', status_display: '处理中', maintenance_date: daysFromNow(-2), description: '测量时真空压力不稳定，密封圈老化导致漏气', performed_by: '', cost: null, next_maintenance_date: null, reported_by_id: 2, assigned_to_id: 10, completed_at: null, result_notes: '', requires_recalibration: true, create_time: new Date(Date.now() - 172800000).toISOString() },
    { id: 303, equipment_id: 1, equipment_name: 'Corneometer CM825 #1', equipment_code: 'EQ-CORN-001', title: '季度预防性维护', maintenance_type: 'preventive', maintenance_type_display: '预防性维护', status: 'pending', status_display: '待处理', maintenance_date: daysFromNow(7), description: '按Q1维护计划执行探头清洁、连接线检查、软件升级', performed_by: '', cost: null, next_maintenance_date: null, reported_by_id: 10, assigned_to_id: null, completed_at: null, result_notes: '', requires_recalibration: false, create_time: new Date(Date.now() - 86400000).toISOString() },
    { id: 304, equipment_id: 5, equipment_name: 'Mexameter MX18 #1', equipment_code: 'EQ-MEXA-001', title: '探头接触不良修复', maintenance_type: 'corrective', maintenance_type_display: '纠正性维护', status: 'pending', status_display: '待处理', maintenance_date: today, description: '校准时发现读数跳动，疑似探头连接松动', performed_by: '', cost: null, next_maintenance_date: null, reported_by_id: 10, assigned_to_id: null, completed_at: null, result_notes: '', requires_recalibration: true, create_time: new Date(Date.now() - 3600000).toISOString() },
    { id: 305, equipment_id: 8, equipment_name: '皮肤 pH 计 #1', equipment_code: 'EQ-PH-001', title: 'pH电极季度保养', maintenance_type: 'preventive', maintenance_type_display: '预防性维护', status: 'completed', status_display: '已完成', maintenance_date: daysFromNow(-5), description: '更换KCl保存液，清洁电极', performed_by: '李器衡', cost: 120, next_maintenance_date: daysFromNow(85), reported_by_id: 10, assigned_to_id: 10, completed_at: new Date(Date.now() - 432000000).toISOString(), result_notes: '保养完成，pH4/7标准液校验通过', requires_recalibration: false, create_time: new Date(Date.now() - 604800000).toISOString() },
  ],
  total: 5,
  page: 1,
  page_size: 20,
}

export const maintenanceStats = {
  pending: 4,
  in_progress: 2,
  completed_this_month: 8,
  avg_response_hours: 6.5,
}

// ============================================================================
// 使用记录
// ============================================================================
export const usageList = {
  items: [
    { id: 401, equipment_id: 1, equipment_name: 'Corneometer CM825 #1', equipment_code: 'EQ-CORN-001', work_order_id: 1001, usage_type: 'workorder', usage_date: today, start_time: new Date(Date.now() - 1800000).toISOString(), end_time: null, duration_minutes: null, operator_id: 1, operator_name: '张技评', notes: 'HYD-2026-001 S-001 V2', is_active: true, create_time: now },
    { id: 402, equipment_id: 3, equipment_name: 'VISIA-CR #1', equipment_code: 'EQ-VISIA-001', work_order_id: 1002, usage_type: 'workorder', usage_date: today, start_time: new Date(Date.now() - 3600000).toISOString(), end_time: new Date(Date.now() - 2400000).toISOString(), duration_minutes: 20, operator_id: 2, operator_name: '王检测', notes: 'ANT-2026-003 S-003 基线', is_active: false, create_time: now },
    { id: 403, equipment_id: 5, equipment_name: 'Mexameter MX18 #1', equipment_code: 'EQ-MEXA-001', work_order_id: 1003, usage_type: 'workorder', usage_date: today, start_time: new Date(Date.now() - 5400000).toISOString(), end_time: null, duration_minutes: null, operator_id: 1, operator_name: '张技评', notes: 'WH-2026-002 S-005 V4', is_active: true, create_time: now },
    { id: 404, equipment_id: 8, equipment_name: '皮肤 pH 计 #1', equipment_code: 'EQ-PH-001', work_order_id: null, usage_type: 'training', usage_date: today, start_time: new Date(Date.now() - 7200000).toISOString(), end_time: new Date(Date.now() - 5400000).toISOString(), duration_minutes: 30, operator_id: 3, operator_name: '赵实习', notes: '新员工培训使用', is_active: false, create_time: now },
    { id: 405, equipment_id: 1, equipment_name: 'Corneometer CM825 #1', equipment_code: 'EQ-CORN-001', work_order_id: 1004, usage_type: 'workorder', usage_date: daysFromNow(-1), start_time: null, end_time: null, duration_minutes: 25, operator_id: 4, operator_name: '陈评估', notes: '', is_active: false, create_time: now },
  ],
  total: 5,
  page: 1,
  page_size: 20,
}

export const usageStats = {
  today_count: 12,
  active_now: 3,
  total_duration_minutes: 1580,
  period_days: 30,
  by_equipment: [
    { equipment_id: 1, equipment_name: 'Corneometer CM825 #1', equipment_code: 'EQ-CORN-001', count: 42 },
    { equipment_id: 3, equipment_name: 'VISIA-CR #1', equipment_code: 'EQ-VISIA-001', count: 28 },
    { equipment_id: 7, equipment_name: 'Tewameter TM300 #1', equipment_code: 'EQ-TEWA-001', count: 20 },
    { equipment_id: 8, equipment_name: '皮肤 pH 计 #1', equipment_code: 'EQ-PH-001', count: 18 },
    { equipment_id: 5, equipment_name: 'Mexameter MX18 #1', equipment_code: 'EQ-MEXA-001', count: 15 },
  ],
  by_operator: [
    { operator_id: 1, operator_name: '张技评', count: 38 },
    { operator_id: 2, operator_name: '王检测', count: 35 },
    { operator_id: 4, operator_name: '陈评估', count: 22 },
    { operator_id: 5, operator_name: '刘检测', count: 18 },
    { operator_id: 3, operator_name: '赵实习', count: 8 },
  ],
}

// ============================================================================
// 操作授权
// ============================================================================
export const authorizationList = equipmentDetail.authorizations.map(a => ({
  ...a,
  equipment_id: 1,
  equipment_name: 'Corneometer CM825 #1',
  equipment_code: 'EQ-CORN-001',
  is_active: true,
  training_record: '',
  authorized_by_id: 10,
}))

// ============================================================================
// 检测方法
// ============================================================================
export const detectionMethodList = {
  items: [
    { id: 1, code: 'DM-CORN-001', name: 'Corneometer 皮肤角质层水分测定', name_en: 'Corneometer Skin Hydration Measurement', category: 'skin_hydration', category_display: '皮肤水分', description: '利用电容法测量皮肤角质层含水量', estimated_duration_minutes: 25, preparation_time_minutes: 5, temperature_range: '20~24°C', humidity_range: '40~60%', status: 'active', status_display: '有效', resource_count: 3, personnel_count: 2 },
    { id: 2, code: 'DM-CUTO-001', name: 'Cutometer 皮肤弹性测定', name_en: 'Cutometer Skin Elasticity Measurement', category: 'skin_elasticity', category_display: '皮肤弹性', description: '利用真空吸引法测量皮肤弹性参数(R0-R9)', estimated_duration_minutes: 30, preparation_time_minutes: 5, temperature_range: '20~24°C', humidity_range: '40~60%', status: 'active', status_display: '有效', resource_count: 2, personnel_count: 2 },
    { id: 3, code: 'DM-VISIA-001', name: 'VISIA 面部多光谱成像分析', name_en: 'VISIA Multi-Spectral Facial Imaging', category: 'skin_imaging', category_display: '皮肤成像', description: '多光谱成像分析面部色斑、毛孔、皱纹、纹理等', estimated_duration_minutes: 15, preparation_time_minutes: 10, temperature_range: '20~26°C', humidity_range: '30~70%', status: 'active', status_display: '有效', resource_count: 2, personnel_count: 1 },
    { id: 4, code: 'DM-MEXA-001', name: 'Mexameter 皮肤色素/红斑测定', name_en: 'Mexameter Melanin/Erythema Measurement', category: 'skin_color', category_display: '皮肤色素', description: '测量皮肤黑色素指数和红斑指数', estimated_duration_minutes: 20, preparation_time_minutes: 5, temperature_range: '20~24°C', humidity_range: '40~60%', status: 'active', status_display: '有效', resource_count: 2, personnel_count: 2 },
    { id: 5, code: 'DM-TEWA-001', name: 'Tewameter 经皮水分散失测定', name_en: 'Tewameter TEWL Measurement', category: 'skin_barrier', category_display: '皮肤屏障', description: '开放式腔体法测量经皮水分散失量', estimated_duration_minutes: 35, preparation_time_minutes: 10, temperature_range: '20~22°C', humidity_range: '40~50%', status: 'active', status_display: '有效', resource_count: 2, personnel_count: 2 },
    { id: 6, code: 'DM-PH-001', name: '皮肤表面 pH 值测定', name_en: 'Skin Surface pH Measurement', category: 'skin_ph', category_display: '皮肤pH值', description: '平面电极法测量皮肤表面pH值', estimated_duration_minutes: 15, preparation_time_minutes: 5, temperature_range: '20~24°C', humidity_range: '40~60%', status: 'active', status_display: '有效', resource_count: 2, personnel_count: 1 },
  ],
  total: 6,
  page: 1,
  page_size: 20,
}

export const detectionMethodDetail = {
  ...detectionMethodList.items[0],
  standard_procedure: '1. 受试者在恒温恒湿环境静坐30分钟\n2. 清洁测试部位\n3. 标记5个测试点位(间距2cm)\n4. 每个点位测量3次取平均值\n5. 探头垂直接触皮肤，保持1秒\n6. 记录并审核数据',
  sop_reference: 'SOP-DET-001 V3.0',
  sop_id: 1,
  temperature_min: 20, temperature_max: 24,
  humidity_min: 40, humidity_max: 60,
  environment_notes: '测量前受试者需在恒温恒湿环境中静坐适应至少30分钟',
  keywords: ['水分', '角质层', 'Corneometer', 'hydration', '保湿'],
  normal_range: { min: 30, max: 80, unit: 'AU' },
  measurement_points: [
    { name: '左前臂P1', description: '肘横纹远端5cm' },
    { name: '左前臂P2', description: '肘横纹远端7cm' },
    { name: '左前臂P3', description: '肘横纹远端9cm' },
  ],
  resources: [
    { id: 1, resource_type: 'equipment', resource_category_id: 101, resource_category__name: '皮肤水分测试仪', resource_category__code: 'CAT-CM', quantity: 1, is_mandatory: true, recommended_models: ['Corneometer CM825', 'Corneometer CM825 Pro'], usage_notes: '需每日使用前校准' },
    { id: 2, resource_type: 'consumable', resource_category_id: 201, resource_category__name: '探头保护膜', resource_category__code: 'CAT-PM', quantity: 5, is_mandatory: true, recommended_models: [], usage_notes: '一次性使用' },
    { id: 3, resource_type: 'consumable', resource_category_id: 202, resource_category__name: '75%酒精棉球', resource_category__code: 'CAT-AC', quantity: 10, is_mandatory: true, recommended_models: [], usage_notes: '探头消毒用' },
  ],
  personnel: [
    { id: 1, qualification_name: 'Corneometer 操作资质', qualification_code: 'QUAL-DET-CM', level: 'required', min_experience_months: 3, notes: '需完成厂商培训并通过考核' },
    { id: 2, qualification_name: 'GCP 培训证书', qualification_code: 'GCP', level: 'required', min_experience_months: 0, notes: '有效期内' },
  ],
  create_time: '2024-06-01T10:00:00',
}

// ============================================================================
// 设备类别（用于新增设备表单的下拉选择）
// ============================================================================
export const equipmentCategories = [
  { id: 101, name: '皮肤水分测试仪', code: 'CAT-CM' },
  { id: 102, name: '面部成像分析系统', code: 'CAT-VISIA' },
  { id: 103, name: '皮肤色素测试仪', code: 'CAT-MEXA' },
  { id: 104, name: '皮肤弹性测试仪', code: 'CAT-CUTO' },
  { id: 105, name: 'TEWL测试仪', code: 'CAT-TEWA' },
  { id: 106, name: '皮肤pH测试仪', code: 'CAT-PH' },
  { id: 107, name: '皮脂测试仪', code: 'CAT-SEBU' },
  { id: 108, name: '光泽度测试仪', code: 'CAT-GLOS' },
]
