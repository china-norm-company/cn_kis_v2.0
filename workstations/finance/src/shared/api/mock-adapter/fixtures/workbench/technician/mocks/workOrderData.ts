/**
 * 技术员工单Mock数据
 * 完整流程：排程 → 工单生成 → 技术员执行 → 质量审核 → 完成
 */

// ========== 工单状态定义 ==========
export type WorkOrderStatus = 
  | 'pending'          // 待执行
  | 'in_progress'      // 执行中
  | 'completed'        // 已完成（等待审核）
  | 'quality_review'   // 质量审核中
  | 'approved'         // 已批准
  | 'rejected'         // 已拒绝
  | 'cancelled'        // 已取消

export type WorkOrderPriority = 'high' | 'medium' | 'low';

// ========== 工单接口定义 ==========
export interface WorkOrder {
  id: string;
  workOrderNo: string; // 工单编号
  
  // 项目信息
  projectId: string;
  projectName: string;
  visitNode: string; // V1, V2, V3...
  visitName: string; // T0 基线访视
  
  // 受试者信息
  subjectId: string;
  subjectName: string;
  subjectCode: string; // S001
  
  // 检测项目
  testItem: {
    id: string;
    name: string;
    category: '问卷' | '仪器检测' | '采样' | '观察';
    equipment?: string;
    duration: number; // 分钟
    sop?: string; // SOP文档链接
  };
  
  // 资源分配
  assignedTo: string; // 技术员姓名
  assignedToId: string;
  equipment?: string;
  equipmentId?: string;
  venue: string;
  venueId: string;
  
  // 时间信息
  scheduledDate: string;
  scheduledTime: string;
  startTime?: string;
  endTime?: string;
  actualDuration?: number;
  actualStartTime?: string;
  actualDate?: string;
  actualEndTime?: string;
  
  // 状态信息
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  
  // 数据录入
  dataEntered: boolean;
  dataEntryTime?: string;
  dataValues?: Record<string, any>;
  
  // 质量审核
  qualityReviewer?: string;
  qualityReviewTime?: string;
  qualityReviewNote?: string;
  qualityAuditStatus?: 'approved' | 'rejected';
  qualityAuditorName?: string;
  qualityAuditDate?: string;
  qualityAuditRemark?: string;
  
  // 来源信息（从排程生成）
  sourceScheduleId: string;
  createdFrom: 'schedule' | 'manual'; // 来自排程 or 手动创建
  createdAt: string;
  updatedAt: string;
}

// ========== Mock数据：欧莱雅项目的工单 ==========
export const mockWorkOrders: WorkOrder[] = [
  // ===== V1 基线访视工单（待执行）=====
  {
    id: 'WO-001',
    workOrderNo: 'WO-2025-001-001',
    projectId: 'KIS-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    visitNode: 'V1',
    visitName: 'T0 基线访视',
    subjectId: 'SUB-001',
    subjectName: '张三(匿名)',
    subjectCode: 'S001',
    testItem: {
      id: 'T001-002',
      name: '皮肤水分含量测试',
      category: '仪器检测',
      equipment: 'Corneometer CM825',
      duration: 20,
      sop: '/docs/sop/skin-moisture-test.pdf'
    },
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    equipment: 'Corneometer CM825',
    equipmentId: 'CM825-001',
    venue: '检测室A',
    venueId: 'ROOM-A01',
    scheduledDate: '2025-12-04',
    scheduledTime: '09:00',
    status: 'pending',
    priority: 'high',
    dataEntered: false,
    sourceScheduleId: 'SCH-2025-001-001',
    createdFrom: 'schedule',
    createdAt: '2025-12-03 15:00',
    updatedAt: '2025-12-03 15:00'
  },
  {
    id: 'WO-002',
    workOrderNo: 'WO-2025-001-002',
    projectId: 'KIS-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    visitNode: 'V1',
    visitName: 'T0 基线访视',
    subjectId: 'SUB-001',
    subjectName: '张三(匿名)',
    subjectCode: 'S001',
    testItem: {
      id: 'T001-003',
      name: '皮肤TEWL测试',
      category: '仪器检测',
      equipment: 'Tewameter TM300',
      duration: 15,
      sop: '/docs/sop/skin-tewl-test.pdf'
    },
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    equipment: 'Tewameter TM300',
    equipmentId: 'TM300-001',
    venue: '检测室A',
    venueId: 'ROOM-A01',
    scheduledDate: '2025-12-04',
    scheduledTime: '09:20',
    status: 'pending',
    priority: 'high',
    dataEntered: false,
    sourceScheduleId: 'SCH-2025-001-002',
    createdFrom: 'schedule',
    createdAt: '2025-12-03 15:00',
    updatedAt: '2025-12-03 15:00'
  },
  {
    id: 'WO-003',
    workOrderNo: 'WO-2025-001-003',
    projectId: 'KIS-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    visitNode: 'V1',
    visitName: 'T0 基线访视',
    subjectId: 'SUB-002',
    subjectName: '李四(匿名)',
    subjectCode: 'S002',
    testItem: {
      id: 'T001-002',
      name: '皮肤水分含量测试',
      category: '仪器检测',
      equipment: 'Corneometer CM825',
      duration: 20,
      sop: '/docs/sop/skin-moisture-test.pdf'
    },
    assignedTo: '王技师',
    assignedToId: 'TECH-002',
    equipment: 'Corneometer CM825',
    equipmentId: 'CM825-001',
    venue: '检测室A',
    venueId: 'ROOM-A01',
    scheduledDate: '2025-12-04',
    scheduledTime: '10:00',
    status: 'pending',
    priority: 'medium',
    dataEntered: false,
    sourceScheduleId: 'SCH-2025-001-003',
    createdFrom: 'schedule',
    createdAt: '2025-12-03 15:00',
    updatedAt: '2025-12-03 15:00'
  },
  
  // ===== 执行中的工单 =====
  {
    id: 'WO-004',
    workOrderNo: 'WO-2025-001-004',
    projectId: 'KIS-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    visitNode: 'V1',
    visitName: 'T0 基线访视',
    subjectId: 'SUB-003',
    subjectName: '王五(匿名)',
    subjectCode: 'S003',
    testItem: {
      id: 'T001-004',
      name: '皮肤色度测试',
      category: '仪器检测',
      equipment: 'Chromameter CR-400',
      duration: 10,
      sop: '/docs/sop/skin-color-test.pdf'
    },
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    equipment: 'Chromameter CR-400',
    equipmentId: 'CR400-001',
    venue: '检测室B',
    venueId: 'ROOM-B01',
    scheduledDate: '2025-12-04',
    scheduledTime: '14:00',
    startTime: '2025-12-04 14:05',
    status: 'in_progress',
    priority: 'medium',
    dataEntered: false,
    sourceScheduleId: 'SCH-2025-001-004',
    createdFrom: 'schedule',
    createdAt: '2025-12-03 15:00',
    updatedAt: '2025-12-04 14:05'
  },
  
  // ===== 已完成的工单（等待审核）=====
  {
    id: 'WO-005',
    workOrderNo: 'WO-2025-001-005',
    projectId: 'KIS-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    visitNode: 'V1',
    visitName: 'T0 基线访视',
    subjectId: 'SUB-004',
    subjectName: '赵六(匿名)',
    subjectCode: 'S004',
    testItem: {
      id: 'T001-005',
      name: '皮肤弹性测试',
      category: '仪器检测',
      equipment: 'Cutometer MPA580',
      duration: 20,
      sop: '/docs/sop/skin-elasticity-test.pdf'
    },
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    equipment: 'Cutometer MPA580',
    equipmentId: 'MPA580-001',
    venue: '检测室B',
    venueId: 'ROOM-B01',
    scheduledDate: '2025-12-03',
    scheduledTime: '10:00',
    startTime: '2025-12-03 10:05',
    endTime: '2025-12-03 10:25',
    actualDuration: 20,
    status: 'completed',
    priority: 'medium',
    dataEntered: true,
    dataEntryTime: '2025-12-03 10:30',
    dataValues: {
      R0: 0.685,
      R2: 0.742,
      R5: 0.798,
      R7: 0.821
    },
    sourceScheduleId: 'SCH-2025-001-005',
    createdFrom: 'schedule',
    createdAt: '2025-12-02 15:00',
    updatedAt: '2025-12-03 10:30'
  },
  
  // ===== 质量审核中的工单 =====
  {
    id: 'WO-006',
    workOrderNo: 'WO-2025-001-006',
    projectId: 'KIS-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    visitNode: 'V1',
    visitName: 'T0 基线访视',
    subjectId: 'SUB-005',
    subjectName: '孙七(匿名)',
    subjectCode: 'S005',
    testItem: {
      id: 'T001-002',
      name: '皮肤水分含量测试',
      category: '仪器检测',
      equipment: 'Corneometer CM825',
      duration: 20,
      sop: '/docs/sop/skin-moisture-test.pdf'
    },
    assignedTo: '王技师',
    assignedToId: 'TECH-002',
    equipment: 'Corneometer CM825',
    equipmentId: 'CM825-001',
    venue: '检测室A',
    venueId: 'ROOM-A01',
    scheduledDate: '2025-12-02',
    scheduledTime: '09:00',
    startTime: '2025-12-02 09:02',
    endTime: '2025-12-02 09:22',
    actualDuration: 20,
    status: 'quality_review',
    priority: 'high',
    dataEntered: true,
    dataEntryTime: '2025-12-02 09:25',
    dataValues: {
      point1: 45.2,
      point2: 46.8,
      point3: 44.5,
      average: 45.5
    },
    qualityReviewer: '张质控',
    sourceScheduleId: 'SCH-2025-001-006',
    createdFrom: 'schedule',
    createdAt: '2025-12-01 15:00',
    updatedAt: '2025-12-02 09:25'
  },
  
  // ===== 已批准的工单 =====
  {
    id: 'WO-007',
    workOrderNo: 'WO-2025-001-007',
    projectId: 'KIS-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    visitNode: 'V1',
    visitName: 'T0 基线访视',
    subjectId: 'SUB-006',
    subjectName: '周八(匿名)',
    subjectCode: 'S006',
    testItem: {
      id: 'T001-003',
      name: '皮肤TEWL测试',
      category: '仪器检测',
      equipment: 'Tewameter TM300',
      duration: 15,
      sop: '/docs/sop/skin-tewl-test.pdf'
    },
    assignedTo: '李技师',
    assignedToId: 'TECH-001',
    equipment: 'Tewameter TM300',
    equipmentId: 'TM300-001',
    venue: '检测室A',
    venueId: 'ROOM-A01',
    scheduledDate: '2025-12-01',
    scheduledTime: '10:00',
    startTime: '2025-12-01 10:05',
    endTime: '2025-12-01 10:20',
    actualDuration: 15,
    status: 'approved',
    priority: 'high',
    dataEntered: true,
    dataEntryTime: '2025-12-01 10:25',
    dataValues: {
      tewl1: 12.5,
      tewl2: 13.1,
      tewl3: 12.8,
      average: 12.8
    },
    qualityReviewer: '张质控',
    qualityReviewTime: '2025-12-01 11:00',
    qualityReviewNote: '数据准确，操作规范，批准通过',
    sourceScheduleId: 'SCH-2025-001-007',
    createdFrom: 'schedule',
    createdAt: '2025-11-30 15:00',
    updatedAt: '2025-12-01 11:00'
  }
];

// ========== 工具函数 ==========

/**
 * 根据技术员ID获取工单列表
 */
export const getWorkOrdersByTechnician = (technicianId: string): WorkOrder[] => {
  return mockWorkOrders.filter(wo => wo.assignedToId === technicianId);
};

/**
 * 根据状态筛选工单
 */
export const getWorkOrdersByStatus = (status: WorkOrderStatus, technicianId?: string): WorkOrder[] => {
  let orders = mockWorkOrders.filter(wo => wo.status === status);
  if (technicianId) {
    orders = orders.filter(wo => wo.assignedToId === technicianId);
  }
  return orders;
};

/**
 * 获取今日工单
 */
export const getTodayWorkOrders = (technicianId?: string): WorkOrder[] => {
  const today = '2025-12-04'; // Mock today
  let orders = mockWorkOrders.filter(wo => wo.scheduledDate === today);
  if (technicianId) {
    orders = orders.filter(wo => wo.assignedToId === technicianId);
  }
  return orders;
};

/**
 * 统计工单数量
 */
export const getWorkOrderStats = (technicianId?: string) => {
  const orders = technicianId 
    ? getWorkOrdersByTechnician(technicianId)
    : mockWorkOrders;
  
  return {
    total: orders.length,
    pending: orders.filter(wo => wo.status === 'pending').length,
    inProgress: orders.filter(wo => wo.status === 'in_progress').length,
    completed: orders.filter(wo => wo.status === 'completed').length,
    qualityReview: orders.filter(wo => wo.status === 'quality_review').length,
    approved: orders.filter(wo => wo.status === 'approved').length,
    rejected: orders.filter(wo => wo.status === 'rejected').length,
  };
};

// ========== 默认导出 ==========
export default {
  workOrders: mockWorkOrders,
  getWorkOrdersByTechnician,
  getWorkOrdersByStatus,
  getTodayWorkOrders,
  getWorkOrderStats,
};

