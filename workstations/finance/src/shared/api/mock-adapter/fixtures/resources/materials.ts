export type MaterialType = "consumable" | "reference";

export type MaterialStatus = "available" | "expired" | "depleted" | "disabled";

export type MovementType = "IN" | "OUT" | "ADJUST";

export interface Material {
  id: string;
  materialCode: string;
  name: string;
  type: MaterialType;
  categoryName: string;
  unit: string;
  specification?: string;
  batchNo?: string;
  supplierName?: string;
  location?: string;
  storageCondition?: string;
  expireDate?: string;
  currentQty: number;
  status: MaterialStatus;
  lab: string;
  usageDepartment: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialMovement {
  id: string;
  materialId: string;
  type: MovementType;
  qty: number;
  beforeQty: number;
  afterQty: number;
  happenedAt: string;
  operator: string;
  refType?: "PROJECT" | "TASK" | "OTHER";
  refId?: string;
  remark?: string;
}

export interface MaterialDraft {
  materialCode: string;
  name: string;
  type: MaterialType;
  categoryName: string;
  unit: string;
  specification?: string;
  batchNo?: string;
  supplierName?: string;
  location?: string;
  storageCondition?: string;
  expireDate?: string;
  currentQty: number;
  lab: string;
  usageDepartment: string;
  remark?: string;
}

export interface MovementDraft {
  materialId: string;
  type: MovementType;
  qty: number;
  operator: string;
  refType?: "PROJECT" | "TASK" | "OTHER";
  refId?: string;
  remark?: string;
}

export const materialTypeText: Record<MaterialType, string> = {
  consumable: "耗材",
  reference: "标准物质",
};

export const materialStatusText: Record<MaterialStatus, string> = {
  available: "可用",
  expired: "已过期",
  depleted: "用尽",
  disabled: "停用",
};

export const movementTypeText: Record<MovementType, string> = {
  IN: "入库",
  OUT: "领用",
  ADJUST: "调整",
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatDateTime = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ");

const today = new Date();
const dateOffset = (days: number) => new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

let materials: Material[] = [
  {
    id: "mat-001",
    materialCode: "MAT-2025-001",
    name: "透明质酸钠溶液",
    type: "consumable",
    categoryName: "功效耗材",
    unit: "瓶",
    specification: "50ml",
    batchNo: "HA-2025-021",
    supplierName: "华研试剂",
    location: "冷藏柜 A-02",
    storageCondition: "4℃",
    expireDate: formatDate(dateOffset(20)),
    currentQty: 12,
    status: "available",
    lab: "功效实验室",
    usageDepartment: "临床测试",
    remark: "用于功效验证项目常备",
    createdAt: formatDateTime(dateOffset(-90)),
    updatedAt: formatDateTime(dateOffset(-1)),
  },
  {
    id: "mat-002",
    materialCode: "MAT-2025-002",
    name: "皮肤电阻电极贴",
    type: "consumable",
    categoryName: "感官耗材",
    unit: "包",
    specification: "20片/包",
    batchNo: "ER-2025-033",
    supplierName: "优材供应",
    location: "耗材柜 B-01",
    storageCondition: "常温",
    expireDate: formatDate(dateOffset(120)),
    currentQty: 0,
    status: "available",
    lab: "感官实验室",
    usageDepartment: "特检测试",
    createdAt: formatDateTime(dateOffset(-150)),
    updatedAt: formatDateTime(dateOffset(-3)),
  },
  {
    id: "mat-003",
    materialCode: "MAT-2024-011",
    name: "对照品 A",
    type: "reference",
    categoryName: "标准物质",
    unit: "支",
    specification: "5ml",
    batchNo: "STD-A-2024-11",
    supplierName: "国家标准物质中心",
    location: "标准品柜",
    storageCondition: "避光",
    expireDate: formatDate(dateOffset(-3)),
    currentQty: 2,
    status: "available",
    lab: "材料实验室",
    usageDepartment: "研发中心",
    remark: "标准品需避光保存",
    createdAt: formatDateTime(dateOffset(-200)),
    updatedAt: formatDateTime(dateOffset(-2)),
  },
  {
    id: "mat-004",
    materialCode: "MAT-2025-014",
    name: "抗菌试剂盒",
    type: "consumable",
    categoryName: "微生物试剂",
    unit: "盒",
    specification: "10测试/盒",
    batchNo: "MB-2025-014",
    supplierName: "瑞博试剂",
    location: "试剂柜 C-03",
    storageCondition: "2-8℃",
    expireDate: formatDate(dateOffset(45)),
    currentQty: 6,
    status: "available",
    lab: "微生物实验室",
    usageDepartment: "微生物检测",
    createdAt: formatDateTime(dateOffset(-60)),
    updatedAt: formatDateTime(dateOffset(-2)),
  },
  {
    id: "mat-005",
    materialCode: "MAT-2025-031",
    name: "对照品 B",
    type: "reference",
    categoryName: "标准物质",
    unit: "瓶",
    specification: "10ml",
    batchNo: "STD-B-2025-05",
    supplierName: "华测标准物质",
    location: "标准品柜",
    storageCondition: "避光",
    expireDate: formatDate(dateOffset(210)),
    currentQty: 4,
    status: "available",
    lab: "材料实验室",
    usageDepartment: "研发中心",
    createdAt: formatDateTime(dateOffset(-30)),
    updatedAt: formatDateTime(dateOffset(-1)),
  },
  {
    id: "mat-006",
    materialCode: "MAT-2025-008",
    name: "一次性采样棉签",
    type: "consumable",
    categoryName: "通用耗材",
    unit: "盒",
    specification: "100支/盒",
    batchNo: "CS-2025-008",
    supplierName: "医疗耗材集采",
    location: "耗材柜 A-07",
    storageCondition: "常温",
    expireDate: formatDate(dateOffset(360)),
    currentQty: 28,
    status: "available",
    lab: "通用仓储",
    usageDepartment: "临床测试",
    createdAt: formatDateTime(dateOffset(-40)),
    updatedAt: formatDateTime(dateOffset(-4)),
  },
];

let movements: MaterialMovement[] = [
  {
    id: "mov-001",
    materialId: "mat-001",
    type: "IN",
    qty: 20,
    beforeQty: 0,
    afterQty: 20,
    happenedAt: formatDateTime(dateOffset(-7)),
    operator: "仓库管理员",
    remark: "新批次到货入库",
  },
  {
    id: "mov-002",
    materialId: "mat-001",
    type: "OUT",
    qty: 8,
    beforeQty: 20,
    afterQty: 12,
    happenedAt: formatDateTime(dateOffset(-1)),
    operator: "技术员",
    refType: "PROJECT",
    refId: "PRJ-2025-018",
    remark: "功效试验领用",
  },
  {
    id: "mov-003",
    materialId: "mat-002",
    type: "OUT",
    qty: 12,
    beforeQty: 12,
    afterQty: 0,
    happenedAt: formatDateTime(dateOffset(-3)),
    operator: "仓库管理员",
    refType: "TASK",
    refId: "TASK-309",
    remark: "项目任务领用",
  },
  {
    id: "mov-004",
    materialId: "mat-003",
    type: "IN",
    qty: 2,
    beforeQty: 0,
    afterQty: 2,
    happenedAt: formatDateTime(dateOffset(-30)),
    operator: "仓库管理员",
    remark: "标准品入库",
  },
  {
    id: "mov-005",
    materialId: "mat-004",
    type: "ADJUST",
    qty: 6,
    beforeQty: 4,
    afterQty: 6,
    happenedAt: formatDateTime(dateOffset(-2)),
    operator: "仓库管理员",
    remark: "盘点校准库存",
  },
];

export const materialCategories = ["功效耗材", "感官耗材", "微生物试剂", "标准物质", "通用耗材"];

export const materialUnits = ["盒", "瓶", "支", "包", "套"];

export const materialLabs = ["功效实验室", "感官实验室", "微生物实验室", "材料实验室", "通用仓储"];

export const materialUsageDepartments = ["临床测试", "特检测试", "微生物检测", "研发中心", "质量管理"];

export const getMockMaterials = () => materials.map((item) => ({ ...item }));

export const getMaterialById = (id: string) => materials.find((item) => item.id === id);

export const getMockMovements = (materialId: string) =>
  movements.filter((item) => item.materialId === materialId).map((item) => ({ ...item }));

export const getExpiryState = (expireDate?: string, now: Date = new Date()) => {
  if (!expireDate) return "normal";
  const parsed = new Date(expireDate);
  if (Number.isNaN(parsed.getTime())) return "normal";
  const diffDays = Math.ceil((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "dueSoon";
  return "normal";
};

export const getMaterialStatus = (material: Material, now: Date = new Date()): MaterialStatus => {
  if (material.status === "disabled") return "disabled";
  if (material.currentQty <= 0) return "depleted";
  if (material.expireDate && getExpiryState(material.expireDate, now) === "expired") return "expired";
  return "available";
};

export const addMaterial = (draft: MaterialDraft) => {
  const now = new Date();
  const newMaterial: Material = {
    id: `mat-${Date.now()}`,
    materialCode: draft.materialCode,
    name: draft.name,
    type: draft.type,
    categoryName: draft.categoryName,
    unit: draft.unit,
    specification: draft.specification,
    batchNo: draft.batchNo,
    supplierName: draft.supplierName,
    location: draft.location,
    storageCondition: draft.storageCondition,
    expireDate: draft.expireDate,
    currentQty: draft.currentQty,
    status: "available",
    lab: draft.lab,
    usageDepartment: draft.usageDepartment,
    remark: draft.remark,
    createdAt: formatDateTime(now),
    updatedAt: formatDateTime(now),
  };
  materials = [newMaterial, ...materials];
  return newMaterial;
};

export const updateMaterial = (id: string, updates: Partial<Material>) => {
  let updatedMaterial: Material | undefined;
  materials = materials.map((item) => {
    if (item.id !== id) return item;
    updatedMaterial = { ...item, ...updates, updatedAt: formatDateTime(new Date()) };
    return updatedMaterial;
  });
  return updatedMaterial;
};

export const recordMaterialMovement = (draft: MovementDraft) => {
  const material = materials.find((item) => item.id === draft.materialId);
  if (!material) return undefined;
  const beforeQty = material.currentQty;
  let afterQty = beforeQty;
  if (draft.type === "IN") {
    afterQty = beforeQty + draft.qty;
  } else if (draft.type === "OUT") {
    afterQty = beforeQty - draft.qty;
  } else {
    afterQty = draft.qty;
  }
  const movement: MaterialMovement = {
    id: `mov-${Date.now()}`,
    materialId: draft.materialId,
    type: draft.type,
    qty: draft.qty,
    beforeQty,
    afterQty,
    happenedAt: formatDateTime(new Date()),
    operator: draft.operator,
    refType: draft.refType,
    refId: draft.refId,
    remark: draft.remark,
  };
  materials = materials.map((item) =>
    item.id === draft.materialId
      ? { ...item, currentQty: afterQty, updatedAt: movement.happenedAt }
      : item
  );
  movements = [movement, ...movements];
  return { movement, material: materials.find((item) => item.id === draft.materialId)! };
};
