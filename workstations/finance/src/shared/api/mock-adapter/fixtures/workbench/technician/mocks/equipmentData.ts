/**
 * 设备管理Mock数据
 * 技术员视角：只显示分配给该技术员的设备
 */

export type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'fault' | 'calibrating';

export interface Equipment {
  id: string;
  equipmentId: string; // CM825-001
  name: string; // Corneometer CM825
  model: string;
  manufacturer: string;
  category: '皮肤检测' | '色度测量' | '生理测量' | '成像设备' | '其他';
  status: EquipmentStatus;
  
  // 分配信息
  assignedTo: string; // 李技师
  assignedToId: string; // TECH-001
  assignedDate: string;
  
  // 使用状态
  location: string; // 检测室A
  usageCount: number; // 使用次数
  lastUsedDate?: string;
  
  // 维护信息
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceInterval: number; // 维护间隔（天）
  
  // 校准信息
  lastCalibrationDate: string;
  nextCalibrationDate: string;
  calibrationStatus: 'valid' | 'due_soon' | 'expired';
  
  // 其他
  purchaseDate: string;
  warrantyExpiry: string;
  notes?: string;
}

export interface EquipmentUsageRecord {
  id: string;
  equipmentId: string;
  equipmentName: string;
  usedBy: string;
  usedById: string;
  workOrderNo: string;
  subjectCode: string;
  testItem: string;
  startTime: string;
  endTime: string;
  duration: number; // 分钟
  status: 'normal' | 'abnormal';
  notes?: string;
}

export interface MaintenanceRecord {
  id: string;
  equipmentId: string;
  equipmentName: string;
  type: 'daily' | 'weekly' | 'monthly' | 'repair';
  performedBy: string;
  performedById: string;
  date: string;
  items: string[]; // 维护项目
  result: 'pass' | 'fail';
  notes?: string;
  nextMaintenanceDate?: string;
}

// ========== Mock数据：李技师的设备 ==========
export const mockEquipments: Equipment[] = [
  {
    id: 'EQ-001',
    equipmentId: 'CM825-001',
    name: 'Corneometer CM825',
    model: 'CM825',
    manufacturer: 'Courage + Khazaka',
    category: '皮肤检测',
    status: 'available',
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    assignedDate: '2025-01-15',
    location: '检测室A',
    usageCount: 145,
    lastUsedDate: '2025-12-03',
    lastMaintenanceDate: '2025-12-01',
    nextMaintenanceDate: '2025-12-15',
    maintenanceInterval: 14,
    lastCalibrationDate: '2025-11-01',
    nextCalibrationDate: '2025-12-25',
    calibrationStatus: 'valid',
    purchaseDate: '2024-03-15',
    warrantyExpiry: '2027-03-15',
    notes: '设备状态良好，运行稳定'
  },
  {
    id: 'EQ-002',
    equipmentId: 'TM300-001',
    name: 'Tewameter TM300',
    model: 'TM300',
    manufacturer: 'Courage + Khazaka',
    category: '皮肤检测',
    status: 'in_use',
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    assignedDate: '2025-01-15',
    location: '检测室A',
    usageCount: 132,
    lastUsedDate: '2025-12-04',
    lastMaintenanceDate: '2025-11-28',
    nextMaintenanceDate: '2025-12-12',
    maintenanceInterval: 14,
    lastCalibrationDate: '2025-10-28',
    nextCalibrationDate: '2025-12-28',
    calibrationStatus: 'valid',
    purchaseDate: '2024-04-10',
    warrantyExpiry: '2027-04-10',
    notes: '当前正在使用中'
  },
  {
    id: 'EQ-003',
    equipmentId: 'CR400-001',
    name: 'Chromameter CR-400',
    model: 'CR-400',
    manufacturer: 'Konica Minolta',
    category: '色度测量',
    status: 'available',
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    assignedDate: '2025-02-01',
    location: '检测室B',
    usageCount: 98,
    lastUsedDate: '2025-12-03',
    lastMaintenanceDate: '2025-11-20',
    nextMaintenanceDate: '2025-12-18',
    maintenanceInterval: 28,
    lastCalibrationDate: '2025-11-20',
    nextCalibrationDate: '2025-12-18',
    calibrationStatus: 'due_soon',
    purchaseDate: '2024-05-20',
    warrantyExpiry: '2027-05-20',
    notes: '即将到校准期，请及时安排'
  },
  {
    id: 'EQ-004',
    equipmentId: 'MPA580-001',
    name: 'Cutometer MPA580',
    model: 'MPA580',
    manufacturer: 'Courage + Khazaka',
    category: '皮肤检测',
    status: 'maintenance',
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    assignedDate: '2025-01-15',
    location: '检测室B',
    usageCount: 87,
    lastUsedDate: '2025-12-02',
    lastMaintenanceDate: '2025-12-04',
    nextMaintenanceDate: '2025-12-18',
    maintenanceInterval: 14,
    lastCalibrationDate: '2025-11-15',
    nextCalibrationDate: '2025-12-15',
    calibrationStatus: 'valid',
    purchaseDate: '2024-06-01',
    warrantyExpiry: '2027-06-01',
    notes: '定期维护中，预计今日下午完成'
  }
];

// ========== 使用记录 ==========
export const mockUsageRecords: EquipmentUsageRecord[] = [
  {
    id: 'UR-001',
    equipmentId: 'CM825-001',
    equipmentName: 'Corneometer CM825',
    usedBy: '李技师',
    usedById: 'TECH-001',
    workOrderNo: 'WO-2025-001-007',
    subjectCode: 'S006',
    testItem: '皮肤水分含量测试',
    startTime: '2025-12-01 10:05',
    endTime: '2025-12-01 10:25',
    duration: 20,
    status: 'normal',
    notes: '设备运行正常，数据准确'
  },
  {
    id: 'UR-002',
    equipmentId: 'TM300-001',
    equipmentName: 'Tewameter TM300',
    usedBy: '李技师',
    usedById: 'TECH-001',
    workOrderNo: 'WO-2025-001-007',
    subjectCode: 'S006',
    testItem: '皮肤TEWL测试',
    startTime: '2025-12-01 10:05',
    endTime: '2025-12-01 10:20',
    duration: 15,
    status: 'normal'
  },
  {
    id: 'UR-003',
    equipmentId: 'MPA580-001',
    equipmentName: 'Cutometer MPA580',
    usedBy: '李技师',
    usedById: 'TECH-001',
    workOrderNo: 'WO-2025-001-005',
    subjectCode: 'S004',
    testItem: '皮肤弹性测试',
    startTime: '2025-12-03 10:05',
    endTime: '2025-12-03 10:25',
    duration: 20,
    status: 'normal',
    notes: '数据已录入系统'
  }
];

// ========== 维护记录 ==========
export const mockMaintenanceRecords: MaintenanceRecord[] = [
  {
    id: 'MR-001',
    equipmentId: 'CM825-001',
    equipmentName: 'Corneometer CM825',
    type: 'weekly',
    performedBy: '李技师',
    performedById: 'TECH-001',
    date: '2025-12-01',
    items: ['外观清洁', '探头清洁', '功能测试', '校准检查'],
    result: 'pass',
    notes: '设备状态良好',
    nextMaintenanceDate: '2025-12-15'
  },
  {
    id: 'MR-002',
    equipmentId: 'TM300-001',
    equipmentName: 'Tewameter TM300',
    type: 'weekly',
    performedBy: '李技师',
    performedById: 'TECH-001',
    date: '2025-11-28',
    items: ['外观清洁', '传感器清洁', '功能测试'],
    result: 'pass',
    nextMaintenanceDate: '2025-12-12'
  },
  {
    id: 'MR-003',
    equipmentId: 'MPA580-001',
    equipmentName: 'Cutometer MPA580',
    type: 'daily',
    performedBy: '李技师',
    performedById: 'TECH-001',
    date: '2025-12-04',
    items: ['探头清洁', '吸力测试', '密封检查', '探头校准'],
    result: 'pass',
    notes: '定期维护中',
    nextMaintenanceDate: '2025-12-18'
  }
];

// ========== 工具函数 ==========
export const getEquipmentsByTechnician = (technicianId: string) => {
  return mockEquipments.filter(eq => eq.assignedToId === technicianId);
};

export const getEquipmentStats = (technicianId?: string) => {
  const equipments = technicianId 
    ? getEquipmentsByTechnician(technicianId)
    : mockEquipments;
    
  return {
    total: equipments.length,
    available: equipments.filter(e => e.status === 'available').length,
    inUse: equipments.filter(e => e.status === 'in_use').length,
    maintenance: equipments.filter(e => e.status === 'maintenance').length,
    fault: equipments.filter(e => e.status === 'fault').length,
    calibrationDueSoon: equipments.filter(e => e.calibrationStatus === 'due_soon').length,
  };
};

