/**
 * 环境资源管理页面模拟数据
 */
import { MonitoringPoint, Statistics, MonitoringType, MonitoringStatus } from "./types";

// 检测方法列表（模拟）
const DETECTION_METHODS = [
  { id: "method-001", name: "皮肤水分测试" },
  { id: "method-002", name: "色斑面积分析" },
  { id: "method-003", name: "弹性测试" },
  { id: "method-004", name: "皱纹深度测量" },
  { id: "method-005", name: "毛孔大小分析" },
  { id: "method-006", name: "肤色均匀度检测" },
];

// 场地列表（模拟）
const LOCATIONS = [
  { id: "loc-001", name: "上海中心", path: "上海中心" },
  { id: "loc-002", name: "2楼", path: "上海中心 > 2楼", parentId: "loc-001" },
  { id: "loc-003", name: "Visia检测室", path: "上海中心 > 2楼 > Visia检测室", parentId: "loc-002" },
  { id: "loc-004", name: "3楼", path: "上海中心 > 3楼", parentId: "loc-001" },
  { id: "loc-005", name: "恒温恒湿室", path: "上海中心 > 3楼 > 恒温恒湿室", parentId: "loc-004" },
  { id: "loc-006", name: "北京中心", path: "北京中心" },
  { id: "loc-007", name: "1楼", path: "北京中心 > 1楼", parentId: "loc-006" },
  { id: "loc-008", name: "检测区", path: "北京中心 > 1楼 > 检测区", parentId: "loc-007" },
];

// 根据当前值与标准范围的关系确定状态
const determineStatus = (
  monitoringType: MonitoringType,
  currentValue: string | null,
  lastUpdateTime: string | null,
  standardRangeMin: number,
  standardRangeMax: number,
  looseRangeMin: number,
  looseRangeMax: number
): MonitoringStatus => {
  // 检查设备是否离线（最后更新时间 > 30分钟前或没有更新时间）
  if (!lastUpdateTime) {
    return "设备离线";
  }
  const lastUpdate = new Date(lastUpdateTime);
  const now = new Date();
  const minutesDiff = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
  if (minutesDiff > 30) {
    return "设备离线";
  }

  // 如果没有当前值，返回设备离线
  if (!currentValue) {
    return "设备离线";
  }

  // 解析当前值（根据监测类型）
  let numericValue: number | null = null;
  let humidityValue: number | null = null;
  
  if (monitoringType === "温湿度") {
    // 解析温度值和湿度值
    const tempMatch = currentValue.match(/(\d+\.?\d*)℃/);
    const humidityMatch = currentValue.match(/(\d+)%RH/);
    if (tempMatch) {
      numericValue = parseFloat(tempMatch[1]);
    }
    if (humidityMatch) {
      humidityValue = parseFloat(humidityMatch[1]);
    }
    
    // 温湿度需要同时检查温度和湿度
    // 湿度标准范围：40-60%（50±10%），宽松范围：35-65%
    const humidityStandardMin = 40;
    const humidityStandardMax = 60;
    const humidityLooseMin = 35;
    const humidityLooseMax = 65;
    
    // 检查温度状态
    let tempStatus: "正常" | "警告" | "超标" = "正常";
    if (numericValue !== null) {
      if (numericValue >= standardRangeMin && numericValue <= standardRangeMax) {
        tempStatus = "正常";
      } else if (numericValue >= looseRangeMin && numericValue <= looseRangeMax) {
        tempStatus = "警告";
      } else {
        tempStatus = "超标";
      }
    }
    
    // 检查湿度状态
    let humidityStatus: "正常" | "警告" | "超标" = "正常";
    if (humidityValue !== null) {
      if (humidityValue >= humidityStandardMin && humidityValue <= humidityStandardMax) {
        humidityStatus = "正常";
      } else if (humidityValue >= humidityLooseMin && humidityValue <= humidityLooseMax) {
        humidityStatus = "警告";
      } else {
        humidityStatus = "超标";
      }
    }
    
    // 返回最严重的状态（超标 > 警告 > 正常）
    if (tempStatus === "超标" || humidityStatus === "超标") {
      return "超标";
    } else if (tempStatus === "警告" || humidityStatus === "警告") {
      return "警告";
    } else {
      return "正常";
    }
  } else if (monitoringType === "照度") {
    // 解析照度值
    const luxMatch = currentValue.match(/(\d+)/);
    if (luxMatch) {
      numericValue = parseFloat(luxMatch[1]);
    }
  } else if (monitoringType === "洁净度") {
    // 解析洁净度等级（Class后面的数字）
    const classMatch = currentValue.match(/Class\s*(\d+\.?\d*)/i);
    if (classMatch) {
      numericValue = parseFloat(classMatch[1]);
    }
  }

  // 如果无法解析数值，返回正常（避免错误）
  if (numericValue === null) {
    return "正常";
  }

  // 根据数值与范围的关系确定状态
  if (numericValue >= standardRangeMin && numericValue <= standardRangeMax) {
    return "正常";
  } else if (numericValue >= looseRangeMin && numericValue <= looseRangeMax) {
    return "警告";
  } else {
    return "超标";
  }
};

// 生成当前值（基于监测类型和期望状态，使用ID确保稳定性）
const generateCurrentValue = (
  monitoringType: MonitoringType,
  expectedStatus: "正常" | "警告" | "超标",
  id: string,
  standardRangeMin: number,
  standardRangeMax: number,
  looseRangeMin: number,
  looseRangeMax: number
): string => {
  // 使用ID生成稳定的随机数
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = hash % 100;

  switch (monitoringType) {
    case "温湿度":
      let temp: number;
      let humidity: number;
      
      if (expectedStatus === "正常") {
        // 正常范围：温度 20-24℃，湿度 40-60%
        temp = 20 + (seed % 40) * 0.1; // 20.0-23.9℃
        humidity = 40 + (seed % 20); // 40-59%
      } else if (expectedStatus === "警告") {
        // 警告范围：温度 19-20℃ 或 24-25℃，湿度 35-40% 或 60-65%
        if (seed % 2 === 0) {
          temp = 19 + (seed % 10) * 0.1; // 19.0-19.9℃
        } else {
          temp = 24 + (seed % 10) * 0.1; // 24.0-24.9℃
        }
        if (seed % 2 === 0) {
          humidity = 35 + (seed % 5); // 35-39%
        } else {
          humidity = 60 + (seed % 5); // 60-64%
        }
      } else {
        // 超标：温度 < 19℃ 或 > 25℃，湿度 < 35% 或 > 65%
        if (seed % 2 === 0) {
          temp = 18 - (seed % 5) * 0.2; // 17.0-18.8℃
        } else {
          temp = 25.2 + (seed % 10) * 0.2; // 25.2-27.0℃
        }
        if (seed % 2 === 0) {
          humidity = 30 - (seed % 5); // 25-30%
        } else {
          humidity = 66 + (seed % 10); // 66-75%
        }
      }
      return `${temp.toFixed(1)}℃, ${humidity.toFixed(0)}%RH`;

    case "照度":
      let lux: number;
      
      if (expectedStatus === "正常") {
        // 正常范围：500-800 lux
        lux = 500 + (seed % 300); // 500-799 lux
      } else if (expectedStatus === "警告") {
        // 警告范围：400-500 lux 或 800-1000 lux
        if (seed % 2 === 0) {
          lux = 400 + (seed % 100); // 400-499 lux
        } else {
          lux = 800 + (seed % 200); // 800-999 lux
        }
      } else {
        // 超标：< 400 lux 或 > 1000 lux
        if (seed % 2 === 0) {
          lux = 300 - (seed % 100); // 200-299 lux
        } else {
          lux = 1001 + (seed % 500); // 1001-1500 lux
        }
      }
      return `${lux} lux`;

    case "洁净度":
      let level: number;
      
      if (expectedStatus === "正常") {
        // 正常范围：Class 5-7
        level = 5 + (seed % 20) * 0.1; // 5.0-6.9
      } else if (expectedStatus === "警告") {
        // 警告范围：Class 4-5 或 7-8
        if (seed % 2 === 0) {
          level = 4 + (seed % 10) * 0.1; // 4.0-4.9
        } else {
          level = 7 + (seed % 10) * 0.1; // 7.0-7.9
        }
      } else {
        // 超标：Class < 4 或 > 8
        if (seed % 2 === 0) {
          level = 3 - (seed % 20) * 0.1; // 1.0-2.9
        } else {
          level = 8.1 + (seed % 20) * 0.1; // 8.1-10.0
        }
      }
      return `Class ${level.toFixed(1)}`;

    default:
      return "—";
  }
};

// 生成监测点数据
const generateMonitoringPoint = (index: number): MonitoringPoint => {
  const id = `mp-${String(index + 1).padStart(3, "0")}`;
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = hash % 100;

  // 监测类型
  const monitoringTypes: MonitoringType[] = ["温湿度", "照度", "洁净度"];
  const monitoringType = monitoringTypes[seed % 3];

  // 场地（随机选择）
  const location = LOCATIONS[seed % LOCATIONS.length];

  // 标准范围（根据监测类型）
  let standardRange: string;
  let standardRangeMin: number;
  let standardRangeMax: number;
  let looseRangeMin: number;
  let looseRangeMax: number;

  switch (monitoringType) {
    case "温湿度":
      standardRange = "温度 22±2℃，湿度 50±10%";
      standardRangeMin = 20; // 温度标准范围最小值：20℃
      standardRangeMax = 24; // 温度标准范围最大值：24℃
      looseRangeMin = 19; // 温度宽松范围最小值：19℃
      looseRangeMax = 25; // 温度宽松范围最大值：25℃
      break;
    case "照度":
      standardRange = "500-800 lux";
      standardRangeMin = 500;
      standardRangeMax = 800;
      looseRangeMin = 400;
      looseRangeMax = 1000;
      break;
    case "洁净度":
      standardRange = "Class 5-7";
      standardRangeMin = 5;
      standardRangeMax = 7;
      looseRangeMin = 4;
      looseRangeMax = 8;
      break;
  }

  // 最后更新时间（90%在线，10%离线）
  const isOnline = (seed % 10) < 9;
  const lastUpdateTime = isOnline
    ? new Date(Date.now() - (seed % 30) * 60000).toISOString() // 0-30分钟前
    : null; // 离线设备没有更新时间

  // 根据ID生成期望状态（70% 正常，20% 警告，10% 超标）
  // 如果设备离线，状态会在determineStatus中处理
  let expectedStatus: "正常" | "警告" | "超标";
  const statusSeed = (seed + 17) % 100; // 使用不同的seed确保状态分布
  if (statusSeed < 70) {
    expectedStatus = "正常";
  } else if (statusSeed < 90) {
    expectedStatus = "警告";
  } else {
    expectedStatus = "超标";
  }

  // 根据期望状态生成当前值（设备在线时）
  const currentValue = isOnline
    ? generateCurrentValue(monitoringType, expectedStatus, id, standardRangeMin, standardRangeMax, looseRangeMin, looseRangeMax)
    : null;

  // 根据当前值与标准范围的关系确定实际状态
  const status = determineStatus(
    monitoringType,
    currentValue,
    lastUpdateTime,
    standardRangeMin,
    standardRangeMax,
    looseRangeMin,
    looseRangeMax
  );

  // 关联检测方法（随机选择1-3个）
  const methodCount = 1 + (seed % 3);
  const selectedMethods = DETECTION_METHODS.slice(0, methodCount);
  const relatedMethods = selectedMethods.map((m) => m.id);
  const relatedMethodNames = selectedMethods.map((m) => m.name);

  // 校准日期（随机生成）
  const lastCalibrationDate = new Date();
  lastCalibrationDate.setDate(lastCalibrationDate.getDate() - (30 + seed % 180)); // 30-210天前

  const nextCalibrationDate = new Date(lastCalibrationDate);
  nextCalibrationDate.setDate(nextCalibrationDate.getDate() + 365); // 一年后

  return {
    id,
    name: `${location.name}${monitoringType}`,
    location: location.path,
    locationId: location.id,
    monitoringType,
    standardRange,
    standardRangeMin,
    standardRangeMax,
    looseRangeMin,
    looseRangeMax,
    currentValue,
    lastUpdateTime: isOnline ? lastUpdateTime : null,
    status,
    relatedMethods,
    relatedMethodNames,
    lastCalibrationDate: lastCalibrationDate.toISOString().split('T')[0],
    nextCalibrationDate: nextCalibrationDate.toISOString().split('T')[0],
  };
};

// 生成所有监测点数据
export const generateMonitoringPoints = (count: number = 25): MonitoringPoint[] => {
  return Array.from({ length: count }, (_, i) => generateMonitoringPoint(i));
};

// 计算统计数据
export const calculateStatistics = (points: MonitoringPoint[]): Statistics => {
  return {
    total: points.length,
    normal: points.filter((p) => p.status === "正常").length,
    warning: points.filter((p) => p.status === "警告").length,
    abnormal: points.filter((p) => p.status === "超标" || p.status === "设备离线").length,
  };
};

// 获取所有检测方法（用于下拉选择）
export const getAllDetectionMethods = () => {
  return DETECTION_METHODS;
};

// 获取所有场地（用于下拉选择）
export const getAllLocations = () => {
  return LOCATIONS;
};

