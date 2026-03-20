/**
 * 样本管理Mock数据
 * 技术员场景：样本接收、处理、存储、分发
 */

export type SampleStatus = 
  | 'pending'       // 待接收
  | 'received'      // 已接收
  | 'processing'    // 处理中
  | 'stored'        // 已存储（在库）
  | 'dispatched'    // 已分发
  | 'used'          // 已使用
  | 'discarded';    // 已废弃

export type SubSampleStatus = 
  | 'pending'       // 待入库
  | 'in_stock'      // 在库
  | 'dispatched'    // 已发放
  | 'returned'      // 已退回
  | 'disposed';     // 已处置

export type SampleType = 
  | 'skin_swab'     // 皮肤拭子
  | 'blood'         // 血样
  | 'urine'         // 尿样
  | 'product'       // 产品样本
  | 'photo'         // 照片
  | 'other';        // 其他

// 子样（子样品）
export interface SubSample {
  id: string;
  subSampleNo: string; // 子样编号：主样编号-Z01, Z02...
  parentSampleId: string;
  parentSampleNo: string;
  
  // 库存信息
  storageLocation: string; // 冷库A2-03
  status: SubSampleStatus;
  quantity: number;
  unit: string; // 瓶、管、份
  
  // 操作信息
  createdAt: string;
  createdBy: string;
  receivedDate?: string;
  receivedBy?: string;
  
  dispatchedTo?: string; // 发放给谁
  dispatchedDate?: string;
  dispatchedBy?: string;
  
  returnedDate?: string;
  returnedBy?: string;
  
  disposedDate?: string;
  disposedBy?: string;
  disposedReason?: string;
  
  notes?: string;
}

export interface Sample {
  id: string;
  sampleNo: string; // 样本编号（主样编号）
  
  // 关联信息
  projectId: string;
  projectName: string;
  subjectId: string;
  subjectCode: string; // S001
  subjectName: string;
  visitNode: string; // V1
  workOrderNo?: string;
  
  // 样本信息
  sampleType: SampleType;
  sampleName: string;
  sampleRole?: string; // 研究产品、测试品、对照产品、对照品
  
  // 状态信息
  status: SampleStatus;
  
  // 接收信息
  receivedBy?: string;
  receivedById?: string;
  receivedDate?: string;
  receivedTime?: string;
  
  // 存储信息
  storageCondition?: string; // 2-8°C, 避光, 室温等
  storageLocation?: string; // 位置：冷库A2-01
  storageTemp?: string; // -80°C
  storageDate?: string;
  
  // 处理信息
  processedBy?: string;
  processedDate?: string;
  processNotes?: string;
  
  // 分发信息
  dispatchedTo?: string;
  dispatchedDate?: string;
  dispatchNotes?: string;
  
  // 质量信息
  qualityStatus: 'qualified' | 'unqualified' | 'pending';
  expiryDate?: string; // 有效期
  expectedArrivalDate?: string; // 预计到样日期
  
  // 子样信息 ⭐
  subSamples: SubSample[];
  totalQuantity: number; // 总数量
  availableQuantity: number; // 可用数量（在库数量）
  
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ========== Mock数据：样本（包含子样）==========
export const mockSamples: Sample[] = [
  // ===== 样本1：功效精华主样（待接收）=====
  {
    id: 'SAMPLE-001',
    sampleNo: '2025-CLI88-001',
    projectId: 'P-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    subjectId: 'SUB-001',
    subjectCode: 'S001',
    subjectName: '张三(匿名)',
    visitNode: 'V1',
    sampleType: 'product',
    sampleName: '功效精华主样',
    sampleRole: '测试品',
    status: 'pending',
    storageCondition: '2-8°C, 避光',
    qualityStatus: 'pending',
    expectedArrivalDate: '2026-06-30',
    expiryDate: '2026-06-30',
    subSamples: [], // 待接收，还没有子样
    totalQuantity: 0,
    availableQuantity: 0,
    notes: '',
    createdAt: '2025-12-04 09:00',
    updatedAt: '2025-12-04 09:00'
  },
  
  // ===== 样本2：舒缓乳液（在库，有子样）=====
  {
    id: 'SAMPLE-002',
    sampleNo: '2025-CLI77-009',
    projectId: 'P-2025-002',
    projectName: '欧莱雅舒缓乳液功效验证',
    subjectId: 'SUB-002',
    subjectCode: 'S002',
    subjectName: '李四(匿名)',
    visitNode: 'V1',
    sampleType: 'product',
    sampleName: '舒缓乳液',
    sampleRole: '对照品',
    status: 'stored',
    receivedBy: '李技师',
    receivedById: 'TECH-001',
    receivedDate: '2025-12-01',
    receivedTime: '10:00',
    storageCondition: '室温, 避光',
    storageLocation: '冷库A2-01',
    qualityStatus: 'qualified',
    expectedArrivalDate: '2026-03-31',
    expiryDate: '2026-03-31',
    subSamples: [
      {
        id: 'SUB-001',
        subSampleNo: '2025-CLI77-009-Z01',
        parentSampleId: 'SAMPLE-002',
        parentSampleNo: '2025-CLI77-009',
        storageLocation: '冷库A2-03',
        status: 'in_stock',
        quantity: 1,
        unit: '瓶',
        createdAt: '2025-12-01 10:15',
        createdBy: '李技师',
        receivedDate: '2025-12-01',
        receivedBy: '李技师'
      },
      {
        id: 'SUB-002',
        subSampleNo: '2025-CLI77-009-Z02',
        parentSampleId: 'SAMPLE-002',
        parentSampleNo: '2025-CLI77-009',
        storageLocation: '冷库A2-03',
        status: 'in_stock',
        quantity: 1,
        unit: '瓶',
        createdAt: '2025-12-01 10:15',
        createdBy: '李技师',
        receivedDate: '2025-12-01',
        receivedBy: '李技师'
      },
      {
        id: 'SUB-003',
        subSampleNo: '2025-CLI77-009-Z03',
        parentSampleId: 'SAMPLE-002',
        parentSampleNo: '2025-CLI77-009',
        storageLocation: '冷库A2-03',
        status: 'in_stock',
        quantity: 1,
        unit: '瓶',
        createdAt: '2025-12-01 10:15',
        createdBy: '李技师',
        receivedDate: '2025-12-01',
        receivedBy: '李技师'
      },
      {
        id: 'SUB-004',
        subSampleNo: '2025-CLI77-009-Z04',
        parentSampleId: 'SAMPLE-002',
        parentSampleNo: '2025-CLI77-009',
        storageLocation: '冷库A2-03',
        status: 'dispatched',
        quantity: 1,
        unit: '瓶',
        createdAt: '2025-12-01 10:15',
        createdBy: '李技师',
        receivedDate: '2025-12-01',
        receivedBy: '李技师',
        dispatchedTo: '微生物实验室',
        dispatchedDate: '2025-12-03',
        dispatchedBy: '李技师'
      }
    ],
    totalQuantity: 8,
    availableQuantity: 3, // 4个子样，1个已发放，3个在库
    notes: '',
    createdAt: '2025-12-01 10:00',
    updatedAt: '2025-12-03 14:20'
  },
  
  // ===== 样本3：皮肤拭子（已接收，待分装）=====
  {
    id: 'SAMPLE-003',
    sampleNo: 'KIS-2025-001-S001-V1-SWAB-001',
    projectId: 'KIS-2025-001',
    projectName: '欧莱雅保湿面霜功效验证',
    subjectId: 'SUB-001',
    subjectCode: 'S001',
    subjectName: '张三(匿名)',
    visitNode: 'V1',
    workOrderNo: 'WO-2025-001-001',
    sampleType: 'skin_swab',
    sampleName: '面部皮肤拭子',
    status: 'received',
    receivedBy: '李技师',
    receivedById: 'TECH-001',
    receivedDate: '2025-12-04',
    receivedTime: '09:30',
    storageCondition: '-80°C',
    qualityStatus: 'qualified',
    expiryDate: '2025-12-18',
    subSamples: [], // 已接收但还未分装子样
    totalQuantity: 3,
    availableQuantity: 0,
    notes: '样本完整，待分装',
    createdAt: '2025-12-04 09:30',
    updatedAt: '2025-12-04 09:30'
  }
];

// ========== 工具函数 ==========
export const getSamplesByTechnician = (technicianId: string) => {
  return mockSamples.filter(s => s.receivedById === technicianId || !s.receivedById);
};

export const getSamplesByStatus = (status: SampleStatus, technicianId?: string) => {
  let samples = mockSamples.filter(s => s.status === status);
  if (technicianId) {
    samples = samples.filter(s => s.receivedById === technicianId || !s.receivedById);
  }
  return samples;
};

export const getSampleStats = (technicianId?: string) => {
  const samples = technicianId 
    ? getSamplesByTechnician(technicianId)
    : mockSamples;
    
  // 统计子样数量
  let totalSubSamples = 0;
  let inStockSubSamples = 0;
  let dispatchedSubSamples = 0;
  
  samples.forEach(sample => {
    totalSubSamples += sample.subSamples.length;
    inStockSubSamples += sample.subSamples.filter(sub => sub.status === 'in_stock').length;
    dispatchedSubSamples += sample.subSamples.filter(sub => sub.status === 'dispatched').length;
  });
    
  return {
    total: samples.length,
    pending: samples.filter(s => s.status === 'pending').length,
    received: samples.filter(s => s.status === 'received').length,
    processing: samples.filter(s => s.status === 'processing').length,
    stored: samples.filter(s => s.status === 'stored').length,
    dispatched: samples.filter(s => s.status === 'dispatched').length,
    used: samples.filter(s => s.status === 'used').length,
    discarded: samples.filter(s => s.status === 'discarded').length,
    // 子样统计
    totalSubSamples,
    inStockSubSamples,
    dispatchedSubSamples,
  };
};

