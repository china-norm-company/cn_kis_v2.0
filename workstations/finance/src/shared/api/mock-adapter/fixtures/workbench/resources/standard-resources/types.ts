/**
 * 标准资源类型定义
 */

// SOP状态枚举
export type SOPStatus = "生效" | "待审批" | "已废止";

// 方法类型枚举
export type MethodType = "仪器法" | "图像分析法" | "问卷法" | "专家评估";

// 适用评估项枚举
export type AssessmentItem = 
  | "皮肤水分" 
  | "经皮失水(TEWL)" 
  | "色斑面积" 
  | "光泽度" 
  | "弹性" 
  | "专家评估" 
  | "问卷评分";

// 标准方法资源接口
export interface StandardMethod {
  id: string;
  methodName: string; // 方法名称
  methodCode: string; // 方法编号
  applicableItems: AssessmentItem[]; // 适用评估项
  methodType: MethodType; // 方法类型
  sopFileName: string; // SOP文件名
  sopVersion: string; // SOP版本号
  sopEffectiveDate: string; // SOP生效日期
  sopExpiredDate?: string; // SOP废止日期（未废止则为空）
  requiredDevices: string[]; // 所需设备列表
  requiredConsumables: string[]; // 所需耗材列表
  requiredQualifications: string[]; // 执行人员资质要求
  environmentRequirement: string; // 环境要求
  calibrationRequirement: string; // 校准要求
  status: SOPStatus; // 状态
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  createdBy: string; // 创建人
  updatedBy?: string; // 更新人
  relatedProjects?: string[]; // 关联项目ID列表
  sopFileUrl?: string; // SOP文件URL（用于预览）
  historyVersions?: SOPVersion[]; // 历史版本
  changeRecords?: ChangeRecord[]; // 变更记录
}

// SOP版本历史
export interface SOPVersion {
  version: string;
  effectiveDate: string;
  expiredDate?: string;
  changeDescription: string;
  changedBy: string;
  changedAt: string;
}

// 变更记录
export interface ChangeRecord {
  id: string;
  changeType: "新增" | "修改" | "废止" | "恢复";
  changeDescription: string;
  changedBy: string;
  changedAt: string;
  beforeValue?: string;
  afterValue?: string;
}

// 筛选条件
export interface FilterConditions {
  searchKeyword: string;
  applicableItems: AssessmentItem[];
  methodTypes: MethodType[];
  sopStatuses: SOPStatus[];
  requiredDevice: string;
  requiredQualification: string;
  sopEffectiveDateStart?: string;
  sopEffectiveDateEnd?: string;
}

// 标准类型枚举
export type StandardType = "方法标准" | "国家法律法规" | "行业法律法规" | "资质法律法规" | "团体标准" | "国际标准";

// 标准状态枚举
export type StandardStatus = "现行有效" | "待实施" | "已作废";

// 标准信息接口（用于标准资源页面）
export interface StandardInfo {
  id: string;
  standardNo: string; // 标准编号
  standardNameZh: string; // 标准名称（中）
  standardNameEn: string | null; // 标准名称（英）
  type: StandardType; // 类型
  status: StandardStatus; // 状态
  publicationDate: string; // 发布日期（YYYY-MM-DD）
  implementationDate: string; // 实施日期（YYYY-MM-DD）
  abolitionDate?: string | null; // 作废日期（YYYY-MM-DD）
  reviewer: string; // 查新人
  reviewerRole: string; // 查新人角色
  reviewDate: string; // 查新日期（YYYY-MM-DD）
  domesticClassificationCode: string | null; // 国内分类编码
  internationalClassificationCode: string | null; // 国际分类编码
  attachments: string[]; // 标准附件
  createdAt: string;
  updatedAt: string;
}

// 统一的标准资源项（可以是标准信息或方法信息）
export type StandardResourceItem = 
  | { type: "standard"; data: StandardInfo }
  | { type: "method"; data: StandardMethod };

export interface StandardResourceProject {
  id: string;
  name: string;
  code: string;
}

// 统计数据
export interface Statistics {
  total: number; // 标准方法总数
  effective: number; // 当前生效方法数
  pending: number; // 待审批方法数
  expired: number; // 已废止方法数
}
