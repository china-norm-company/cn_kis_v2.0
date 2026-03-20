/**
 * 将Mock方案数据转换为排程工作台项目数据
 */

import { getMockProtocolsFromLocalStorage } from './mockProjectProtocols';
import { convertParsedDataToVisitPlan } from '@/pages/workbench/projects/utils/visitPlanConverter';
import type { SchedulingApprovalRecord } from '@/features/scheduler/types/approval';
import { initializeProjectApprovalRecords } from '@/pages/workbench/scheduler/utils/approvalRecords';

export interface SchedulerProject {
  projectId: number;
  projectCode: string;
  projectName: string;
  clientName: string;
  priority: 'high' | 'medium' | 'low';
  totalSamples: number;
  expectedStartDate: string;
  expectedEndDate: string;
  status: 'pending_review' | 'pending_schedule' | 'pending_researcher_confirmation' | 'researcher_confirmed' | 'scheduled' | 'cancelled' | 'rejected';
  protocolId?: number;
  visits: SchedulerVisit[];
  approvalRecords?: SchedulingApprovalRecord[];
}

export interface SchedulerVisit {
  visitId: number;
  visitCode: string;
  visitName: string;
  dayOffset: number;
  windowDays: number;
  equipments: SchedulerEquipment[];
  evaluators: SchedulerEvaluator[];
}

export interface SchedulerEquipment {
  equipmentId: string;
  equipmentName: string;
  sampleCount: number;
  timePerSample: number; // 分钟
}

export interface SchedulerEvaluator {
  evaluationType: string;
  sampleCount: number;
  timePerSample: number; // 分钟
}

/**
 * 将方案状态映射到排程项目状态
 * 方案管理中的状态需要映射到排程管理中心的状态
 */
function mapProtocolStatusToSchedulerStatus(protocolStatus: string): 'pending_review' | 'pending_schedule' | 'scheduled' {
  // 方案状态到排程状态的映射
  const statusMap: Record<string, 'pending_review' | 'pending_schedule' | 'scheduled'> = {
    // 待审核相关状态 -> 待审核
    'pending_approval': 'pending_review',
    'pending_review': 'pending_review',
    // 已通过/已批准 -> 待排程
    'approved': 'pending_schedule',
    'active': 'pending_schedule',
    // 已发布工单状态保持不变
    'scheduled': 'scheduled',
    'pending_schedule': 'pending_schedule',
  };
  
  return statusMap[protocolStatus] || 'pending_review';
}

/**
 * 从Mock方案数据生成排程工作台项目列表
 * 动态从localStorage读取用户上传的方案
 */
export function generateSchedulerProjects(): SchedulerProject[] {
  const protocols = getMockProtocolsFromLocalStorage();
  return protocols.map((protocol) => {
    const parsedData = protocol.parsed_data;
    const totalSamples = parsedData?.sample_plan?.total_samples || 90;
    
    // 使用标准的转换函数来处理访视计划，避免重复
    // convertParsedDataToVisitPlan 已经内置了完整的去重逻辑
    const visitPlanItems = convertParsedDataToVisitPlan(parsedData);
    
    // 将 VisitPlanItem 转换为 SchedulerVisit 格式
    const visits: SchedulerVisit[] = visitPlanItems.map((item, index) => {
      // 转换设备信息
      const equipments: SchedulerEquipment[] = item.equipments.map((eq, eqIdx) => ({
        equipmentId: `eq-${protocol.id}-${index}-${eqIdx}`,
        equipmentName: eq.equipmentName,
        sampleCount: totalSamples,
        timePerSample: 5, // 默认5分钟/样本
      }));
      
      // 转换评估信息
      const evaluators: SchedulerEvaluator[] = item.evaluators.map(ev => ({
        evaluationType: ev.evaluationType || ev.evaluationCategory || '临床评估',
        sampleCount: totalSamples,
        timePerSample: 10, // 默认10分钟/样本
      }));
      
      return {
        visitId: index + 1,
        visitCode: item.visitCode,
        visitName: item.visitName,
        dayOffset: item.dayOffset,
        windowDays: parseInt(item.allowedWindowDeviation?.replace(/[^0-9]/g, '') || '0'),
        equipments,
        evaluators,
      };
    });
    
    return {
      projectId: protocol.id,
      projectCode: protocol.code,
      projectName: protocol.name,
      clientName: parsedData?.project_info?.sponsor || protocol.project_name,
      priority: parsedData?.project_info?.priority || 'medium',
      totalSamples,
      expectedStartDate: parsedData?.project_info?.expected_start_date || protocol.create_time.split('T')[0],
      expectedEndDate: parsedData?.project_info?.expected_end_date || protocol.create_time.split('T')[0],
      status: mapProtocolStatusToSchedulerStatus(protocol.status),
      protocolId: protocol.id,
      visits,
      approvalRecords: initializeProjectApprovalRecords(
        '研究员',
        `researcher-${protocol.id}`
      ),
    };
  });
}

/**
 * Mock排程工作台项目数据 - 基于真实方案生成
 */
/**
 * 动态生成排程项目（不再使用静态常量）
 * @deprecated 改用 generateSchedulerProjects() 动态生成
 */
export const MOCK_SCHEDULER_PROJECTS = generateSchedulerProjects();

/**
 * 根据ID获取排程项目
 */
export function getSchedulerProjectById(id: number): SchedulerProject | undefined {
  const projects = generateSchedulerProjects();
  return projects.find(p => p.projectId === id);
}

/**
 * 根据状态筛选排程项目
 */
export function getSchedulerProjectsByStatus(status: string): SchedulerProject[] {
  const projects = generateSchedulerProjects();
  return projects.filter(p => p.status === status);
}
