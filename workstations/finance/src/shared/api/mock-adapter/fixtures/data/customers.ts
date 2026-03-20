import type { Customer } from "@/entities/customer/domain";

// Badge and Avatar components will be implemented later

export const REAL_CUSTOMERS: Customer[] = [
  // Global Top
  {
    id: "C001",
    name: "欧莱雅 (中国) 有限公司",
    enName: "L'Oréal Group",
    tier: "KA",
    region: "Global",
    brands: ["L'Oréal Paris", "Lancôme", "Kiehl's", "SkinCeuticals"],
    status: "Active",
    healthScore: 98,
    lastContact: "2025-11-21",
    principal: "Emily Zhang"
  },
  {
    id: "C002",
    name: "雅诗兰黛 (上海) 商贸有限公司",
    enName: "Estée Lauder Companies",
    tier: "KA",
    region: "Global",
    brands: ["Estée Lauder", "La Mer", "Clinique", "MAC"],
    status: "Active",
    healthScore: 95,
    lastContact: "2025-11-20",
    principal: "Sarah Li"
  },
  {
    id: "C003",
    name: "联合利华 (中国) 投资有限公司",
    enName: "Unilever",
    tier: "KA",
    region: "Global",
    brands: ["Dove", "Vaseline", "Ponds"],
    status: "Active",
    healthScore: 92,
    lastContact: "2025-11-18",
    principal: "Michael Chen"
  },
  {
    id: "C004",
    name: "资生堂 (中国) 投资有限公司",
    enName: "Shiseido Group",
    tier: "KA",
    region: "Global",
    brands: ["Shiseido", "CPB", "NARS", "Anessa"],
    status: "Active",
    healthScore: 90,
    lastContact: "2025-11-15",
    principal: "Yuki Wang"
  },
  {
    id: "C005",
    name: "宝洁 (中国) 有限公司",
    enName: "P&G",
    tier: "KA",
    region: "Global",
    brands: ["SK-II", "Olay"],
    status: "Active",
    healthScore: 88,
    lastContact: "2025-11-10",
    principal: "David Liu"
  },
  
  // China Top
  {
    id: "C101",
    name: "珀莱雅化妆品股份有限公司",
    enName: "Proya Cosmetics",
    tier: "Local_Top",
    region: "China",
    brands: ["Proya", "TIMAGE", "Off&Relax"],
    status: "Active",
    healthScore: 96,
    lastContact: "2025-11-22",
    principal: "Jessica Wu"
  },
  {
    id: "C102",
    name: "云南贝泰妮生物科技集团",
    enName: "Botanee Group",
    tier: "Local_Top",
    region: "China",
    brands: ["Winona (薇诺娜)", "Winona Baby"],
    status: "Active",
    healthScore: 94,
    lastContact: "2025-11-19",
    principal: "Dr. Zhao"
  },
  {
    id: "C103",
    name: "华熙生物科技股份有限公司",
    enName: "Bloomage Biotech",
    tier: "Local_Top",
    region: "China",
    brands: ["Biohyalux (润百颜)", "QuadHA (夸迪)"],
    status: "Active",
    healthScore: 93,
    lastContact: "2025-11-17",
    principal: "Linda Sun"
  },
  {
    id: "C104",
    name: "上海家化联合股份有限公司",
    enName: "Jahwa United",
    tier: "Local_Top",
    region: "China",
    brands: ["Herborist (佰草集)", "Dr.Yu (玉泽)"],
    status: "Potential",
    healthScore: 85,
    lastContact: "2025-11-05",
    principal: "Tom Zhang"
  },
  {
    id: "C105",
    name: "上海上美化妆品股份有限公司",
    enName: "Chicmax",
    tier: "Local_Top",
    region: "China",
    brands: ["Kans (韩束)", "One Leaf (一叶子)"],
    status: "Active",
    healthScore: 91,
    lastContact: "2025-11-21",
    principal: "Grace Lee"
  }
];

export type { Customer };
