/**
 * 标准资源模拟数据
 */
import {
  StandardMethod,
  StandardInfo,
  AssessmentItem,
  MethodType,
  SOPStatus,
  StandardType,
  StandardStatus,
  Statistics,
  StandardResourceProject,
} from "./types";
import { listStandardLedgers } from "@/features/quality/standards/testing/fixtures/standardLedgerMocks";
import { listStandardUpdateRecords } from "@/features/quality/standards/testing/fixtures/standardUpdateRecordsMocks";

export const mockStandardProjects: StandardResourceProject[] = [
  { id: "C25005046", name: "化妆品功效测试项目A", code: "C25005046" },
  { id: "C25005047", name: "临床研究项目B", code: "C25005047" },
  { id: "C25005048", name: "安全性评估项目C", code: "C25005048" },
  { id: "C25005049", name: "药物临床试验项目D", code: "C25005049" },
  { id: "C25005050", name: "医疗器械验证项目E", code: "C25005050" },
];

export const listStandardProjects = (): StandardResourceProject[] => [...mockStandardProjects];

// 生成模拟的标准方法数据
export const generateMockStandardMethods = (): StandardMethod[] => {
  const methods: StandardMethod[] = [
    {
      id: "MET-001",
      methodName: "皮肤水分含量测定法（Corneometer CM 825）",
      methodCode: "MET-WAT-001",
      applicableItems: ["皮肤水分"],
      methodType: "仪器法",
      sopFileName: "SOP_WaterContent_V2.1.pdf",
      sopVersion: "V2.1",
      sopEffectiveDate: "2024-01-15",
      requiredDevices: ["Corneometer CM 825", "校准卡"],
      requiredConsumables: ["消毒棉片", "测量贴纸"],
      requiredQualifications: ["皮肤评估师-L2"],
      environmentRequirement: "室温 22±2℃，湿度 50±10%",
      calibrationRequirement: "设备使用前需校准，校准周期：每次使用前",
      status: "生效",
      createdAt: "2024-01-10T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
      createdBy: "张质量",
      updatedBy: "李质量",
      sopFileUrl: "/files/sop/SOP_WaterContent_V2.1.pdf",
      relatedProjects: ["C25005046"],
    },
    {
      id: "MET-002",
      methodName: "经皮失水率(TEWL)测定法",
      methodCode: "MET-TEWL-001",
      applicableItems: ["经皮失水(TEWL)"],
      methodType: "仪器法",
      sopFileName: "SOP_TEWL_V1.5.pdf",
      sopVersion: "V1.5",
      sopEffectiveDate: "2024-02-01",
      requiredDevices: ["Tewameter TM 300"],
      requiredConsumables: ["探头保护套", "清洁液"],
      requiredQualifications: ["皮肤评估师-L2", "GCP认证"],
      environmentRequirement: "室温 20-24℃，湿度 40-60%，无风环境",
      calibrationRequirement: "每日使用前校准，校准标准：标准参考值±5%",
      status: "生效",
      createdAt: "2023-12-15T10:00:00Z",
      updatedAt: "2024-02-01T10:00:00Z",
      createdBy: "王质量",
      updatedBy: "王质量",
      sopFileUrl: "/files/sop/SOP_TEWL_V1.5.pdf",
      relatedProjects: ["C25005046", "C25005047"],
    },
    {
      id: "MET-003",
      methodName: "皮肤色斑面积图像分析法",
      methodCode: "MET-SPOT-001",
      applicableItems: ["色斑面积"],
      methodType: "图像分析法",
      sopFileName: "SOP_SpotAnalysis_V3.0.pdf",
      sopVersion: "V3.0",
      sopEffectiveDate: "2024-03-10",
      requiredDevices: ["Visia", "标准光源箱"],
      requiredConsumables: ["定位贴", "清洁布"],
      requiredQualifications: ["图像分析师-L1", "皮肤评估师-L2"],
      environmentRequirement: "标准光源环境，色温 5500K±200K",
      calibrationRequirement: "每周校准一次，使用标准色卡校准",
      status: "生效",
      createdAt: "2023-11-20T10:00:00Z",
      updatedAt: "2024-03-10T10:00:00Z",
      createdBy: "李质量",
      updatedBy: "李质量",
      sopFileUrl: "/files/sop/SOP_SpotAnalysis_V3.0.pdf",
      relatedProjects: ["C25005048"],
    },
    {
      id: "MET-004",
      methodName: "皮肤光泽度测定法",
      methodCode: "MET-GLOSS-001",
      applicableItems: ["光泽度"],
      methodType: "仪器法",
      sopFileName: "SOP_Gloss_V2.0.pdf",
      sopVersion: "V2.0",
      sopEffectiveDate: "2024-01-20",
      requiredDevices: ["Glossmeter GM-268"],
      requiredConsumables: ["标准板", "清洁液"],
      requiredQualifications: ["皮肤评估师-L1"],
      environmentRequirement: "室温 22±2℃，避免强光直射",
      calibrationRequirement: "每次使用前使用标准板校准",
      status: "生效",
      createdAt: "2023-12-10T10:00:00Z",
      updatedAt: "2024-01-20T10:00:00Z",
      createdBy: "张质量",
      updatedBy: "张质量",
      sopFileUrl: "/files/sop/SOP_Gloss_V2.0.pdf",
    },
    {
      id: "MET-005",
      methodName: "皮肤弹性测定法（Cutometer）",
      methodCode: "MET-ELAST-001",
      applicableItems: ["弹性"],
      methodType: "仪器法",
      sopFileName: "SOP_Elasticity_V1.8.pdf",
      sopVersion: "V1.8",
      sopEffectiveDate: "2024-02-15",
      requiredDevices: ["Cutometer MPA 580"],
      requiredConsumables: ["探头", "耦合剂"],
      requiredQualifications: ["皮肤评估师-L2"],
      environmentRequirement: "室温 22±2℃，湿度 50±10%",
      calibrationRequirement: "每周校准，使用标准弹性体校准",
      status: "生效",
      createdAt: "2023-11-15T10:00:00Z",
      updatedAt: "2024-02-15T10:00:00Z",
      createdBy: "王质量",
      updatedBy: "王质量",
      sopFileUrl: "/files/sop/SOP_Elasticity_V1.8.pdf",
    },
    {
      id: "MET-006",
      methodName: "专家评估法（皮肤状态综合评估）",
      methodCode: "MET-EXPERT-001",
      applicableItems: ["专家评估"],
      methodType: "专家评估",
      sopFileName: "SOP_ExpertAssessment_V2.2.pdf",
      sopVersion: "V2.2",
      sopEffectiveDate: "2024-01-10",
      requiredDevices: [],
      requiredConsumables: ["评估表", "记录笔"],
      requiredQualifications: ["皮肤科医师", "高级评估师"],
      environmentRequirement: "标准诊室环境，充足自然光或标准光源",
      calibrationRequirement: "评估前需进行一致性培训，每季度复训",
      status: "生效",
      createdAt: "2023-10-01T10:00:00Z",
      updatedAt: "2024-01-10T10:00:00Z",
      createdBy: "李质量",
      updatedBy: "李质量",
      sopFileUrl: "/files/sop/SOP_ExpertAssessment_V2.2.pdf",
    },
    {
      id: "MET-007",
      methodName: "问卷评分法（皮肤满意度调查）",
      methodCode: "MET-QUESTION-001",
      applicableItems: ["问卷评分"],
      methodType: "问卷法",
      sopFileName: "SOP_Questionnaire_V1.3.pdf",
      sopVersion: "V1.3",
      sopEffectiveDate: "2024-02-20",
      requiredDevices: [],
      requiredConsumables: ["问卷表", "笔"],
      requiredQualifications: ["CRC-GCP认证"],
      environmentRequirement: "安静私密的环境，避免干扰",
      calibrationRequirement: "问卷发放前需进行说明培训",
      status: "生效",
      createdAt: "2023-12-20T10:00:00Z",
      updatedAt: "2024-02-20T10:00:00Z",
      createdBy: "张质量",
      updatedBy: "张质量",
      sopFileUrl: "/files/sop/SOP_Questionnaire_V1.3.pdf",
    },
    {
      id: "MET-008",
      methodName: "皮肤水分含量测定法（旧版）",
      methodCode: "MET-WAT-001",
      applicableItems: ["皮肤水分"],
      methodType: "仪器法",
      sopFileName: "SOP_WaterContent_V2.0.pdf",
      sopVersion: "V2.0",
      sopEffectiveDate: "2023-06-01",
      sopExpiredDate: "2024-01-14",
      requiredDevices: ["Corneometer CM 825", "校准卡"],
      requiredConsumables: ["消毒棉片", "测量贴纸"],
      requiredQualifications: ["皮肤评估师-L2"],
      environmentRequirement: "室温 22±2℃，湿度 50±10%",
      calibrationRequirement: "设备使用前需校准",
      status: "已废止",
      createdAt: "2023-05-15T10:00:00Z",
      updatedAt: "2024-01-14T10:00:00Z",
      createdBy: "张质量",
      updatedBy: "李质量",
      sopFileUrl: "/files/sop/SOP_WaterContent_V2.0.pdf",
    },
    {
      id: "MET-009",
      methodName: "皮肤色斑面积图像分析法（待审批）",
      methodCode: "MET-SPOT-002",
      applicableItems: ["色斑面积"],
      methodType: "图像分析法",
      sopFileName: "SOP_SpotAnalysis_V3.1.pdf",
      sopVersion: "V3.1",
      sopEffectiveDate: "2024-04-01",
      requiredDevices: ["Visia", "标准光源箱"],
      requiredConsumables: ["定位贴", "清洁布"],
      requiredQualifications: ["图像分析师-L1", "皮肤评估师-L2"],
      environmentRequirement: "标准光源环境，色温 5500K±200K",
      calibrationRequirement: "每周校准一次，使用标准色卡校准",
      status: "待审批",
      createdAt: "2024-03-15T10:00:00Z",
      updatedAt: "2024-03-15T10:00:00Z",
      createdBy: "李质量",
      sopFileUrl: "/files/sop/SOP_SpotAnalysis_V3.1.pdf",
    },
    {
      id: "MET-010",
      methodName: "皮肤综合评估法（多指标联合）",
      methodCode: "MET-MULTI-001",
      applicableItems: ["皮肤水分", "经皮失水(TEWL)", "弹性"],
      methodType: "仪器法",
      sopFileName: "SOP_MultiAssessment_V1.0.pdf",
      sopVersion: "V1.0",
      sopEffectiveDate: "2024-03-01",
      requiredDevices: ["Corneometer CM 825", "Tewameter TM 300", "Cutometer MPA 580"],
      requiredConsumables: ["消毒棉片", "探头保护套", "耦合剂"],
      requiredQualifications: ["皮肤评估师-L2", "GCP认证"],
      environmentRequirement: "室温 22±2℃，湿度 50±10%，无风环境",
      calibrationRequirement: "所有设备使用前需校准，按各自SOP执行",
      status: "生效",
      createdAt: "2024-02-15T10:00:00Z",
      updatedAt: "2024-03-01T10:00:00Z",
      createdBy: "王质量",
      updatedBy: "王质量",
      sopFileUrl: "/files/sop/SOP_MultiAssessment_V1.0.pdf",
    },
  ];

  return methods;
};

// 获取所有设备名称（用于筛选）
export const getAllDevices = (methods: StandardMethod[]): string[] => {
  const deviceSet = new Set<string>();
  methods.forEach((method) => {
    method.requiredDevices.forEach((device) => deviceSet.add(device));
  });
  return Array.from(deviceSet).sort();
};

// 获取所有人员资质（用于筛选）
export const getAllQualifications = (methods: StandardMethod[]): string[] => {
  const qualSet = new Set<string>();
  methods.forEach((method) => {
    method.requiredQualifications.forEach((qual) => qualSet.add(qual));
  });
  return Array.from(qualSet).sort();
};

// 生成模拟的标准信息数据（从标准台账获取，并从查新记录获取作废日期）
export const generateMockStandardInfos = (): StandardInfo[] => {
  const ledgers = listStandardLedgers();
  const updateRecords = listStandardUpdateRecords();
  
  // 创建标准编号到作废日期的映射
  const abolitionDateMap = new Map<string, string | null>();
  updateRecords.forEach((record) => {
    if (record.abolitionDate) {
      abolitionDateMap.set(record.standardNo, record.abolitionDate);
    }
  });
  
  return ledgers.map((ledger) => ({
    id: ledger.id,
    standardNo: ledger.standardNo,
    standardNameZh: ledger.standardNameZh,
    standardNameEn: ledger.standardNameEn,
    type: ledger.type,
    status: ledger.status,
    publicationDate: ledger.publicationDate,
    implementationDate: ledger.implementationDate,
    abolitionDate: abolitionDateMap.get(ledger.standardNo) || (ledger.status === "已作废" ? ledger.reviewDate : null),
    reviewer: ledger.reviewer,
    reviewerRole: ledger.reviewerRole,
    reviewDate: ledger.reviewDate,
    domesticClassificationCode: ledger.domesticClassificationCode,
    internationalClassificationCode: ledger.internationalClassificationCode,
    attachments: ledger.attachments,
    createdAt: ledger.createdAt,
    updatedAt: ledger.updatedAt,
  }));
};

// 计算统计数据
export const calculateStatistics = (methods: StandardMethod[]): Statistics => {
  return {
    total: methods.length,
    effective: methods.filter((m) => m.status === "生效").length,
    pending: methods.filter((m) => m.status === "待审批").length,
    expired: methods.filter((m) => m.status === "已废止").length,
  };
};
