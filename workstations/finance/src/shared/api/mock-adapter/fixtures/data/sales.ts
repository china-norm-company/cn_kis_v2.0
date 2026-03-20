// REAL_CUSTOMERS import removed (unused)

export type OpportunityStage = "Prospecting" | "Qualification" | "Proposal" | "Negotiation" | "Closed_Won" | "Closed_Lost";

export interface Opportunity {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  amount: number;
  stage: OpportunityStage;
  winProbability: number; // 0-100
  aiSuggestion?: string;
  lastActivity: string;
  owner: string;
}

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "OPP-2025-001",
    title: "2025年度防晒新品功效测试框架协议",
    customerId: "C001", // L'Oreal
    customerName: "欧莱雅 (中国) 有限公司",
    amount: 1500000,
    stage: "Negotiation",
    winProbability: 85,
    aiSuggestion: "客户关注价格条款，建议提供阶梯报价方案",
    lastActivity: "2025-11-20",
    owner: "Emily Zhang"
  },
  {
    id: "OPP-2025-002",
    title: "薇诺娜敏感肌舒缓系列安评项目",
    customerId: "C102", // Botanee
    customerName: "云南贝泰妮生物科技集团",
    amount: 450000,
    stage: "Proposal",
    winProbability: 60,
    aiSuggestion: "需补充同类竞品的对比测试案例以增强说服力",
    lastActivity: "2025-11-18",
    owner: "Jessica Wu"
  },
  {
    id: "OPP-2025-003",
    title: "雅诗兰黛抗衰新品人体斑贴试验",
    customerId: "C002", // Estee Lauder
    customerName: "雅诗兰黛 (上海) 商贸有限公司",
    amount: 280000,
    stage: "Qualification",
    winProbability: 40,
    aiSuggestion: "关键决策人 Sarah Li 将于下周回国，建议预约拜访",
    lastActivity: "2025-11-21",
    owner: "Sarah Li"
  },
  {
    id: "OPP-2025-004",
    title: "珀莱雅双抗精华3.0 备案检测",
    customerId: "C101", // Proya
    customerName: "珀莱雅化妆品股份有限公司",
    amount: 120000,
    stage: "Prospecting",
    winProbability: 20,
    aiSuggestion: "系统检测到客户发布了新的备案需求，请尽快联系",
    lastActivity: "2025-11-22",
    owner: "Jessica Wu"
  },
  {
    id: "OPP-2025-005",
    title: "华熙生物玻尿酸原料安全性评估",
    customerId: "C103", // Bloomage
    customerName: "华熙生物科技股份有限公司",
    amount: 800000,
    stage: "Proposal",
    winProbability: 75,
    aiSuggestion: "客户对周期要求严格，建议展示我们的加急服务能力",
    lastActivity: "2025-11-19",
    owner: "Linda Sun"
  },
  {
    id: "OPP-2025-006",
    title: "韩束红蛮腰系列消费者调研",
    customerId: "C105", // Chicmax
    customerName: "上海上美化妆品股份有限公司",
    amount: 350000,
    stage: "Negotiation",
    winProbability: 90,
    aiSuggestion: "合同条款已基本确认，请跟进法务审核进度",
    lastActivity: "2025-11-15",
    owner: "Grace Lee"
  }
];
