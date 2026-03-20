/**
 * 外部天气数据 Mock 数据存储
 * 遵循 Mock 数据规范：Seed数据 + localStorage持久化
 */
import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";

// Storage Key
export const EXTERNAL_WEATHER_STORAGE_KEY = "mock_external_weather_store";
// Seed数据版本号
const SEED_DATA_VERSION = "v1.1";
const STORAGE_VERSION_KEY = `${EXTERNAL_WEATHER_STORAGE_KEY}_version`;

// 外部天气数据类型
export interface ExternalWeather {
  id: string;
  city: string; // 城市
  temperature: number; // 温度(°C)
  humidity: number; // 湿度(%)
  uvIndex: number; // 紫外线指数
  weatherCondition: string; // 天气状况
  recordTime: string; // 记录时间
  createdAt: string;
  updatedAt: string;
}

// 生成基于当前时间的记录时间（确保不晚于当前时间）
function generateRecordTime(daysAgo: number, hour: number = 8, minute: number = 0): string {
  const now = new Date();
  const recordDate = new Date(now);
  recordDate.setDate(recordDate.getDate() - daysAgo);
  recordDate.setHours(hour, minute, 0, 0);
  
  const year = recordDate.getFullYear();
  const month = String(recordDate.getMonth() + 1).padStart(2, "0");
  const day = String(recordDate.getDate()).padStart(2, "0");
  const hours = String(hour).padStart(2, "0");
  const minutes = String(minute).padStart(2, "0");
  
  return `${year}-${month}-${day} ${hours}:${minutes}:00`;
}

// Seed数据 - 使用基于当前时间的相对日期
const SEED_EXTERNAL_WEATHER_DATA: ExternalWeather[] = [
  // 当日数据
  {
    id: "1",
    city: "北京",
    temperature: 22,
    humidity: 65,
    uvIndex: 5,
    weatherCondition: "晴",
    recordTime: generateRecordTime(0, 8, 0), // 今天8点
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    city: "上海",
    temperature: 18,
    humidity: 72,
    uvIndex: 3,
    weatherCondition: "多云",
    recordTime: generateRecordTime(0, 9, 30), // 今天9:30
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    city: "广州",
    temperature: 25,
    humidity: 68,
    uvIndex: 6,
    weatherCondition: "晴",
    recordTime: generateRecordTime(0, 10, 0), // 今天10点
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // 最近1周的数据
  {
    id: "4",
    city: "深圳",
    temperature: 24,
    humidity: 70,
    uvIndex: 7,
    weatherCondition: "晴",
    recordTime: generateRecordTime(1, 8, 0), // 1天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "5",
    city: "杭州",
    temperature: 20,
    humidity: 75,
    uvIndex: 4,
    weatherCondition: "小雨",
    recordTime: generateRecordTime(2, 8, 0), // 2天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "6",
    city: "北京",
    temperature: 15,
    humidity: 58,
    uvIndex: 2,
    weatherCondition: "阴",
    recordTime: generateRecordTime(3, 8, 0), // 3天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "7",
    city: "上海",
    temperature: 16,
    humidity: 68,
    uvIndex: 3,
    weatherCondition: "多云",
    recordTime: generateRecordTime(4, 8, 0), // 4天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "8",
    city: "广州",
    temperature: 23,
    humidity: 70,
    uvIndex: 5,
    weatherCondition: "晴",
    recordTime: generateRecordTime(5, 8, 0), // 5天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "9",
    city: "深圳",
    temperature: 22,
    humidity: 72,
    uvIndex: 6,
    weatherCondition: "晴",
    recordTime: generateRecordTime(6, 8, 0), // 6天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // 最近1个月的数据
  {
    id: "10",
    city: "杭州",
    temperature: 18,
    humidity: 80,
    uvIndex: 2,
    weatherCondition: "小雨",
    recordTime: generateRecordTime(10, 8, 0), // 10天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "11",
    city: "北京",
    temperature: 10,
    humidity: 55,
    uvIndex: 1,
    weatherCondition: "阴",
    recordTime: generateRecordTime(15, 8, 0), // 15天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "12",
    city: "上海",
    temperature: 12,
    humidity: 65,
    uvIndex: 2,
    weatherCondition: "多云",
    recordTime: generateRecordTime(20, 8, 0), // 20天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "13",
    city: "成都",
    temperature: 19,
    humidity: 78,
    uvIndex: 3,
    weatherCondition: "阴",
    recordTime: generateRecordTime(25, 8, 0), // 25天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // 最近3个月的数据
  {
    id: "14",
    city: "成都",
    temperature: 17,
    humidity: 82,
    uvIndex: 2,
    weatherCondition: "小雨",
    recordTime: generateRecordTime(60, 8, 0), // 60天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "15",
    city: "成都",
    temperature: 15,
    humidity: 85,
    uvIndex: 1,
    weatherCondition: "小雨",
    recordTime: generateRecordTime(90, 8, 0), // 90天前
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// 初始化数据存储
function initExternalWeatherStore() {
  if (!canUseLocalStorage()) return;

  const storedVersion = window.localStorage.getItem(STORAGE_VERSION_KEY);

  // 检查版本号，如果版本不匹配，清除旧数据
  if (storedVersion !== SEED_DATA_VERSION) {
    window.localStorage.removeItem(EXTERNAL_WEATHER_STORAGE_KEY);
    window.localStorage.setItem(STORAGE_VERSION_KEY, SEED_DATA_VERSION);
  }

  // 如果存储中没有数据，使用Seed数据初始化
  const stored = window.localStorage.getItem(EXTERNAL_WEATHER_STORAGE_KEY);
  if (!stored) {
    window.localStorage.setItem(
      EXTERNAL_WEATHER_STORAGE_KEY,
      JSON.stringify(SEED_EXTERNAL_WEATHER_DATA)
    );
  }
}

// 初始化
initExternalWeatherStore();

// 获取所有外部天气数据
export function listExternalWeather(): ExternalWeather[] {
  if (!canUseLocalStorage()) {
    return SEED_EXTERNAL_WEATHER_DATA;
  }

  const stored = window.localStorage.getItem(EXTERNAL_WEATHER_STORAGE_KEY);
  if (!stored) {
    return SEED_EXTERNAL_WEATHER_DATA;
  }

  return safeParseJson<ExternalWeather[]>(stored) ?? [];
}

// 根据ID获取外部天气数据
export function getExternalWeatherById(id: string): ExternalWeather | null {
  const data = listExternalWeather();
  return data.find((item) => item.id === id) || null;
}

