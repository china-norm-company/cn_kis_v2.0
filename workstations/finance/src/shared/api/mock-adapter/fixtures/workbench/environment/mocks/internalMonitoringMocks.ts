/**
 * 内部温湿度监控数据 Mock
 */

// 房间功能枚举值（根据截图）
export const ROOM_FUNCTION_OPTIONS = [
  "医生评估",
  "多功能间 (知情、问卷)",
  "沙龙",
  "防水项目测试",
  "防晒项目测试",
  "产品发放",
  "图像拍摄",
  "高温高湿",
  "彩妆评估",
  "平衡",
  "仪器测量",
  "等待",
  "储存",
  "离体测试",
  "防晒测试",
  "仪器测试",
  "平衡、仪器测量",
  "医美术",
  "医美外科手术",
  "知情、问卷",
  "solarlight",
  "接待",
] as const;

export type RoomFunction = typeof ROOM_FUNCTION_OPTIONS[number];

// 所属场地
export type Center = "中心A" | "中心B";

// 温湿度状态
export type TemperatureHumidityStatus = 
  | "温湿度正常"
  | "温湿度异常"
  | "仅温度异常"
  | "仅湿度异常";

// 是否有执行中项目
export type HasActiveProject = "有" | "无";

// 内部温湿度监控数据接口
export interface InternalMonitoringRecord {
  id: string;
  roomNo: string; // 房间编号
  roomFunction: RoomFunction; // 房间功能
  center: Center; // 所属场地
  deviceName: string; // 设备名称
  deviceCategory: string; // 设备名称分类
  deviceNo: string; // 设备编号
  temperature: number; // 温度(°C)
  humidity: number; // 湿度(%)
  recordTime: string; // 记录时间 (ISO格式)
  standardTempRangeRoom: string; // 标准温度范围（房间），格式：xx-xx
  standardTempRangeProject: string; // 标准温度范围（项目），格式：xx-xx
  standardHumidityRangeRoom: string; // 标准湿度范围（房间），格式：xx-xx
  standardHumidityRangeProject: string; // 标准湿度范围（项目），格式：xx-xx
  hasActiveProject: HasActiveProject; // 是否有执行中项目
  projectNo?: string; // 项目编号（如C25005046）
  customerShortName?: string; // 客户简称（如欧莱雅）
  status: TemperatureHumidityStatus; // 温湿度状态
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}

// 数据版本号
export const INTERNAL_MONITORING_DATA_VERSION = "v1.2";
const STORAGE_VERSION_KEY = "mock_internal_monitoring_version";
const STORAGE_KEY = "mock_internal_monitoring_data";

// 检查localStorage是否可用
function canUseLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && "localStorage" in window;
  } catch {
    return false;
  }
}

// 生成随机日期（最近30天内）
function randomDate(): string {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const hours = Math.floor(Math.random() * 24);
  const minutes = Math.floor(Math.random() * 60);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

// 生成项目编号（递增递减序号，如C25005046）
function generateProjectNo(index: number): string {
  const base = 25005000;
  return `C${base + index}`;
}

// 客户简称列表
const CUSTOMER_SHORT_NAMES = [
  "欧莱雅",
  "雅诗兰黛",
  "兰蔻",
  "资生堂",
  "SK-II",
  "倩碧",
  "娇兰",
  "迪奥",
  "香奈儿",
  "纪梵希",
];

// 设备名称列表
const DEVICE_NAMES = [
  "温湿度记录仪-001",
  "温湿度记录仪-002",
  "温湿度传感器-A01",
  "温湿度传感器-A02",
  "温湿度监控设备-B01",
  "温湿度监控设备-B02",
];

// 设备分类列表
const DEVICE_CATEGORIES = [
  "记录仪",
  "传感器",
  "监控设备",
];

// 初始化Mock数据
function initInternalMonitoringData(): InternalMonitoringRecord[] {
  const data: InternalMonitoringRecord[] = [];
  
  // 固定异常数据索引：
  // - 索引0, 1: 温度异常（仅温度异常）
  // - 索引2, 3, 4: 湿度异常（仅湿度异常）
  // - 其余: 正常数据
  
  for (let i = 0; i < 100; i++) {
    const roomFunction = ROOM_FUNCTION_OPTIONS[i % ROOM_FUNCTION_OPTIONS.length];
    const center: Center = i % 2 === 0 ? "中心A" : "中心B";
    const deviceIndex = i % DEVICE_NAMES.length;
    const deviceName = DEVICE_NAMES[deviceIndex];
    const deviceCategory = DEVICE_CATEGORIES[deviceIndex % DEVICE_CATEGORIES.length];
    
    // 根据索引判断异常类型
    let temperature: number;
    let humidity: number;
    let status: TemperatureHumidityStatus;
    
    if (i < 2) {
      // 前2个：仅温度异常
      temperature = Number((15 + Math.random() * 8).toFixed(1)); // 15-23°C，超出20-25范围
      humidity = Number((45 + Math.random() * 10).toFixed(1)); // 45-55%，正常范围
      status = "仅温度异常";
    } else if (i < 5) {
      // 接下来3个：仅湿度异常
      temperature = Number((22 + Math.random() * 2).toFixed(1)); // 22-24°C，正常范围
      humidity = Number((30 + Math.random() * 15).toFixed(1)); // 30-45%，超出40-60范围
      status = "仅湿度异常";
    } else {
      // 其余：正常数据
      temperature = Number((20 + Math.random() * 5).toFixed(1)); // 20-25°C
      humidity = Number((40 + Math.random() * 20).toFixed(1)); // 40-60%
      status = "温湿度正常";
    }
    
    // 随机决定是否有执行中项目
    const hasActiveProject: HasActiveProject = Math.random() > 0.5 ? "有" : "无";
    const projectNo = hasActiveProject === "有" ? generateProjectNo(i) : undefined;
    const customerShortName = hasActiveProject === "有" 
      ? CUSTOMER_SHORT_NAMES[i % CUSTOMER_SHORT_NAMES.length]
      : undefined;
    
    const recordTime = randomDate();
    const createdAt = recordTime;
    const updatedAt = recordTime;
    
    data.push({
      id: `monitoring-${i + 1}`,
      roomNo: `ROOM-${String(i + 1).padStart(3, "0")}`,
      roomFunction,
      center,
      deviceName,
      deviceCategory,
      deviceNo: `DEV-${String(i + 1).padStart(4, "0")}`,
      temperature,
      humidity,
      recordTime,
      standardTempRangeRoom: "20-25",
      standardTempRangeProject: "22-24",
      standardHumidityRangeRoom: "40-60",
      standardHumidityRangeProject: "45-55",
      hasActiveProject,
      projectNo,
      customerShortName,
      status,
      createdAt,
      updatedAt,
    });
  }
  
  return data;
}

// 获取所有监控记录
export function listInternalMonitoringRecords(): InternalMonitoringRecord[] {
  if (!canUseLocalStorage()) {
    return initInternalMonitoringData();
  }
  
  const storedVersion = window.localStorage.getItem(STORAGE_VERSION_KEY);
  
  // 检查版本号，如果版本不匹配，清除旧数据
  if (storedVersion !== INTERNAL_MONITORING_DATA_VERSION) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.setItem(STORAGE_VERSION_KEY, INTERNAL_MONITORING_DATA_VERSION);
  }
  
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // 如果解析失败，重新初始化
      const data = initInternalMonitoringData();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  }
  
  // 如果没有存储数据，初始化并保存
  const data = initInternalMonitoringData();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

// 根据ID获取记录
export function getInternalMonitoringRecordById(id: string): InternalMonitoringRecord | null {
  const records = listInternalMonitoringRecords();
  return records.find((r) => r.id === id) || null;
}

