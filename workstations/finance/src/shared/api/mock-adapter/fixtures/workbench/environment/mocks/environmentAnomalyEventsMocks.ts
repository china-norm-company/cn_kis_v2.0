/**
 * 环境异常事件 Mock 数据
 */

// 异常类型
export const ANOMALY_TYPE_OPTIONS = [
  "温度超标",
  "湿度超标",
  "设备离线",
  "人为开门",
  "电压异常",
  "网络中断",
] as const;

export type AnomalyType = typeof ANOMALY_TYPE_OPTIONS[number];

// 所属场地
export type Location = "中心A-1F-区域1" | "中心A-2F-区域2" | "中心B-1F-区域1" | "中心B-2F-区域2" | "中心A-3F-区域3";

// 状态
export type AnomalyStatus = "待处理" | "已处理" | "已关闭";

// 是否影响执行中项目
export type AffectsActiveProject = "是" | "否";

// 数据有效性评估
export type DataValidity = "有效" | "无效" | "待评估";

// 环境异常事件接口
export interface EnvironmentAnomalyEvent {
  id: string;
  eventNo: string; // 环境异常事件编号
  monitoringPointName: string; // 监测点名称
  location: Location; // 所属场地（中心-楼层-区域）
  anomalyType: AnomalyType; // 异常类型
  startTime: string; // 开始发生时间 (ISO格式)
  duration: string; // 发生持续时长（如：2小时30分钟）
  affectsActiveProject: AffectsActiveProject; // 是否影响执行中项目
  affectedProjectNo?: string; // 影响项目编号
  endTime?: string; // 结束发生时间 (ISO格式)
  dataValidity: DataValidity; // 数据有效性评估
  handlingMeasures?: string; // 处理措施
  responsiblePerson?: string; // 责任人
  reviewer?: string; // 审核人
  status: AnomalyStatus; // 状态
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}

// 数据版本号
export const ENVIRONMENT_ANOMALY_EVENTS_DATA_VERSION = "v1.2";
const STORAGE_VERSION_KEY = "mock_environment_anomaly_events_version";
const STORAGE_KEY = "mock_environment_anomaly_events_data";

// 检查localStorage是否可用
function canUseLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && "localStorage" in window;
  } catch {
    return false;
  }
}

// 生成随机日期时间（最近30天内）
function randomDateTime(): string {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const hours = Math.floor(Math.random() * 24);
  const minutes = Math.floor(Math.random() * 60);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

// 生成持续时长
function generateDuration(): string {
  const hours = Math.floor(Math.random() * 24);
  const minutes = Math.floor(Math.random() * 60);
  if (hours === 0) {
    return `${minutes}分钟`;
  }
  if (minutes === 0) {
    return `${hours}小时`;
  }
  return `${hours}小时${minutes}分钟`;
}

// 生成项目编号（递增序号，如C25005046）
function generateProjectNo(index: number): string {
  const base = 25005000;
  return `C${base + index}`;
}

// 生成环境异常事件编号
function generateEventNo(index: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const seq = String(index + 1).padStart(4, "0");
  return `ENV${year}${month}${day}${seq}`;
}

// 监测点名称列表
const MONITORING_POINT_NAMES = [
  "监测点A-001",
  "监测点A-002",
  "监测点B-001",
  "监测点B-002",
  "监测点C-001",
  "监测点C-002",
  "监测点D-001",
  "监测点D-002",
];

// 责任人列表
const RESPONSIBLE_PERSONS = [
  "张三",
  "李四",
  "王五",
  "赵六",
  "钱七",
];

// 审核人列表
const REVIEWERS = [
  "审核人A",
  "审核人B",
  "审核人C",
];

// 处理措施列表
const HANDLING_MEASURES = [
  "立即调整温湿度控制设备",
  "联系设备维护人员",
  "通知相关人员关闭门禁",
  "检查网络连接",
  "更换备用设备",
  "记录异常情况并上报",
];

// 生成初始数据
function generateInitialData(): EnvironmentAnomalyEvent[] {
  const data: EnvironmentAnomalyEvent[] = [];
  const now = new Date();

  // 异常类型权重分布（常见类型权重高，罕见类型权重低）
  const anomalyTypeWeights = [
    { type: "温度超标", weight: 50 },      // 最常见
    { type: "湿度超标", weight: 30 },      // 常见
    { type: "设备离线", weight: 15 },      // 较少
    { type: "人为开门", weight: 5 },      // 很少
    { type: "电压异常", weight: 0 },      // 不生成
    { type: "网络中断", weight: 0 },      // 不生成
  ];

  // 生成异常类型选择函数
  const getAnomalyType = (): AnomalyType => {
    const totalWeight = anomalyTypeWeights.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of anomalyTypeWeights) {
      random -= item.weight;
      if (random <= 0) {
        return item.type as AnomalyType;
      }
    }
    return "温度超标"; // 默认值
  };

  // 状态分布：大部分已处理/已关闭，少数待处理
  const getStatus = (index: number): AnomalyStatus => {
    const rand = Math.random();
    if (rand < 0.2) {
      return "待处理"; // 20% 待处理（约4条）
    } else if (rand < 0.7) {
      return "已处理"; // 50% 已处理（约10条）
    } else {
      return "已关闭"; // 30% 已关闭（约6条）
    }
  };

  // 减少总数据量，只生成20条记录
  for (let i = 0; i < 20; i++) {
    const startTime = randomDateTime();
    const startDate = new Date(startTime);
    const duration = generateDuration();
    // 根据持续时长计算结束时间
    const durationMatch = duration.match(/(\d+)小时|(\d+)分钟/);
    let endTime: Date | null = null;
    if (durationMatch) {
      endTime = new Date(startDate);
      if (durationMatch[1]) {
        endTime.setHours(endTime.getHours() + parseInt(durationMatch[1]));
      }
      if (durationMatch[2]) {
        endTime.setMinutes(endTime.getMinutes() + parseInt(durationMatch[2]));
      }
    }

    const affectsActiveProject: AffectsActiveProject = Math.random() > 0.5 ? "是" : "否";
    const status = getStatus(i);
    const dataValidity: DataValidity = Math.random() > 0.7 ? "无效" : Math.random() > 0.5 ? "待评估" : "有效";
    const anomalyType = getAnomalyType();

    const event: EnvironmentAnomalyEvent = {
      id: `event-${i + 1}`,
      eventNo: generateEventNo(i),
      monitoringPointName: MONITORING_POINT_NAMES[i % MONITORING_POINT_NAMES.length],
      location: ["中心A-1F-区域1", "中心A-2F-区域2", "中心B-1F-区域1", "中心B-2F-区域2", "中心A-3F-区域3"][i % 5] as Location,
      anomalyType,
      startTime,
      duration,
      affectsActiveProject,
      affectedProjectNo: affectsActiveProject === "是" ? generateProjectNo(i) : undefined,
      endTime: endTime ? endTime.toISOString() : undefined,
      dataValidity,
      handlingMeasures: status !== "待处理" ? HANDLING_MEASURES[i % HANDLING_MEASURES.length] : undefined,
      responsiblePerson: status !== "待处理" ? RESPONSIBLE_PERSONS[i % RESPONSIBLE_PERSONS.length] : undefined,
      reviewer: status === "已关闭" ? REVIEWERS[i % REVIEWERS.length] : undefined,
      status,
      createdAt: startTime,
      updatedAt: now.toISOString(),
    };

    data.push(event);
  }

  return data;
}

// 获取数据
export function listEnvironmentAnomalyEvents(): EnvironmentAnomalyEvent[] {
  if (!canUseLocalStorage()) {
    return generateInitialData();
  }

  try {
    const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
    const storedData = localStorage.getItem(STORAGE_KEY);

    // 如果版本不匹配或数据不存在，重新生成
    if (
      storedVersion !== ENVIRONMENT_ANOMALY_EVENTS_DATA_VERSION ||
      !storedData
    ) {
      const newData = generateInitialData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
      localStorage.setItem(STORAGE_VERSION_KEY, ENVIRONMENT_ANOMALY_EVENTS_DATA_VERSION);
      return newData;
    }

    return JSON.parse(storedData) as EnvironmentAnomalyEvent[];
  } catch (error) {
    console.error("读取环境异常事件数据失败:", error);
    return generateInitialData();
  }
}

// 根据ID获取单个事件
export function getEnvironmentAnomalyEventById(id: string): EnvironmentAnomalyEvent | undefined {
  const events = listEnvironmentAnomalyEvents();
  return events.find((event) => event.id === id);
}

