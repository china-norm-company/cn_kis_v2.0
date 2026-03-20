// REAL_CUSTOMERS import removed (unused)

export type ProjectStatus = "Planning" | "Recruiting" | "Execution" | "Reporting" | "Completed" | "Hold";
export type MilestoneStatus = "Completed" | "In_Progress" | "Pending" | "Delayed";

export interface ProjectMilestone {
  id: string;
  name: string;
  date: string;
  status: MilestoneStatus;
}

export interface Project {
  id: string;
  name: string;
  protocolNo: string;
  customerName: string;
  status: ProjectStatus;
  progress: number; // 0-100
  startDate: string;
  endDate: string;
  manager: string;
  subjectCount: {
    target: number;
    enrolled: number;
    completed: number;
  };
  milestones: ProjectMilestone[];
  risks: number; // count of risks
}

export const REAL_PROJECTS: Project[] = [
  {
    id: "P-2025-001",
    name: "欧莱雅小金管防晒功效评价",
    protocolNo: "CN-25-S001",
    customerName: "欧莱雅 (中国) 有限公司",
    status: "Execution",
    progress: 65,
    startDate: "2025-11-01",
    endDate: "2025-12-15",
    manager: "Emily Zhang",
    subjectCount: {
      target: 30,
      enrolled: 32,
      completed: 18
    },
    milestones: [
      { id: "M1", name: "方案定稿", date: "2025-11-05", status: "Completed" },
      { id: "M2", name: "伦理批件", date: "2025-11-10", status: "Completed" },
      { id: "M3", name: "首例入组", date: "2025-11-15", status: "Completed" },
      { id: "M4", name: "数据锁定", date: "2025-12-10", status: "Pending" },
      { id: "M5", name: "报告交付", date: "2025-12-15", status: "Pending" }
    ],
    risks: 1
  },
  {
    id: "P-2025-002",
    name: "薇诺娜特护霜敏感肌适用性测试",
    protocolNo: "CN-25-S002",
    customerName: "云南贝泰妮生物科技集团",
    status: "Recruiting",
    progress: 30,
    startDate: "2025-11-15",
    endDate: "2026-01-10",
    manager: "Jessica Wu",
    subjectCount: {
      target: 60,
      enrolled: 45,
      completed: 0
    },
    milestones: [
      { id: "M1", name: "方案定稿", date: "2025-11-18", status: "Completed" },
      { id: "M2", name: "伦理批件", date: "2025-11-22", status: "In_Progress" },
      { id: "M3", name: "首例入组", date: "2025-11-25", status: "Pending" },
      { id: "M4", name: "报告交付", date: "2026-01-10", status: "Pending" }
    ],
    risks: 0
  },
  {
    id: "P-2025-003",
    name: "雅诗兰黛新款眼霜人体功效试验",
    protocolNo: "CN-25-E001",
    customerName: "雅诗兰黛 (上海) 商贸有限公司",
    status: "Planning",
    progress: 10,
    startDate: "2025-12-01",
    endDate: "2026-02-01",
    manager: "Sarah Li",
    subjectCount: {
      target: 40,
      enrolled: 0,
      completed: 0
    },
    milestones: [
      { id: "M1", name: "方案设计", date: "2025-11-25", status: "In_Progress" },
      { id: "M2", name: "伦理审查", date: "2025-12-05", status: "Pending" }
    ],
    risks: 2
  },
  {
    id: "P-2025-004",
    name: "珀莱雅红宝石面霜保湿功效测试",
    protocolNo: "CN-25-M005",
    customerName: "珀莱雅化妆品股份有限公司",
    status: "Reporting",
    progress: 90,
    startDate: "2025-10-15",
    endDate: "2025-11-25",
    manager: "Jessica Wu",
    subjectCount: {
      target: 30,
      enrolled: 30,
      completed: 30
    },
    milestones: [
      { id: "M1", name: "临床执行", date: "2025-11-10", status: "Completed" },
      { id: "M2", name: "统计分析", date: "2025-11-15", status: "Completed" },
      { id: "M3", name: "报告初稿", date: "2025-11-20", status: "Completed" },
      { id: "M4", name: "报告终稿", date: "2025-11-25", status: "In_Progress" }
    ],
    risks: 0
  }
];

