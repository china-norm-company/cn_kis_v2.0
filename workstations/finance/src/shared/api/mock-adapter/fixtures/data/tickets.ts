// REAL_CUSTOMERS import removed (unused)

export type TicketPriority = "Critical" | "High" | "Medium" | "Low";
export type TicketStatus = "Open" | "In_Progress" | "Resolved" | "Closed";
export type TicketType = "Report_Inquiry" | "Sample_Issue" | "Scheduling" | "Complaint" | "Other";

export interface Ticket {
  id: string;
  title: string;
  description: string;
  customerId: string;
  customerName: string;
  contactPerson: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  assignee?: string;
}

export const REAL_TICKETS: Ticket[] = [
  {
    id: "T-2025-101",
    title: "报告数据疑问：对照组数值异常",
    description: "客户反馈 P-2025-001 项目终稿报告中，对照组 D14 数据与中期报告不一致，请求核查原始记录。",
    customerId: "C001", // L'Oreal
    customerName: "欧莱雅 (中国) 有限公司",
    contactPerson: "Emily Zhang",
    type: "Report_Inquiry",
    priority: "High",
    status: "Open",
    createdAt: "2025-11-22 09:30:00",
    updatedAt: "2025-11-22 09:30:00",
    assignee: "Jessica Wu"
  },
  {
    id: "T-2025-102",
    title: "申请补寄测试样品",
    description: "因运输途中破损，薇诺娜特护霜项目需要补寄 5 瓶样品，请提供收件信息。",
    customerId: "C102", // Botanee
    customerName: "云南贝泰妮生物科技集团",
    contactPerson: "Dr. Zhao",
    type: "Sample_Issue",
    priority: "Medium",
    status: "In_Progress",
    createdAt: "2025-11-21 14:15:00",
    updatedAt: "2025-11-22 10:00:00",
    assignee: "Admin"
  },
  {
    id: "T-2025-103",
    title: "紧急：受试者不良反应通报",
    description: "受试者 S-005 在使用产品后出现轻微红斑，已暂停使用，请医学顾问介入评估。",
    customerId: "C002", // Estee Lauder
    customerName: "雅诗兰黛 (上海) 商贸有限公司",
    contactPerson: "Sarah Li",
    type: "Complaint",
    priority: "Critical",
    status: "Open",
    createdAt: "2025-11-22 11:00:00",
    updatedAt: "2025-11-22 11:00:00",
    assignee: "Dr. Wang"
  },
  {
    id: "T-2025-104",
    title: "预约下周三现场访视审核",
    description: "客户希望下周三来实验室进行现场访视审核 (Site Visit)，需协调会议室和陪同人员。",
    customerId: "C105", // Chicmax
    customerName: "上海上美化妆品股份有限公司",
    contactPerson: "Grace Lee",
    type: "Scheduling",
    priority: "Low",
    status: "Resolved",
    createdAt: "2025-11-20 16:00:00",
    updatedAt: "2025-11-21 09:00:00",
    assignee: "Admin"
  }
];

