/**
 * 环境资源管理页面类型定义
 */

// 监测类型
export type MonitoringType = "温湿度" | "照度" | "洁净度";

// 监测点状态
export type MonitoringStatus = "正常" | "警告" | "超标" | "设备离线";

// 监测点数据结构
export interface MonitoringPoint {
  id: string;
  name: string; // 监测点名称
  location: string; // 所属场地（完整路径）
  locationId: string; // 所属场地ID
  monitoringType: MonitoringType; // 监测类型
  standardRange: string; // 标准范围（文本描述）
  standardRangeMin?: number; // 标准范围最小值（用于计算）
  standardRangeMax?: number; // 标准范围最大值（用于计算）
  looseRangeMin?: number; // 宽松范围最小值（用于计算）
  looseRangeMax?: number; // 宽松范围最大值（用于计算）
  currentValue: string | null; // 当前值（如：23.1℃, 48%RH）
  lastUpdateTime: string | null; // 最后更新时间（ISO 8601格式）
  status: MonitoringStatus; // 状态（后端计算）
  relatedMethods: string[]; // 关联检测方法ID列表
  relatedMethodNames: string[]; // 关联检测方法名称列表（用于显示）
  lastCalibrationDate: string | null; // 最后校准日期（YYYY-MM-DD）
  nextCalibrationDate: string | null; // 下次校准日期（YYYY-MM-DD）
}

// 统计数据
export interface Statistics {
  total: number; // 监测点总数
  normal: number; // 正常点数
  warning: number; // 预警点数
  abnormal: number; // 异常点数（超标 + 设备离线）
}

// 筛选条件
export interface FilterConditions {
  searchKeyword: string; // 搜索关键词
  statuses: MonitoringStatus[]; // 当前状态（多选）
  monitoringTypes: MonitoringType[]; // 监测类型（多选）
  locationId: string | null; // 所属场地ID（单选）
  calibrationDateStart: string | null; // 最后校准日期开始
  calibrationDateEnd: string | null; // 最后校准日期结束
  relatedMethodId: string | null; // 关联检测方法ID（单选）
  hasActiveProject: "是" | "否" | "全部" | null; // 是否有执行中项目
}

// 历史数据点
export interface HistoryDataPoint {
  time: string; // 时间（ISO 8601格式）
  value: string; // 值
  status: MonitoringStatus; // 状态
}

// 校准记录
export interface CalibrationRecord {
  date: string; // 校准日期（YYYY-MM-DD）
  operator: string; // 操作人
  result: string; // 校准结果
}

// 监测点详情（包含历史数据和校准记录）
export interface MonitoringPointDetail extends MonitoringPoint {
  historyData: HistoryDataPoint[]; // 历史数据（近24小时）
  calibrationRecords: CalibrationRecord[]; // 校准记录
}

