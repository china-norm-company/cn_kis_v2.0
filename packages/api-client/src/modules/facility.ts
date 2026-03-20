/**
 * 设施环境管理工作台（坤元）API 模块
 *
 * 对应后端：/api/v1/facility/
 * 覆盖：仪表盘、场地管理、预约管理、环境监控、不合规事件、清洁记录
 */
import { api } from '../client'

// ============================================================================
// 类型定义
// ============================================================================

/** 设施仪表盘 */
export interface FacilityDashboard {
  venues: VenueStats
  reservations: ReservationStats
  environment: {
    compliance_rate: number
    non_compliant_venues: number
    sensor_online_rate: number
  }
  incidents: IncidentStats
  cleaning: CleaningStats
}

// ----- 场地管理 -----

export interface VenueStats {
  total: number
  available: number
  in_use: number
  maintenance: number
  non_compliant: number
  /** 实际导入的场地功能（用于筛选下拉） */
  venue_types?: Array<{ value: string; label: string }>
}

export interface VenueItem {
  id: number
  name: string
  code: string
  center: string
  area: number
  capacity: number
  venue_type: string
  venue_type_display: string
  env_requirements: string
  floor: string
  building: string
  status: string
  status_display: string
  control_level: string
  control_level_display: string
  target_temp: number
  temp_tolerance: number
  target_humidity: number
  humidity_tolerance: number
  current_temp: number | null
  current_humidity: number | null
  is_compliant: boolean
  equipment_count: number
  description: string
  create_time: string
}

export interface VenueDetail extends VenueItem {
  equipment_list: Array<{
    id: number
    name: string
    code: string
    status: string
  }>
  recent_reservations: Array<{
    id: number
    purpose: string
    start_time: string
    end_time: string
    reserved_by_name: string
    status: string
  }>
  recent_env_logs: Array<{
    id: number
    temperature: number
    humidity: number
    is_compliant: boolean
    recorded_at: string
  }>
}

export interface VenueCreateIn {
  name: string
  code: string
  center?: string
  area: number
  venue_type: string
  env_requirements?: string
  status?: string
  floor?: string
  building?: string
  capacity?: number
  control_level?: string
  target_temp?: number
  temp_tolerance?: number
  target_humidity?: number
  humidity_tolerance?: number
  description?: string
}

/** 场地信息变更入参（场地编号不可变更） */
export interface VenueChangeIn {
  venue_id: number
  name?: string
  center?: string
  area?: number
  venue_type?: string
  env_requirements?: string
  status?: string
  floor?: string
  building?: string
  capacity?: number
  description?: string
  target_temp?: number
  temp_tolerance?: number
  target_humidity?: number
  humidity_tolerance?: number
  control_level?: string
}

export interface VenueChangeLogItem {
  id: number
  venue_id: number
  venue_code: string
  venue_name: string
  changed_by_id?: number
  changed_by_name: string
  change_time: string
  before_data: Record<string, unknown>
  after_data: Record<string, unknown>
  changed_fields: string[]
}

export interface VenueChangeLogsResponse {
  items: VenueChangeLogItem[]
  total: number
  page: number
  page_size: number
}

// ----- 预约管理 -----

export interface ReservationStats {
  today_count: number
  week_count: number
  pending_count: number
  utilization_rate: number
}

export interface ReservationItem {
  id: number
  venue_id: number
  venue_name: string
  start_time: string
  end_time: string
  purpose: string
  project_name: string
  reserved_by_name: string
  status: string
  status_display: string
  create_time: string
}

export interface CalendarEntry {
  id: number
  venue_name: string
  start_time: string
  end_time: string
  purpose: string
  project_name: string
  status: string
}

export interface ReservationCreateIn {
  venue_id: number
  start_time: string
  end_time: string
  purpose: string
  project_name?: string
}

// ----- 环境监控 -----

export interface EnvironmentReading {
  venue_id: number
  venue_name: string
  temperature: number
  humidity: number
  is_compliant: boolean
  target_temp: number
  temp_tolerance: number
  target_humidity: number
  humidity_tolerance: number
  last_updated: string
}

export interface EnvironmentLog {
  id: number
  venue_id: number
  venue_name: string
  temperature: number
  humidity: number
  airflow: number | null
  illuminance: number | null
  is_compliant: boolean
  non_compliance_reason: string
  recorder_name: string
  recorded_at: string
}

export interface ComplianceStats {
  overall_rate: number
  compliant_count: number
  non_compliant_count: number
  sensor_online_rate: number
  venues: Array<{
    venue_id: number
    venue_name: string
    compliance_rate: number
    non_compliant_count: number
  }>
}

export interface EnvironmentLogCreateIn {
  venue_id: number
  temperature: number
  humidity: number
  airflow?: number
  illuminance?: number
  recorder_name?: string
}

// ----- 不合规事件 -----

export interface IncidentStats {
  open_count: number
  month_new: number
  avg_response_minutes: number
  closure_rate: number
}

export interface IncidentItem {
  id: number
  incident_no: string
  venue_id: number
  venue_name: string
  severity: string
  severity_display: string
  status: string
  status_display: string
  title: string
  description: string
  deviation_param: string
  deviation_duration: string
  affected_tests: string
  root_cause: string
  corrective_action: string
  preventive_action: string
  reporter_name: string
  assigned_to_name: string
  discovered_at: string
  create_time: string
  closed_at?: string
}

export interface IncidentDetail extends IncidentItem {
  timeline: Array<{
    step: number
    action: string
    operator: string
    date: string
    detail: string
  }>
}

export interface IncidentCreateIn {
  title: string
  venue_id: number
  severity: string
  description: string
  deviation_param?: string
}

// ----- 清洁记录 -----

export interface CleaningStats {
  month_count: number
  execution_rate: number
  today_pending: number
  deep_pending: number
}

export interface CleaningItem {
  id: number
  venue_id: number
  venue_name: string
  cleaning_type: string
  type_display: string
  cleaner_name: string
  verifier_name: string
  status: string
  status_display: string
  cleaning_date: string
  cleaning_agents: string
  checklist_items: number
  checklist_completed: number
  env_confirmed: boolean
  create_time: string
}

export interface CleaningCreateIn {
  venue_id: number
  cleaning_type: string
  cleaner_name: string
  cleaning_agents?: string
}

export interface CleaningUpdateIn {
  status?: string
  verifier_name?: string
  env_confirmed?: boolean
}

// ----- 房间使用时段 -----
export interface VenueUsageScheduleItem {
  id: number
  venue_id: number
  venue_name: string
  venue_code: string
  is_enabled: boolean
  schedule_type: 'recurring' | 'specific'
  days_of_week: number[]
  specific_date: string | null
  day_display: string
  start_time: string
  end_time: string
  create_time: string
}

export interface VenueUsageScheduleCreateIn {
  venue_id: number
  schedule_type?: 'recurring' | 'specific'
  days_of_week?: number[]
  specific_date?: string
  start_time?: string
  end_time?: string
  is_enabled?: boolean
}

export interface VenueUsageScheduleUpdateIn {
  schedule_type?: 'recurring' | 'specific'
  days_of_week?: number[]
  specific_date?: string
  start_time?: string
  end_time?: string
  is_enabled?: boolean
}

// ----- 场地监控人 -----
export interface VenueMonitorItem {
  id: number
  venue_id: number
  venue_name: string
  monitor_account_id: number
  monitor_display_name: string
  is_primary: boolean
  create_time: string
}

export interface VenueMonitorAddIn {
  venue_id: number
  monitor_account_id: number
  is_primary?: boolean
}

export interface AccountForMonitor {
  id: number
  display_name: string
  username: string
}

// ============================================================================
// API 方法
// ============================================================================

const BASE = '/facility'

export const facilityApi = {
  // ----- 仪表盘 -----
  getDashboard: () =>
    api.get<FacilityDashboard>(`${BASE}/dashboard`),

  // ----- 场地管理 -----
  getVenues: (params?: Record<string, string | number>) =>
    api.get<{ items: VenueItem[]; total: number }>(`${BASE}/venues`, { params }),

  getVenueStats: () =>
    api.get<VenueStats>(`${BASE}/venues/stats`),

  getVenueDetail: (id: number) =>
    api.get<VenueDetail>(`${BASE}/venues/${id}`),

  createVenue: (data: VenueCreateIn) =>
    api.post(`${BASE}/venues/create`, data),

  updateVenue: (id: number, data: Partial<VenueCreateIn>) =>
    api.put(`${BASE}/venues/${id}`, data),

  /** 下载场地导入模板（Excel 或 CSV） */
  async downloadVenueImportTemplate(format: 'xlsx' | 'csv' = 'xlsx') {
    const blob = (await api.get<Blob>(`${BASE}/venues/import/template`, {
      params: { format },
      responseType: 'blob',
    } as any)) as unknown as Blob
    if (blob instanceof Blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `venue_import_template.${format}`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    }
  },

  /** 批量导入场地（CSV 或 Excel） */
  importVenues(file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post<{
      total: number
      success: number
      failed: number
      created_ids: number[]
      errors: Array<{ row: number; code: string; message: string }>
    }>(`${BASE}/venues/import`, form)
  },

  /** 场地信息变更（变更后同步到列表，记录历史） */
  changeVenue: (data: VenueChangeIn) =>
    api.post<{ id: number; changed_fields: string[] }>(`${BASE}/venues/change`, data),

  /** 场地变更历史记录 */
  getVenueChangeLogs: (params?: { venue_id?: number; page?: number; page_size?: number }) =>
    api.get<VenueChangeLogsResponse>(`${BASE}/venues/change-logs`, { params }),

  // ----- 预约管理 -----
  getReservations: (params?: Record<string, string | number>) =>
    api.get<{ items: ReservationItem[]; total: number }>(`${BASE}/reservations`, { params }),

  getReservationStats: () =>
    api.get<ReservationStats>(`${BASE}/reservations/stats`),

  getCalendar: (params?: Record<string, string>) =>
    api.get<{ entries: CalendarEntry[] }>(`${BASE}/reservations/calendar`, { params }),

  createReservation: (data: ReservationCreateIn) =>
    api.post(`${BASE}/reservations/create`, data),

  confirmReservation: (id: number) =>
    api.put(`${BASE}/reservations/${id}/confirm`),

  cancelReservation: (id: number) =>
    api.put(`${BASE}/reservations/${id}/cancel`),

  // ----- 环境监控 -----
  getCurrentEnvironment: () =>
    api.get<{ readings: EnvironmentReading[] }>(`${BASE}/environment/current`),

  getEnvironmentLogs: (params?: Record<string, string | number>) =>
    api.get<{ items: EnvironmentLog[]; total: number }>(`${BASE}/environment/logs`, { params }),

  getComplianceStats: () =>
    api.get<ComplianceStats>(`${BASE}/environment/compliance`),

  createEnvironmentLog: (data: EnvironmentLogCreateIn) =>
    api.post(`${BASE}/environment/logs/create`, data),

  // ----- 房间使用时段 -----
  getVenueUsageSchedules: (params?: { venue_id?: number }) =>
    api.get<{ items: VenueUsageScheduleItem[] }>(`${BASE}/venue-usage-schedules`, { params }),

  createVenueUsageSchedule: (data: VenueUsageScheduleCreateIn) =>
    api.post(`${BASE}/venue-usage-schedules/create`, data),

  updateVenueUsageSchedule: (id: number, data: VenueUsageScheduleUpdateIn) =>
    api.put(`${BASE}/venue-usage-schedules/${id}`, data),

  deleteVenueUsageSchedule: (id: number) =>
    api.delete(`${BASE}/venue-usage-schedules/${id}`),

  // ----- 场地监控人 -----
  getVenueMonitors: (params?: { venue_id?: number }) =>
    api.get<{ items: VenueMonitorItem[] }>(`${BASE}/venue-monitors`, { params }),

  addVenueMonitor: (data: VenueMonitorAddIn) =>
    api.post(`${BASE}/venue-monitors/add`, data),

  removeVenueMonitor: (id: number) =>
    api.delete(`${BASE}/venue-monitors/${id}`),

  setVenuePrimaryMonitor: (id: number) =>
    api.put(`${BASE}/venue-monitors/${id}/set-primary`),

  getAccountsForMonitor: (params?: { keyword?: string; page?: number; page_size?: number }) =>
    api.get<{ items: AccountForMonitor[]; total: number }>(`${BASE}/accounts/for-monitor`, { params }),

  // ----- 不合规事件 -----
  getIncidents: (params?: Record<string, string | number>) =>
    api.get<{ items: IncidentItem[]; total: number }>(`${BASE}/incidents`, { params }),

  getIncidentStats: () =>
    api.get<IncidentStats>(`${BASE}/incidents/stats`),

  getIncidentDetail: (id: number) =>
    api.get<IncidentDetail>(`${BASE}/incidents/${id}`),

  createIncident: (data: IncidentCreateIn) =>
    api.post(`${BASE}/incidents/create`, data),

  updateIncident: (id: number, data: { status: string; [key: string]: unknown }) =>
    api.put(`${BASE}/incidents/${id}/update`, data),

  // ----- 清洁记录 -----
  getCleaningRecords: (params?: Record<string, string | number>) =>
    api.get<{ items: CleaningItem[]; total: number }>(`${BASE}/cleaning`, { params }),

  getCleaningStats: () =>
    api.get<CleaningStats>(`${BASE}/cleaning/stats`),

  createCleaningRecord: (data: CleaningCreateIn) =>
    api.post(`${BASE}/cleaning/create`, data),

  updateCleaningRecord: (id: number, data: CleaningUpdateIn) =>
    api.put(`${BASE}/cleaning/${id}/update`, data),
}
