/**
 * 设施环境管理工作台 — 模拟数据工厂
 *
 * 人设：设施管理员 赵坤元
 * 公司：化妆品 CRO 机构
 * 场景：负责试验物理环境的全方位管理，确保功效测量在标准化受控环境中进行
 *
 * 数据覆盖：
 * - 8 个场地（2 间恒温恒湿测试室 + 6 个功能区域）
 * - 15 条预约（覆盖 5 种状态）
 * - 48 条环境记录（含不合规记录）
 * - 6 个不合规事件（轻微 2 + 一般 2 + 严重 2，覆盖全部状态）
 * - 12 条清洁记录（日常 4 + 场次间 4 + 深度 2 + 特殊 2）
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

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600000).toISOString()
}

function todayAt(hour: number, minute = 0): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

// ============================================================================
// 认证数据
// ============================================================================

export const AUTH_TOKEN = 'mock-e2e-token-facility-manager'

export const FACILITY_MANAGER_USER = {
  open_id: 'ou_facility_manager_001',
  name: '赵坤元',
  avatar: '',
  email: 'zhaokunyuan@cnkis.test',
}

export const authProfileData = {
  id: 20,
  username: 'zhaokunyuan',
  display_name: '赵坤元',
  email: 'zhaokunyuan@cnkis.test',
  avatar: '',
  account_type: 'staff',
  roles: [
    { name: 'facility_manager', display_name: '设施管理员', level: 5, category: 'resource' },
  ],
  permissions: [
    'resource.venue.read',
    'resource.venue.write',
    'resource.environment.read',
    'resource.environment.write',
  ],
  data_scope: 'department',
  visible_workbenches: ['facility'],
  visible_menu_items: {
    facility: ['venues', 'reservations', 'environment', 'incidents', 'cleaning'],
  },
}

export const authProfileResponse = { code: 0, msg: 'ok', data: authProfileData }

// ============================================================================
// 场地列表（8 个场地）
// ============================================================================

export const venueList = {
  items: [
    {
      id: 1, name: '恒温恒湿测试室 A', code: 'VNU-TH-A', area: 35, capacity: 6,
      venue_type: 'testing_room', venue_type_display: '恒温恒湿测试室',
      floor: '3F', building: 'A栋', status: 'available', status_display: '空闲',
      control_level: 'strict', control_level_display: '严格控制',
      target_temp: 22, temp_tolerance: 2, target_humidity: 50, humidity_tolerance: 10,
      current_temp: 22.3, current_humidity: 48.5, is_compliant: true,
      equipment_count: 4, description: '核心皮肤测量室，配备 Corneometer、Tewameter、Cutometer、VISIA',
      create_time: '2025-06-01T09:00:00',
    },
    {
      id: 2, name: '恒温恒湿测试室 B', code: 'VNU-TH-B', area: 30, capacity: 4,
      venue_type: 'testing_room', venue_type_display: '恒温恒湿测试室',
      floor: '3F', building: 'A栋', status: 'in_use', status_display: '使用中',
      control_level: 'strict', control_level_display: '严格控制',
      target_temp: 22, temp_tolerance: 2, target_humidity: 50, humidity_tolerance: 10,
      current_temp: 21.8, current_humidity: 52.1, is_compliant: true,
      equipment_count: 3, description: '辅助测量室，配备 Tewameter、Mexameter、Skin-pH-Meter',
      create_time: '2025-06-01T09:00:00',
    },
    {
      id: 3, name: '受试者等候区', code: 'VNU-WAIT', area: 50, capacity: 20,
      venue_type: 'waiting_area', venue_type_display: '等候区',
      floor: '3F', building: 'A栋', status: 'available', status_display: '空闲',
      control_level: 'moderate', control_level_display: '一般控制',
      target_temp: 22, temp_tolerance: 2, target_humidity: 50, humidity_tolerance: 10,
      current_temp: 22.1, current_humidity: 49.2, is_compliant: true,
      equipment_count: 0, description: '受试者到达后静坐 30 分钟平衡适应环境',
      create_time: '2025-06-01T09:00:00',
    },
    {
      id: 4, name: '受试者洗漱区', code: 'VNU-WASH', area: 20, capacity: 5,
      venue_type: 'washing_area', venue_type_display: '洗漱区',
      floor: '3F', building: 'A栋', status: 'available', status_display: '空闲',
      control_level: 'basic', control_level_display: '基础控制',
      target_temp: 24, temp_tolerance: 4, target_humidity: 55, humidity_tolerance: 15,
      current_temp: 23.5, current_humidity: 58.0, is_compliant: true,
      equipment_count: 0, description: '受试者洗脸后等待恢复',
      create_time: '2025-06-01T09:00:00',
    },
    {
      id: 5, name: '仪器存放室', code: 'VNU-INST', area: 25, capacity: 2,
      venue_type: 'storage_room', venue_type_display: '仪器存放室',
      floor: '3F', building: 'A栋', status: 'available', status_display: '空闲',
      control_level: 'moderate', control_level_display: '一般控制',
      target_temp: 22, temp_tolerance: 3, target_humidity: 45, humidity_tolerance: 10,
      current_temp: 21.5, current_humidity: 43.0, is_compliant: true,
      equipment_count: 8, description: '精密仪器日常存放，恒温、防震、防尘',
      create_time: '2025-06-01T09:00:00',
    },
    {
      id: 6, name: '样品存储区', code: 'VNU-SAMP', area: 15, capacity: 2,
      venue_type: 'storage_room', venue_type_display: '样品存储区',
      floor: '2F', building: 'A栋', status: 'available', status_display: '空闲',
      control_level: 'strict', control_level_display: '严格控制',
      target_temp: 20, temp_tolerance: 5, target_humidity: 50, humidity_tolerance: 15,
      current_temp: 25.8, current_humidity: 68.0, is_compliant: false,
      equipment_count: 0, description: '分温区存放测试样品（常温/阴凉/冷藏）',
      create_time: '2025-06-01T09:00:00',
    },
    {
      id: 7, name: '数据处理室', code: 'VNU-DATA', area: 20, capacity: 4,
      venue_type: 'office', venue_type_display: '办公室',
      floor: '3F', building: 'A栋', status: 'maintenance', status_display: '维护中',
      control_level: 'basic', control_level_display: '基础控制',
      target_temp: 24, temp_tolerance: 4, target_humidity: 50, humidity_tolerance: 20,
      current_temp: 24.0, current_humidity: 50.0, is_compliant: true,
      equipment_count: 0, description: '数据录入和初步分析工作区',
      create_time: '2025-06-01T09:00:00',
    },
    {
      id: 8, name: '清洁准备间', code: 'VNU-CLEAN', area: 10, capacity: 2,
      venue_type: 'utility_room', venue_type_display: '功能间',
      floor: '3F', building: 'A栋', status: 'available', status_display: '空闲',
      control_level: 'basic', control_level_display: '基础控制',
      target_temp: 24, temp_tolerance: 4, target_humidity: 50, humidity_tolerance: 20,
      current_temp: 23.0, current_humidity: 47.0, is_compliant: true,
      equipment_count: 0, description: '耗材准备、仪器清洁工作间',
      create_time: '2025-06-01T09:00:00',
    },
  ],
  total: 8,
}

export const venueStats = {
  total: 8,
  available: 5,
  in_use: 1,
  maintenance: 1,
  non_compliant: 1,
}

export const venueDetail = {
  ...venueList.items[0],
  equipment_list: [
    { id: 1, name: 'Corneometer CM 825', code: 'EQ-CM825-001', status: 'active' },
    { id: 2, name: 'Tewameter TM 300', code: 'EQ-TM300-001', status: 'active' },
    { id: 3, name: 'Cutometer Dual MPA 580', code: 'EQ-CUT580-001', status: 'active' },
    { id: 4, name: 'VISIA-CR Gen7', code: 'EQ-VISIA-001', status: 'active' },
  ],
  recent_reservations: [
    { id: 1, purpose: '保湿美白功效评价 — 访视2检测', start_time: todayAt(9), end_time: todayAt(12), reserved_by_name: '张技评', status: 'confirmed' },
    { id: 2, purpose: 'SPF测试 — 基线检测', start_time: todayAt(14), end_time: todayAt(17), reserved_by_name: '李评估', status: 'confirmed' },
  ],
  recent_env_logs: [
    { id: 1, temperature: 22.3, humidity: 48.5, is_compliant: true, recorded_at: hoursFromNow(-1) },
    { id: 2, temperature: 22.1, humidity: 49.0, is_compliant: true, recorded_at: hoursFromNow(-2) },
    { id: 3, temperature: 22.0, humidity: 50.2, is_compliant: true, recorded_at: hoursFromNow(-3) },
  ],
}

// ============================================================================
// 场地预约（15 条）
// ============================================================================

export const reservationList = {
  items: [
    { id: 1, venue_id: 1, venue_name: '恒温恒湿测试室 A', start_time: todayAt(9), end_time: todayAt(12), purpose: '保湿美白功效评价 — 访视2检测', project_name: '保湿美白功效评价', reserved_by_name: '张技评', status: 'confirmed', status_display: '已确认', create_time: daysFromNow(-2) + 'T10:00:00' },
    { id: 2, venue_id: 1, venue_name: '恒温恒湿测试室 A', start_time: todayAt(14), end_time: todayAt(17), purpose: 'SPF测试 — 基线检测', project_name: 'SPF测试', reserved_by_name: '李评估', status: 'confirmed', status_display: '已确认', create_time: daysFromNow(-2) + 'T14:00:00' },
    { id: 3, venue_id: 2, venue_name: '恒温恒湿测试室 B', start_time: todayAt(9), end_time: todayAt(11, 30), purpose: '屏障修复评价 — 随访检测', project_name: '屏障修复评价', reserved_by_name: '张技评', status: 'in_use', status_display: '进行中', create_time: daysFromNow(-3) + 'T09:00:00' },
    { id: 4, venue_id: 2, venue_name: '恒温恒湿测试室 B', start_time: todayAt(13), end_time: todayAt(16), purpose: '抗皱功效评价 — 终点检测', project_name: '抗皱功效评价', reserved_by_name: '王研究', status: 'pending', status_display: '待确认', create_time: daysFromNow(0) + 'T08:00:00' },
    { id: 5, venue_id: 3, venue_name: '受试者等候区', start_time: todayAt(8, 30), end_time: todayAt(12), purpose: '受试者平衡适应 — 上午批次', project_name: '保湿美白功效评价', reserved_by_name: '张技评', status: 'confirmed', status_display: '已确认', create_time: daysFromNow(-2) + 'T10:00:00' },
    { id: 6, venue_id: 1, venue_name: '恒温恒湿测试室 A', start_time: daysFromNow(1) + 'T09:00:00', end_time: daysFromNow(1) + 'T12:00:00', purpose: '保湿美白功效评价 — 访视3检测', project_name: '保湿美白功效评价', reserved_by_name: '张技评', status: 'confirmed', status_display: '已确认', create_time: daysFromNow(-1) + 'T10:00:00' },
    { id: 7, venue_id: 2, venue_name: '恒温恒湿测试室 B', start_time: daysFromNow(1) + 'T09:00:00', end_time: daysFromNow(1) + 'T11:30:00', purpose: '祛斑美白评价 — 基线检测', project_name: '祛斑美白评价', reserved_by_name: '李评估', status: 'pending', status_display: '待确认', create_time: daysFromNow(0) + 'T07:30:00' },
    { id: 8, venue_id: 1, venue_name: '恒温恒湿测试室 A', start_time: daysFromNow(-1) + 'T09:00:00', end_time: daysFromNow(-1) + 'T12:00:00', purpose: '保湿美白功效评价 — 访视1检测', project_name: '保湿美白功效评价', reserved_by_name: '张技评', status: 'completed', status_display: '已完成', create_time: daysFromNow(-3) + 'T10:00:00' },
    { id: 9, venue_id: 2, venue_name: '恒温恒湿测试室 B', start_time: daysFromNow(-1) + 'T14:00:00', end_time: daysFromNow(-1) + 'T17:00:00', purpose: '防晒乳SPF复测', project_name: 'SPF测试', reserved_by_name: '李评估', status: 'completed', status_display: '已完成', create_time: daysFromNow(-3) + 'T14:00:00' },
    { id: 10, venue_id: 1, venue_name: '恒温恒湿测试室 A', start_time: daysFromNow(-2) + 'T14:00:00', end_time: daysFromNow(-2) + 'T17:00:00', purpose: '仪器设备校准（Corneometer）', project_name: '仪器校准', reserved_by_name: '张器衡', status: 'cancelled', status_display: '已取消', create_time: daysFromNow(-4) + 'T09:00:00' },
    { id: 11, venue_id: 3, venue_name: '受试者等候区', start_time: todayAt(13), end_time: todayAt(17), purpose: '受试者平衡适应 — 下午批次', project_name: 'SPF测试', reserved_by_name: '李评估', status: 'confirmed', status_display: '已确认', create_time: daysFromNow(-2) + 'T14:00:00' },
    { id: 12, venue_id: 1, venue_name: '恒温恒湿测试室 A', start_time: daysFromNow(2) + 'T09:00:00', end_time: daysFromNow(2) + 'T12:00:00', purpose: '抗皱功效评价 — 中期检测', project_name: '抗皱功效评价', reserved_by_name: '王研究', status: 'pending', status_display: '待确认', create_time: daysFromNow(0) + 'T09:00:00' },
    { id: 13, venue_id: 2, venue_name: '恒温恒湿测试室 B', start_time: daysFromNow(2) + 'T14:00:00', end_time: daysFromNow(2) + 'T17:00:00', purpose: '屏障修复评价 — 终点检测', project_name: '屏障修复评价', reserved_by_name: '张技评', status: 'confirmed', status_display: '已确认', create_time: daysFromNow(-1) + 'T10:00:00' },
    { id: 14, venue_id: 6, venue_name: '样品存储区', start_time: daysFromNow(0) + 'T10:00:00', end_time: daysFromNow(0) + 'T11:00:00', purpose: '样品入库 — 东方本草修复面霜', project_name: '屏障修复评价', reserved_by_name: '王度支', status: 'confirmed', status_display: '已确认', create_time: daysFromNow(-1) + 'T16:00:00' },
    { id: 15, venue_id: 5, venue_name: '仪器存放室', start_time: daysFromNow(1) + 'T08:00:00', end_time: daysFromNow(1) + 'T09:00:00', purpose: '仪器取出 — Tewameter 校准', project_name: '仪器校准', reserved_by_name: '张器衡', status: 'confirmed', status_display: '已确认', create_time: daysFromNow(0) + 'T15:00:00' },
  ],
  total: 15,
}

export const reservationStats = {
  today_count: 5,
  week_count: 15,
  pending_count: 3,
  utilization_rate: 72.5,
}

export const calendarData = {
  entries: reservationList.items.map(r => ({
    id: r.id,
    venue_name: r.venue_name,
    start_time: r.start_time,
    end_time: r.end_time,
    purpose: r.purpose,
    project_name: r.project_name,
    status: r.status,
  })),
}

// ============================================================================
// 环境监控记录（48 条 — 6 个受控场地各 8 条）
// ============================================================================

function buildEnvLogs(venueId: number, venueName: string, baseTemp: number, baseHumidity: number, tolerance: { temp: number; hum: number }) {
  const logs = []
  for (let i = 0; i < 8; i++) {
    const hoursAgo = i * 2
    const tempVariation = (Math.random() - 0.5) * 2
    const humVariation = (Math.random() - 0.5) * 5
    const temp = Math.round((baseTemp + tempVariation) * 10) / 10
    const hum = Math.round((baseHumidity + humVariation) * 10) / 10
    const isCompliant = Math.abs(temp - baseTemp) <= tolerance.temp && Math.abs(hum - baseHumidity) <= tolerance.hum
    logs.push({
      id: venueId * 100 + i + 1,
      venue_id: venueId,
      venue_name: venueName,
      temperature: temp,
      humidity: hum,
      airflow: venueId <= 2 ? Math.round((0.1 + Math.random() * 0.15) * 100) / 100 : null,
      illuminance: null,
      is_compliant: i < 6 ? isCompliant : false,
      non_compliance_reason: i >= 6 ? '温湿度偏离控制范围' : '',
      recorder_name: i % 2 === 0 ? '赵坤元' : '自动采集',
      recorded_at: hoursFromNow(-hoursAgo),
    })
  }
  return logs
}

const envLogsRoom1 = buildEnvLogs(1, '恒温恒湿测试室 A', 22, 50, { temp: 2, hum: 10 })
const envLogsRoom2 = buildEnvLogs(2, '恒温恒湿测试室 B', 22, 50, { temp: 2, hum: 10 })
const envLogsWait = buildEnvLogs(3, '受试者等候区', 22, 50, { temp: 2, hum: 10 })
const envLogsInst = buildEnvLogs(5, '仪器存放室', 22, 45, { temp: 3, hum: 10 })
const envLogsSamp = buildEnvLogs(6, '样品存储区', 20, 50, { temp: 5, hum: 15 })

export const environmentLogs = {
  items: [...envLogsRoom1, ...envLogsRoom2, ...envLogsWait, ...envLogsInst, ...envLogsSamp],
  total: 40,
}

export const environmentCurrent = {
  readings: venueList.items.filter(v => ['strict', 'moderate'].includes(v.control_level)).map(v => ({
    venue_id: v.id,
    venue_name: v.name,
    temperature: v.current_temp,
    humidity: v.current_humidity,
    is_compliant: v.is_compliant,
    target_temp: v.target_temp,
    temp_tolerance: v.temp_tolerance,
    target_humidity: v.target_humidity,
    humidity_tolerance: v.humidity_tolerance,
    last_updated: hoursFromNow(-0.5),
  })),
}

export const complianceStats = {
  overall_rate: 95.8,
  compliant_count: 184,
  non_compliant_count: 8,
  sensor_online_rate: 99.2,
  venues: [
    { venue_id: 1, venue_name: '恒温恒湿测试室 A', compliance_rate: 98.5, non_compliant_count: 1 },
    { venue_id: 2, venue_name: '恒温恒湿测试室 B', compliance_rate: 97.0, non_compliant_count: 2 },
    { venue_id: 3, venue_name: '受试者等候区', compliance_rate: 99.0, non_compliant_count: 1 },
    { venue_id: 5, venue_name: '仪器存放室', compliance_rate: 96.0, non_compliant_count: 2 },
    { venue_id: 6, venue_name: '样品存储区', compliance_rate: 88.0, non_compliant_count: 6 },
  ],
}

// ============================================================================
// 不合规事件（6 个）
// ============================================================================

export const incidentList = {
  items: [
    {
      id: 1, incident_no: 'INC-2026-001', venue_id: 6, venue_name: '样品存储区',
      severity: 'critical', severity_display: '严重',
      status: 'investigating', status_display: '调查中',
      title: '样品存储区温湿度持续超标',
      description: '样品存储区温度升至 25.8°C（标准 20±5°C 的上限），湿度达 68%（标准 50±15% 上限附近），空调制冷能力不足。',
      deviation_param: '温度 25.8°C / 湿度 68%', deviation_duration: '3 小时',
      affected_tests: '屏障修复评价 — 3 组样品可能受影响',
      root_cause: '空调压缩机老化，制冷效率下降',
      corrective_action: '已启用备用除湿机，联系物业维修空调',
      preventive_action: '',
      reporter_name: '赵坤元', assigned_to_name: '赵坤元',
      discovered_at: hoursFromNow(-6), create_time: hoursFromNow(-6),
    },
    {
      id: 2, incident_no: 'INC-2026-002', venue_id: 1, venue_name: '恒温恒湿测试室 A',
      severity: 'minor', severity_display: '轻微',
      status: 'closed', status_display: '已关闭',
      title: '测试室 A 短暂湿度波动',
      description: '受试者进出导致门频繁开关，湿度短暂偏高至 62%，10 分钟内自动恢复。',
      deviation_param: '湿度 62%', deviation_duration: '10 分钟',
      affected_tests: '无（偏离期间无测量进行）',
      root_cause: '受试者批量进入导致门频繁开关',
      corrective_action: '等待自动恢复，已确认数据无影响',
      preventive_action: '优化受试者入场流程，分批进入',
      reporter_name: '赵坤元', assigned_to_name: '赵坤元',
      discovered_at: daysFromNow(-3) + 'T10:15:00', create_time: daysFromNow(-3) + 'T10:15:00',
      closed_at: daysFromNow(-3) + 'T14:00:00',
    },
    {
      id: 3, incident_no: 'INC-2026-003', venue_id: 2, venue_name: '恒温恒湿测试室 B',
      severity: 'major', severity_display: '一般',
      status: 'corrected', status_display: '已纠正',
      title: '测试室 B 温度偏高 45 分钟',
      description: '下午阳光直射导致室温升高至 24.5°C，超出 22±2°C 范围，持续约 45 分钟。正在进行 TEWL 测量。',
      deviation_param: '温度 24.5°C', deviation_duration: '45 分钟',
      affected_tests: '屏障修复评价 — 访视2 TEWL 数据需要复核',
      root_cause: '西向窗户遮光帘未完全关闭',
      corrective_action: '关闭遮光帘，调低空调温度，数据已标注',
      preventive_action: '每次测量前检查遮光帘状态纳入 SOP checklist',
      reporter_name: '张技评', assigned_to_name: '赵坤元',
      discovered_at: daysFromNow(-2) + 'T14:30:00', create_time: daysFromNow(-2) + 'T14:30:00',
    },
    {
      id: 4, incident_no: 'INC-2026-004', venue_id: 5, venue_name: '仪器存放室',
      severity: 'minor', severity_display: '轻微',
      status: 'closed', status_display: '已关闭',
      title: '仪器存放室湿度短暂偏低',
      description: '换季期间空调除湿过度，湿度降至 32%。20 分钟后通过加湿器恢复。',
      deviation_param: '湿度 32%', deviation_duration: '20 分钟',
      affected_tests: '无',
      root_cause: '空调除湿模式设定值偏低',
      corrective_action: '调整空调湿度设定值',
      preventive_action: '换季前检查并调整空调参数',
      reporter_name: '赵坤元', assigned_to_name: '赵坤元',
      discovered_at: daysFromNow(-5) + 'T09:00:00', create_time: daysFromNow(-5) + 'T09:00:00',
      closed_at: daysFromNow(-4) + 'T10:00:00',
    },
    {
      id: 5, incident_no: 'INC-2026-005', venue_id: 1, venue_name: '恒温恒湿测试室 A',
      severity: 'critical', severity_display: '严重',
      status: 'open', status_display: '待处理',
      title: '测试室 A 空调制冷异响',
      description: '空调运行时发出异常噪音，虽然温湿度暂时正常，但存在故障风险。需要紧急检修。',
      deviation_param: '设备异常（暂未偏离）', deviation_duration: '持续中',
      affected_tests: '明日保湿美白功效评价检测可能受影响',
      root_cause: '',
      corrective_action: '',
      preventive_action: '',
      reporter_name: '赵坤元', assigned_to_name: '',
      discovered_at: hoursFromNow(-2), create_time: hoursFromNow(-2),
    },
    {
      id: 6, incident_no: 'INC-2026-006', venue_id: 3, venue_name: '受试者等候区',
      severity: 'major', severity_display: '一般',
      status: 'open', status_display: '待处理',
      title: '等候区通风系统风速偏高',
      description: '等候区风口风速测量达到 0.5 m/s，超过 0.3 m/s 限制。虽然等候区不直接测量，但受试者在此适应环境。',
      deviation_param: '风速 0.5 m/s', deviation_duration: '1 小时',
      affected_tests: '受试者平衡适应效果可能受影响',
      root_cause: '',
      corrective_action: '',
      preventive_action: '',
      reporter_name: '赵坤元', assigned_to_name: '',
      discovered_at: hoursFromNow(-1), create_time: hoursFromNow(-1),
    },
  ],
  total: 6,
}

export const incidentStats = {
  open_count: 2,
  month_new: 6,
  avg_response_minutes: 12,
  closure_rate: 50.0,
}

export const incidentDetail = {
  ...incidentList.items[0],
  timeline: [
    { step: 1, action: '发现异常', operator: '赵坤元', date: hoursFromNow(-6), detail: '巡检发现样品存储区温湿度偏高' },
    { step: 2, action: '创建事件', operator: '赵坤元', date: hoursFromNow(-6), detail: '创建严重级别不合规事件 INC-2026-001' },
    { step: 3, action: '紧急措施', operator: '赵坤元', date: hoursFromNow(-5.5), detail: '启用备用除湿机，联系物业检修空调' },
    { step: 4, action: '影响评估', operator: '赵坤元', date: hoursFromNow(-4), detail: '评估屏障修复评价 3 组样品可能受影响，通知物料管理员' },
  ],
}

// ============================================================================
// 清洁记录（12 条）
// ============================================================================

export const cleaningList = {
  items: [
    { id: 1, venue_id: 1, venue_name: '恒温恒湿测试室 A', cleaning_type: 'daily', type_display: '日常清洁', cleaner_name: '陈清洁', verifier_name: '赵坤元', status: 'verified', status_display: '已验证', cleaning_date: daysFromNow(0), cleaning_agents: '75%酒精、无尘布', checklist_items: 6, checklist_completed: 6, env_confirmed: true, create_time: daysFromNow(0) + 'T07:30:00' },
    { id: 2, venue_id: 2, venue_name: '恒温恒湿测试室 B', cleaning_type: 'daily', type_display: '日常清洁', cleaner_name: '陈清洁', verifier_name: '赵坤元', status: 'verified', status_display: '已验证', cleaning_date: daysFromNow(0), cleaning_agents: '75%酒精、无尘布', checklist_items: 6, checklist_completed: 6, env_confirmed: true, create_time: daysFromNow(0) + 'T07:45:00' },
    { id: 3, venue_id: 3, venue_name: '受试者等候区', cleaning_type: 'daily', type_display: '日常清洁', cleaner_name: '陈清洁', verifier_name: '', status: 'completed', status_display: '已完成', cleaning_date: daysFromNow(0), cleaning_agents: '中性清洁剂', checklist_items: 4, checklist_completed: 4, env_confirmed: true, create_time: daysFromNow(0) + 'T08:00:00' },
    { id: 4, venue_id: 4, venue_name: '受试者洗漱区', cleaning_type: 'daily', type_display: '日常清洁', cleaner_name: '陈清洁', verifier_name: '', status: 'completed', status_display: '已完成', cleaning_date: daysFromNow(0), cleaning_agents: '中性清洁剂、消毒液', checklist_items: 5, checklist_completed: 5, env_confirmed: true, create_time: daysFromNow(0) + 'T08:15:00' },
    { id: 5, venue_id: 1, venue_name: '恒温恒湿测试室 A', cleaning_type: 'between', type_display: '场次间清洁', cleaner_name: '陈清洁', verifier_name: '', status: 'completed', status_display: '已完成', cleaning_date: daysFromNow(-1), cleaning_agents: '75%酒精', checklist_items: 4, checklist_completed: 4, env_confirmed: true, create_time: daysFromNow(-1) + 'T12:15:00' },
    { id: 6, venue_id: 2, venue_name: '恒温恒湿测试室 B', cleaning_type: 'between', type_display: '场次间清洁', cleaner_name: '陈清洁', verifier_name: '', status: 'completed', status_display: '已完成', cleaning_date: daysFromNow(-1), cleaning_agents: '75%酒精', checklist_items: 4, checklist_completed: 4, env_confirmed: true, create_time: daysFromNow(-1) + 'T11:45:00' },
    { id: 7, venue_id: 1, venue_name: '恒温恒湿测试室 A', cleaning_type: 'between', type_display: '场次间清洁', cleaner_name: '陈清洁', verifier_name: '', status: 'pending', status_display: '待执行', cleaning_date: daysFromNow(0), cleaning_agents: '', checklist_items: 4, checklist_completed: 0, env_confirmed: false, create_time: daysFromNow(0) + 'T06:00:00' },
    { id: 8, venue_id: 2, venue_name: '恒温恒湿测试室 B', cleaning_type: 'between', type_display: '场次间清洁', cleaner_name: '', verifier_name: '', status: 'pending', status_display: '待执行', cleaning_date: daysFromNow(0), cleaning_agents: '', checklist_items: 4, checklist_completed: 0, env_confirmed: false, create_time: daysFromNow(0) + 'T06:00:00' },
    { id: 9, venue_id: 1, venue_name: '恒温恒湿测试室 A', cleaning_type: 'deep', type_display: '深度清洁', cleaner_name: '陈清洁', verifier_name: '赵坤元', status: 'verified', status_display: '已验证', cleaning_date: daysFromNow(-7), cleaning_agents: '75%酒精、无尘布、空调滤网清洁剂', checklist_items: 10, checklist_completed: 10, env_confirmed: true, create_time: daysFromNow(-7) + 'T07:00:00' },
    { id: 10, venue_id: 2, venue_name: '恒温恒湿测试室 B', cleaning_type: 'deep', type_display: '深度清洁', cleaner_name: '陈清洁', verifier_name: '赵坤元', status: 'verified', status_display: '已验证', cleaning_date: daysFromNow(-7), cleaning_agents: '75%酒精、无尘布、空调滤网清洁剂', checklist_items: 10, checklist_completed: 10, env_confirmed: true, create_time: daysFromNow(-7) + 'T08:00:00' },
    { id: 11, venue_id: 6, venue_name: '样品存储区', cleaning_type: 'special', type_display: '特殊清洁', cleaner_name: '陈清洁', verifier_name: '赵坤元', status: 'verified', status_display: '已验证', cleaning_date: daysFromNow(-4), cleaning_agents: '中性清洁剂、消毒液、防霉剂', checklist_items: 8, checklist_completed: 8, env_confirmed: true, create_time: daysFromNow(-4) + 'T09:00:00' },
    { id: 12, venue_id: 3, venue_name: '受试者等候区', cleaning_type: 'special', type_display: '特殊清洁', cleaner_name: '陈清洁', verifier_name: '赵坤元', status: 'verified', status_display: '已验证', cleaning_date: daysFromNow(-10), cleaning_agents: '消毒液、空气净化', checklist_items: 6, checklist_completed: 6, env_confirmed: true, create_time: daysFromNow(-10) + 'T07:00:00' },
  ],
  total: 12,
}

export const cleaningStats = {
  month_count: 12,
  execution_rate: 100,
  today_pending: 2,
  deep_pending: 0,
}

// ============================================================================
// 仪表盘数据
// ============================================================================

export const dashboardData = {
  venues: venueStats,
  reservations: reservationStats,
  environment: {
    compliance_rate: complianceStats.overall_rate,
    non_compliant_venues: 1,
    sensor_online_rate: complianceStats.sensor_online_rate,
  },
  incidents: incidentStats,
  cleaning: cleaningStats,
}
