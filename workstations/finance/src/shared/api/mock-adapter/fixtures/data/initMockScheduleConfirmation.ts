/**
 * 初始化待研究员确认的排程方案 Mock 数据
 * 用于测试研究员确认功能
 */

import { createApprovalRecord, addApprovalRecord } from '@/pages/workbench/scheduler/utils/approvalRecords';

/**
 * 初始化待研究员确认的排程项目
 * 这个函数会在 localStorage 中创建一个状态为 pending_researcher_confirmation 的排程项目
 */
export function initMockScheduleConfirmation() {
  try {
    // 获取现有的排程项目
    const existingProjects = JSON.parse(localStorage.getItem('mock_scheduler_projects') || '[]');
    
    // 检查是否已经存在待确认的项目
    const hasPendingConfirmation = existingProjects.some(
      (p: any) => p.status === 'pending_researcher_confirmation'
    );
    
    if (hasPendingConfirmation) {
      console.log('待研究员确认的项目已存在，跳过初始化');
      return;
    }
    
    // 确保项目ID为1的项目有对应的方案数据
    const existingProtocols = JSON.parse(localStorage.getItem('mock_protocols') || '[]');
    const hasProtocolForProject1 = existingProtocols.some((p: any) => p.project_id === 1 && p.id === 1);
    
    if (!hasProtocolForProject1) {
      // 创建一个方案数据
      const mockProtocol = {
        id: 1,
        project_id: 1,
        name: '抗衰老精华液功效评价研究方案',
        code: 'PRJ-2025-001',
        description: '评估新型抗衰老精华液对皮肤细纹、弹性等指标的改善效果',
        file_url: '#',
        file_size: 0,
        file_type: 'pdf',
        status: 'approved',
        create_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        update_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        parsed_data: {
          project_info: {
            project_name: '抗衰老精华液功效评价研究',
            sponsor: '客户A',
            priority: 'high',
            expected_start_date: '2025-03-01',
            expected_end_date: '2025-06-30',
          },
          sample_plan: {
            total_samples: 90,
          },
          visit_plan: [
            {
              visitCode: 'V1',
              visitName: '筛选访视',
              dayOffset: 0,
              allowedWindowDeviation: '±0天',
              equipments: [
                { equipmentName: 'VISIA皮肤检测仪' },
              ],
              evaluators: [
                { evaluationType: '临床评估' },
              ],
            },
            {
              visitCode: 'V2',
              visitName: '基线访视',
              dayOffset: 7,
              allowedWindowDeviation: '±2天',
              equipments: [
                { equipmentName: 'Corneometer皮肤水分测试仪' },
              ],
              evaluators: [
                { evaluationType: '临床评估' },
              ],
            },
          ],
        },
        visit_plan_generated: true,
      };
      
      const updatedProtocols = [...existingProtocols, mockProtocol];
      localStorage.setItem('mock_protocols', JSON.stringify(updatedProtocols));
      console.log('✅ 已创建项目1的方案数据');
    }
    
    // 创建一个待研究员确认的排程项目
    // 使用项目ID 1，对应 MOCK_PROJECTS 中的第一个项目
    const mockProject = {
      projectId: 1,
      projectCode: 'PRJ-2025-001',
      projectName: '抗衰老精华液功效评价研究',
      clientName: '客户A',
      priority: 'high' as const,
      totalSamples: 90,
      expectedStartDate: '2025-03-01',
      expectedEndDate: '2025-06-30',
      status: 'pending_researcher_confirmation' as const,
      protocolId: 1, // 对应第一个方案
      visits: [
        {
          visitId: 1,
          visitCode: 'V1',
          visitName: '筛选访视',
          dayOffset: 0,
          windowDays: 0,
          equipments: [
            {
              equipmentId: 'eq-1',
              equipmentName: 'VISIA皮肤检测仪',
              sampleCount: 90,
              timePerSample: 5,
            },
          ],
          evaluators: [
            {
              evaluationType: '临床评估',
              sampleCount: 90,
              timePerSample: 10,
            },
          ],
        },
        {
          visitId: 2,
          visitCode: 'V2',
          visitName: '基线访视',
          dayOffset: 7,
          windowDays: 2,
          equipments: [
            {
              equipmentId: 'eq-2',
              equipmentName: 'Corneometer皮肤水分测试仪',
              sampleCount: 90,
              timePerSample: 5,
            },
          ],
          evaluators: [
            {
              evaluationType: '临床评估',
              sampleCount: 90,
              timePerSample: 10,
            },
          ],
        },
      ],
      approvalRecords: [
        // 访视计划提交
        {
          id: 'ar-1',
          seq: 1,
          nodeName: '访视计划提交',
          operator: '研究员',
          operatorId: 'researcher-001',
          operateDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4天前
          action: '提交',
          comment: '方案已提交，等待排程审核',
        },
        // 资源审核
        {
          id: 'ar-2',
          seq: 2,
          nodeName: '资源审核',
          operator: '排程专员',
          operatorId: 'scheduler-001',
          operateDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3天前
          action: '通过',
          comment: '资源审核通过，资源全部可用',
        },
        // 排程方案确认
        {
          id: 'ar-3',
          seq: 3,
          nodeName: '排程方案确认',
          operator: '排程专员',
          operatorId: 'scheduler-001',
          operateDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1天前
          action: '确认',
          comment: '已确认并保存排程方案"方案1"',
          metadata: {
            selectedPlanId: 'plan-1',
            schedulePlanCount: 3,
          },
        },
      ],
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    };
    
    // 添加到现有项目列表
    const updatedProjects = [...existingProjects, mockProject];
    localStorage.setItem('mock_scheduler_projects', JSON.stringify(updatedProjects));
    
    console.log('✅ 已创建待研究员确认的排程项目 Mock 数据');
    console.log('项目ID:', mockProject.projectId);
    console.log('项目名称:', mockProject.projectName);
    console.log('状态:', mockProject.status);
    
    return mockProject;
  } catch (error) {
    console.error('❌ 初始化 Mock 数据失败:', error);
    return null;
  }
}

/**
 * 在浏览器控制台执行此函数来初始化 Mock 数据
 * 或者在应用启动时调用
 */
if (typeof window !== 'undefined') {
  // 在开发环境下，可以通过控制台调用
  (window as any).initMockScheduleConfirmation = initMockScheduleConfirmation;
}
