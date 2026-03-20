/**
 * 访视计划流程Mock数据
 * 包含访视计划、资源需求、资源匹配等信息
 */

export interface VisitPlanResource {
  id: string;
  type: 'equipment' | 'person' | 'venue';
  name: string;
  duration: number; // 分钟
  matched: boolean;
  matchStatus: 'matched' | 'waiting' | 'conflict'; // 🟢🟡🔴
  matchDate?: string; // 匹配日期（不在页面展示，仅用于内部模拟）
  remainingCapacity?: number; // 剩余容量（分钟）
  details?: string[]; // 资源卡片详情（MVP展示）
}

export interface VisitPlanItem {
  visitPoint: string;        // 访视点 V0
  visitName: string;         // 访视名称
  relativeDay: string;       // 相对天数 D0±1天
  relativeDayNum: number;    // 相对天数（数字）
  resourceNeeds: VisitPlanResource[];
  taskDescription: string;   // 🆕 访视任务描述（检测任务）
  qualityIssue: string;      // 质疑内容
  timeRange?: string;        // 时间段（用于原型展示）
  visitTag?: string;         // 访视标签（如：中期交付）
}

export interface VisitPlanDocumentInfo {
  name: string;
  sizeText: string;
}

export interface VisitPlanExecutionPeriod {
  start: string;
  end: string;
}

export interface VisitPlanProject {
  id: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  totalSamples: number;
  visitPoints: number;
  equipmentTypes: number;
  evaluationTypes: number;
  totalWorkTime: number; // 总工时（分钟）
  visits: VisitPlanItem[];
  currentStage: number; // 当前阶段 1-7

  // 基本信息（用于MVP原型展示）
  executionPeriod?: VisitPlanExecutionPeriod;
  deliveryDate?: string;
  description?: string;
  document?: VisitPlanDocumentInfo;
  submittedAt?: string;
}

// Mock访视计划项目数据
export const mockVisitPlanProject: VisitPlanProject = {
  id: '1765762400577',
  projectCode: 'VP-2025-001',
  projectName: '欧莱雅抗皱精华功效验证项目',
  clientName: '欧莱雅',
  totalSamples: 150,
  visitPoints: 5,
  equipmentTypes: 3,
  evaluationTypes: 3,
  totalWorkTime: 1740, // 29小时
  currentStage: 1, // 当前在阶段1
  executionPeriod: { start: '2025-01-15', end: '2025-03-15' },
  deliveryDate: '2025-03-20',
  description: '这是一个演示方案，包含模拟的实验计划数据。',
  document: { name: '演示文件', sizeText: '14.21 MB' },
  submittedAt: '2025-12-15T13:12:37.000Z',
  visits: [
    {
      visitPoint: 'V0',
      visitName: '基线访视(V0)',
      relativeDay: 'D0 ±1天',
      relativeDayNum: 0,
      taskDescription: '检测皮肤水分、皮肤弹性、评估皮肤状态',
      qualityIssue: '',
      timeRange: '下午14:00-17:00',
      resourceNeeds: [
        {
          id: 'v0-venue-1',
          type: 'venue',
          name: '测量室A（标准环境）',
          duration: 120,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-01-15',
          remainingCapacity: 240,
          details: ['环境要求：温度20-25°C，湿度40-60%', '数量：1间', '备注：受试者静置15分钟后开始检测'],
        },
        {
          id: 'v0-eq-1',
          type: 'equipment',
          name: 'Corneometer CM825皮肤水分测试仪',
          duration: 30,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-01-15',
          remainingCapacity: 120,
          details: [
            '测量区域：面颊部',
            '测量次数：3次',
            '测量要求：探头直径49mm，测量深度10-20μm，温度补偿20-30°C',
          ],
        },
        {
          id: 'v0-eq-2',
          type: 'equipment',
          name: 'Cutometer弹性测试仪',
          duration: 30,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-01-15',
          remainingCapacity: 90,
          details: [
            '测量区域：面颊部',
            '测量次数：3次',
            '测量要求：负压参数450mbar，持续2秒，恢复2秒',
          ],
        },
        {
          id: 'v0-person-1',
          type: 'person',
          name: '皮肤科医生',
          duration: 20,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-01-15',
          remainingCapacity: 150,
          details: [
            '数量：2个',
            '评估类别：临床功效评估',
            '评估指标：面部细纹改善评分、皮肤紧致度评分、整体抗衰老效果评分',
          ],
        },
      ],
    },
    {
      visitPoint: 'V1',
      visitName: '2天后随访(V1)',
      relativeDay: 'D+2',
      relativeDayNum: 2,
      taskDescription: 'VISIA皮肤成像检测',
      qualityIssue: '',
      timeRange: '下午14:00-17:00',
      resourceNeeds: [
        {
          id: 'v1-venue-1',
          type: 'venue',
          name: '测量室A（标准环境）',
          duration: 90,
          matched: false,
          matchStatus: 'waiting',
          matchDate: '2025-01-17',
          remainingCapacity: 0,
          details: ['环境要求：温度20-25°C，湿度40-60%', '数量：1间'],
        },
        {
          id: 't2d-eq-1',
          type: 'equipment',
          name: 'Visioscan VC98皮肤粗糙度测试仪',
          duration: 30,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-01-17',
          remainingCapacity: 60,
          details: [
            '测量区域：眼角鱼尾纹区域',
            '测量次数：2次',
            '测量要求：摄像头分辨率640x480，LED环形光源，分析参数SEr/SEsm/SEw',
          ],
        },
      ],
    },
    {
      visitPoint: 'V2',
      visitName: '第2周访视(V2)',
      relativeDay: 'D+14 ±2天',
      relativeDayNum: 14,
      visitTag: '中期交付',
      timeRange: '下午14:00-17:00',
      taskDescription: '阶段性复测：皮肤水分、皮肤粗糙度、功效中期评估',
      qualityIssue: '',
      resourceNeeds: [
        {
          id: 'v2-venue-1',
          type: 'venue',
          name: '测量室A（标准环境）',
          duration: 120,
          matched: false,
          matchStatus: 'waiting',
          matchDate: '2025-01-29',
          remainingCapacity: 0,
          details: ['环境要求：温度20-25°C，湿度40-60%', '数量：1间'],
        },
        {
          id: 'v2-eq-1',
          type: 'equipment',
          name: 'Corneometer CM825皮肤水分测试仪',
          duration: 30,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-01-29',
          remainingCapacity: 45,
          details: [
            '测量区域：面颊部',
            '测量次数：3次',
            '测量要求：探头直径49mm，测量深度10-20μm，温度补偿20-30°C',
          ],
        },
        {
          id: 'v2-person-1',
          type: 'person',
          name: '皮肤科医生',
          duration: 20,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-01-29',
          remainingCapacity: 100,
          details: [
            '数量：2个',
            '评估类别：临床功效评估',
            '评估指标：面部细纹改善评分、皮肤紧致度评分、整体抗衰老效果评分',
          ],
        },
      ],
    },
    {
      visitPoint: 'V3',
      visitName: '4周后结束(V3)',
      relativeDay: 'D+28',
      relativeDayNum: 28,
      timeRange: '下午14:00-17:00',
      taskDescription: 'VISIA皮肤成像、功效终评',
      qualityIssue: '',
      resourceNeeds: [
        {
          id: 'v3-venue-1',
          type: 'venue',
          name: '测量室A（标准环境）',
          duration: 90,
          matched: false,
          matchStatus: 'waiting',
          matchDate: '2025-02-12',
          remainingCapacity: 0,
          details: ['环境要求：温度20-25°C，湿度40-60%', '数量：1间'],
        },
        {
          id: 'v3-eq-1',
          type: 'equipment',
          name: 'VISIA皮肤检测仪',
          duration: 30,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-02-12',
          remainingCapacity: 80,
          details: [
            '测量区域：全脸',
            '测量次数：1次',
            '测量要求：标准光源，固定距离与角度，输出成像报告',
          ],
        },
        {
          id: 'v3-person-1',
          type: 'person',
          name: '功效终评 (1个)',
          duration: 20,
          matched: true,
          matchStatus: 'matched',
          matchDate: '2025-02-12',
          remainingCapacity: 120,
          details: [
            '数量：1个',
            '评估类别：临床功效评估',
            '评估指标：整体抗衰老效果评分',
          ],
        },
      ],
    },
    {
      visitPoint: 'V4',
      visitName: '第6周复查(V4)',
      relativeDay: 'D+42 ±3天',
      relativeDayNum: 42,
      timeRange: '下午14:00-17:00',
      taskDescription: '终期随访：复测关键指标并完成结项确认',
      qualityIssue: '',
      resourceNeeds: [
        {
          id: 'v4-venue-1',
          type: 'venue',
          name: '测量室A（标准环境）',
          duration: 60,
          matched: false,
          matchStatus: 'waiting',
          matchDate: '2025-02-26',
          remainingCapacity: 0,
          details: ['环境要求：温度20-25°C，湿度40-60%', '数量：1间'],
        },
        {
          id: 'v4-eq-1',
          type: 'equipment',
          name: 'Cutometer弹性测试仪',
          duration: 30,
          matched: false,
          matchStatus: 'waiting',
          matchDate: '2025-02-26',
          remainingCapacity: 0,
          details: ['测量区域：面颊部', '测量次数：2次', '测量要求：负压参数450mbar，持续2秒，恢复2秒'],
        },
        {
          id: 'v4-person-1',
          type: 'person',
          name: '皮肤科医生',
          duration: 20,
          matched: false,
          matchStatus: 'waiting',
          matchDate: '2025-02-26',
          remainingCapacity: 0,
          details: ['数量：1个', '评估类别：临床功效评估', '评估指标：整体抗衰老效果评分'],
        },
      ],
    },
  ],
};

// 按天维度的排程数据（阶段4使用）
export interface DailyScheduleTask {
  id: string;
  visitPoint: string;        // V0
  visitName: string;
  date: string;              // 2025-01-15（只到天）
  resourceType: 'person' | 'equipment' | 'venue';
  resourceName: string;
  taskDescription: string;   // 任务描述
  hasConflict: boolean;      // 是否冲突
  locked: boolean;           // 是否锁定
  subjectCount?: number;     // 受试者数量
}

// Mock按天排程数据
export const mockDailyScheduleTasks: Record<string, DailyScheduleTask[]> = {
  '2025-01-15': [
    {
      id: 'task-1',
      visitPoint: 'V0',
      visitName: '基线访视',
      date: '2025-01-15',
      resourceType: 'equipment',
      resourceName: 'Corneometer CM825',
      taskDescription: '检测皮肤水分',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
    {
      id: 'task-2',
      visitPoint: 'V0',
      visitName: '基线访视',
      date: '2025-01-15',
      resourceType: 'person',
      resourceName: '张倩-皮肤评估',
      taskDescription: '评估皮肤状态',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
    {
      id: 'task-2b',
      visitPoint: 'V0',
      visitName: '基线访视',
      date: '2025-01-15',
      resourceType: 'venue',
      resourceName: '1号检测室',
      taskDescription: '场地使用',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
  ],
  '2025-01-16': [
    {
      id: 'task-3',
      visitPoint: 'V0',
      visitName: '基线访视',
      date: '2025-01-16',
      resourceType: 'equipment',
      resourceName: 'Cutometer弹性仪',
      taskDescription: '检测皮肤弹性',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
    {
      id: 'task-3b',
      visitPoint: 'V0',
      visitName: '基线访视',
      date: '2025-01-16',
      resourceType: 'person',
      resourceName: '李鑫-技术员',
      taskDescription: '设备操作',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
  ],
  '2025-01-17': [
    {
      id: 'task-4',
      visitPoint: 'T2d',
      visitName: '2天后随访',
      date: '2025-01-17',
      resourceType: 'equipment',
      resourceName: 'VISIA皮肤检测仪',
      taskDescription: 'VISIA成像检测',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
    {
      id: 'task-4b',
      visitPoint: 'T2d',
      visitName: '2天后随访',
      date: '2025-01-17',
      resourceType: 'venue',
      resourceName: '2号检测室',
      taskDescription: '场地使用',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
  ],
  '2025-01-18': [
    {
      id: 'task-8',
      visitPoint: 'V0',
      visitName: '基线访视',
      date: '2025-01-18',
      resourceType: 'person',
      resourceName: '王明-CRC',
      taskDescription: '受试者访视',
      hasConflict: false,
      locked: false,
      subjectCount: 30,
    },
  ],
  '2025-01-19': [
    {
      id: 'task-9',
      visitPoint: 'T2d',
      visitName: '2天后随访',
      date: '2025-01-19',
      resourceType: 'equipment',
      resourceName: 'Corneometer CM825',
      taskDescription: '水分复测',
      hasConflict: false,
      locked: false,
      subjectCount: 30,
    },
  ],
  '2025-01-20': [
    {
      id: 'task-10',
      visitPoint: 'V0',
      visitName: '基线访视',
      date: '2025-01-20',
      resourceType: 'venue',
      resourceName: '评估室A',
      taskDescription: '场地预留',
      hasConflict: false,
      locked: false,
      subjectCount: 40,
    },
  ],
  '2025-01-22': [
    {
      id: 'task-5',
      visitPoint: 'T1wk',
      visitName: '1周后复查',
      date: '2025-01-22',
      resourceType: 'equipment',
      resourceName: 'Cutometer弹性仪',
      taskDescription: '弹性测试',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
    {
      id: 'task-6',
      visitPoint: 'T1wk',
      visitName: '1周后复查',
      date: '2025-01-22',
      resourceType: 'person',
      resourceName: '李鑫-功效评估',
      taskDescription: '功效初评',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
    {
      id: 'task-11',
      visitPoint: 'T1wk',
      visitName: '1周后复查',
      date: '2025-01-22',
      resourceType: 'venue',
      resourceName: '评估室B',
      taskDescription: '场地使用',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
  ],
  '2025-01-23': [
    {
      id: 'task-12',
      visitPoint: 'T1wk',
      visitName: '1周后复查',
      date: '2025-01-23',
      resourceType: 'person',
      resourceName: '张倩-皮肤评估',
      taskDescription: '皮肤状态复评',
      hasConflict: false,
      locked: false,
      subjectCount: 40,
    },
  ],
  '2025-01-29': [
    {
      id: 'task-7',
      visitPoint: 'T2wk',
      visitName: '2周后复查',
      date: '2025-01-29',
      resourceType: 'equipment',
      resourceName: 'VISIA皮肤检测仪',
      taskDescription: 'VISIA复查',
      hasConflict: true, // 有冲突
      locked: false,
      subjectCount: 50,
    },
    {
      id: 'task-13',
      visitPoint: 'T2wk',
      visitName: '2周后复查',
      date: '2025-01-29',
      resourceType: 'person',
      resourceName: '王明-CRC',
      taskDescription: '受试者随访',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
  ],
  '2025-02-05': [
    {
      id: 'task-14',
      visitPoint: 'T4wk',
      visitName: '4周后结束',
      date: '2025-02-05',
      resourceType: 'equipment',
      resourceName: 'VISIA皮肤检测仪',
      taskDescription: 'VISIA终评',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
    {
      id: 'task-15',
      visitPoint: 'T4wk',
      visitName: '4周后结束',
      date: '2025-02-05',
      resourceType: 'person',
      resourceName: '李鑫-功效评估',
      taskDescription: '功效终评',
      hasConflict: false,
      locked: false,
      subjectCount: 50,
    },
  ],
};
