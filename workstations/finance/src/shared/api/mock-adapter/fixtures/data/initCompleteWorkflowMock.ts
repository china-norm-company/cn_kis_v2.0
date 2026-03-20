/**
 * 初始化完整的排程工作流 Mock 数据
 * 包含从项目提交到工单发布的完整流程数据
 */

import { createApprovalRecord, addApprovalRecord } from '@/pages/workbench/scheduler/utils/approvalRecords';
import { format, addDays } from 'date-fns';

/**
 * 初始化完整的排程工作流数据
 * 包含多个不同状态的项目，用于完整演示整个流程
 */
export function initCompleteWorkflowMock() {
  try {
    console.log('🚀 开始初始化完整工作流 Mock 数据...');

    // 1. 初始化项目协议数据
    initProjectProtocols();

    // 2. 初始化排程项目数据（不同状态）
    initSchedulerProjects();

    // 3. 初始化已保存的排程方案
    initSavedSchedules();

    // 4. 初始化研究员确认待办
    initResearcherConfirmations();

    console.log('✅ 完整工作流 Mock 数据初始化完成！');
    console.log('📋 包含以下状态的项目：');
    console.log('  - 待审核 (pending_review)');
    console.log('  - 待排程 (pending_schedule)');
    console.log('  - 待研究员确认 (pending_researcher_confirmation)');
    console.log('  - 待发布工单 (researcher_confirmed)');
    console.log('  - 已发布工单 (scheduled)');
  } catch (error) {
    console.error('❌ 初始化完整工作流 Mock 数据失败:', error);
  }
}

/**
 * 初始化项目协议数据
 */
function initProjectProtocols() {
  const existingProtocols = JSON.parse(localStorage.getItem('mock_protocols') || '[]');
  
  const mockProtocols = [
    {
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
            equipments: [{ equipmentName: 'VISIA皮肤检测仪' }],
            evaluators: [{ evaluationType: '临床评估' }],
          },
          {
            visitCode: 'V2',
            visitName: '基线访视',
            dayOffset: 7,
            allowedWindowDeviation: '±2天',
            equipments: [{ equipmentName: 'Corneometer皮肤水分测试仪' }],
            evaluators: [{ evaluationType: '临床评估' }],
          },
          {
            visitCode: 'V3',
            visitName: '第4周访视',
            dayOffset: 28,
            allowedWindowDeviation: '±3天',
            equipments: [{ equipmentName: 'VISIA皮肤检测仪' }],
            evaluators: [{ evaluationType: '临床评估' }],
          },
        ],
      },
      visit_plan_generated: true,
    },
    {
      id: 2,
      project_id: 2,
      name: '美白精华液功效评价研究方案',
      code: 'PRJ-2025-002',
      description: '评估美白精华液对皮肤色斑、亮度的改善效果',
      file_url: '#',
      file_size: 0,
      file_type: 'pdf',
      status: 'approved',
      create_time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      update_time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      parsed_data: {
        project_info: {
          project_name: '美白精华液功效评价研究',
          sponsor: '客户B',
          priority: 'medium',
          expected_start_date: '2025-03-15',
          expected_end_date: '2025-07-15',
        },
        sample_plan: {
          total_samples: 60,
        },
        visit_plan: [
          {
            visitCode: 'V1',
            visitName: '筛选访视',
            dayOffset: 0,
            allowedWindowDeviation: '±0天',
            equipments: [{ equipmentName: 'VISIA皮肤检测仪' }],
            evaluators: [{ evaluationType: '临床评估' }],
          },
          {
            visitCode: 'V2',
            visitName: '基线访视',
            dayOffset: 7,
            allowedWindowDeviation: '±2天',
            equipments: [{ equipmentName: 'Mexameter皮肤色度测试仪' }],
            evaluators: [{ evaluationType: '临床评估' }],
          },
        ],
      },
      visit_plan_generated: true,
    },
    {
      id: 3,
      project_id: 3,
      name: '保湿面霜功效评价研究方案',
      code: 'PRJ-2025-003',
      description: '评估保湿面霜对皮肤水分含量的改善效果',
      file_url: '#',
      file_size: 0,
      file_type: 'pdf',
      status: 'approved',
      create_time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      update_time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      parsed_data: {
        project_info: {
          project_name: '保湿面霜功效评价研究',
          sponsor: '客户C',
          priority: 'low',
          expected_start_date: '2025-04-01',
          expected_end_date: '2025-08-01',
        },
        sample_plan: {
          total_samples: 45,
        },
        visit_plan: [
          {
            visitCode: 'V1',
            visitName: '筛选访视',
            dayOffset: 0,
            allowedWindowDeviation: '±0天',
            equipments: [{ equipmentName: 'Corneometer皮肤水分测试仪' }],
            evaluators: [{ evaluationType: '临床评估' }],
          },
        ],
      },
      visit_plan_generated: true,
    },
    {
      id: 4,
      project_id: 4,
      name: '防晒产品SPF/PA值测定研究方案',
      code: 'PRJ-2025-004',
      description: '按照国家标准进行防晒产品SPF和PA值的人体测试',
      file_url: '#',
      file_size: 0,
      file_type: 'pdf',
      status: 'approved',
      create_time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      update_time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      parsed_data: {
        project_info: {
          project_name: '防晒产品SPF/PA值测定研究',
          sponsor: '客户D',
          priority: 'high',
          expected_start_date: '2025-02-15',
          expected_end_date: '2025-05-15',
        },
        sample_plan: {
          total_samples: 75,
        },
        visit_plan: [
          {
            visitCode: 'V1',
            visitName: '筛选访视',
            dayOffset: 0,
            allowedWindowDeviation: '±0天',
            equipments: [{ equipmentName: 'VISIA皮肤检测仪' }],
            evaluators: [{ evaluationType: '临床评估' }],
          },
          {
            visitCode: 'V2',
            visitName: '基线访视',
            dayOffset: 7,
            allowedWindowDeviation: '±2天',
            equipments: [{ equipmentName: 'Corneometer皮肤水分测试仪' }],
            evaluators: [{ evaluationType: '临床评估' }],
          },
        ],
      },
      visit_plan_generated: true,
    },
  ];

  // 合并现有数据，避免重复
  const protocolMap = new Map(existingProtocols.map((p: any) => [p.id, p]));
  mockProtocols.forEach(protocol => {
    if (!protocolMap.has(protocol.id)) {
      protocolMap.set(protocol.id, protocol);
    }
  });

  localStorage.setItem('mock_protocols', JSON.stringify(Array.from(protocolMap.values())));
  console.log('✅ 已初始化项目协议数据');
}

/**
 * 初始化排程项目数据
 */
function initSchedulerProjects() {
  const existingProjects = JSON.parse(localStorage.getItem('mock_scheduler_projects') || '[]');
  
  const now = new Date();
  const mockProjects = [
    // 项目1: 待研究员确认
    {
      projectId: 1,
      projectCode: 'PRJ-2025-001',
      projectName: '抗衰老精华液功效评价研究',
      clientName: '客户A',
      priority: 'high' as const,
      totalSamples: 90,
      expectedStartDate: '2025-03-01',
      expectedEndDate: '2025-06-30',
      status: 'pending_researcher_confirmation' as const,
      protocolId: 1,
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
        {
          visitId: 3,
          visitCode: 'V3',
          visitName: '第4周访视',
          dayOffset: 28,
          windowDays: 3,
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
      ],
      approvalRecords: [
        {
          id: 'ar-1-1',
          seq: 1,
          nodeName: '访视计划提交',
          operator: '研究员',
          operatorId: 'researcher-001',
          operateDate: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          action: '提交',
          comment: '方案已提交，等待排程审核',
        },
        {
          id: 'ar-1-2',
          seq: 2,
          nodeName: '资源审核',
          operator: '排程专员',
          operatorId: 'scheduler-001',
          operateDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          action: '通过',
          comment: '资源审核通过，资源全部可用',
        },
        {
          id: 'ar-1-3',
          seq: 3,
          nodeName: '排程方案确认',
          operator: '排程专员',
          operatorId: 'scheduler-001',
          operateDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          action: '确认',
          comment: '已确认并保存排程方案',
          metadata: {
            selectedPlanId: 'plan-1',
            schedulePlanCount: 3,
          },
        },
      ],
      updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // 项目2: 待排程
    {
      projectId: 2,
      projectCode: 'PRJ-2025-002',
      projectName: '美白精华液功效评价研究',
      clientName: '客户B',
      priority: 'medium' as const,
      totalSamples: 60,
      expectedStartDate: '2025-03-15',
      expectedEndDate: '2025-07-15',
      status: 'pending_schedule' as const,
      protocolId: 2,
      visits: [
        {
          visitId: 4,
          visitCode: 'V1',
          visitName: '筛选访视',
          dayOffset: 0,
          windowDays: 0,
          equipments: [
            {
              equipmentId: 'eq-1',
              equipmentName: 'VISIA皮肤检测仪',
              sampleCount: 60,
              timePerSample: 5,
            },
          ],
          evaluators: [
            {
              evaluationType: '临床评估',
              sampleCount: 60,
              timePerSample: 10,
            },
          ],
        },
        {
          visitId: 5,
          visitCode: 'V2',
          visitName: '基线访视',
          dayOffset: 7,
          windowDays: 2,
          equipments: [
            {
              equipmentId: 'eq-3',
              equipmentName: 'Mexameter皮肤色度测试仪',
              sampleCount: 60,
              timePerSample: 5,
            },
          ],
          evaluators: [
            {
              evaluationType: '临床评估',
              sampleCount: 60,
              timePerSample: 10,
            },
          ],
        },
      ],
      approvalRecords: [
        {
          id: 'ar-2-1',
          seq: 1,
          nodeName: '访视计划提交',
          operator: '研究员',
          operatorId: 'researcher-001',
          operateDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          action: '提交',
          comment: '方案已提交，等待排程审核',
        },
        {
          id: 'ar-2-2',
          seq: 2,
          nodeName: '资源审核',
          operator: '排程专员',
          operatorId: 'scheduler-001',
          operateDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          action: '通过',
          comment: '资源审核通过，资源全部可用',
        },
      ],
      updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // 项目3: 待审核
    {
      projectId: 3,
      projectCode: 'PRJ-2025-003',
      projectName: '保湿面霜功效评价研究',
      clientName: '客户C',
      priority: 'low' as const,
      totalSamples: 45,
      expectedStartDate: '2025-04-01',
      expectedEndDate: '2025-08-01',
      status: 'pending_review' as const,
      protocolId: 3,
      visits: [
        {
          visitId: 6,
          visitCode: 'V1',
          visitName: '筛选访视',
          dayOffset: 0,
          windowDays: 0,
          equipments: [
            {
              equipmentId: 'eq-2',
              equipmentName: 'Corneometer皮肤水分测试仪',
              sampleCount: 45,
              timePerSample: 5,
            },
          ],
          evaluators: [
            {
              evaluationType: '临床评估',
              sampleCount: 45,
              timePerSample: 10,
            },
          ],
        },
      ],
      approvalRecords: [
        {
          id: 'ar-3-1',
          seq: 1,
          nodeName: '访视计划提交',
          operator: '研究员',
          operatorId: 'researcher-001',
          operateDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          action: '提交',
          comment: '方案已提交，等待排程审核',
        },
      ],
      updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // 项目4: 待发布工单
    {
      projectId: 4,
      projectCode: 'PRJ-2025-004',
      projectName: '防晒产品SPF/PA值测定研究',
      clientName: '客户D',
      priority: 'high' as const,
      totalSamples: 75,
      expectedStartDate: '2025-02-15',
      expectedEndDate: '2025-05-15',
      status: 'researcher_confirmed' as const,
      protocolId: 4,
      visits: [
        {
          visitId: 7,
          visitCode: 'V1',
          visitName: '筛选访视',
          dayOffset: 0,
          windowDays: 0,
          equipments: [
            {
              equipmentId: 'eq-1',
              equipmentName: 'VISIA皮肤检测仪',
              sampleCount: 75,
              timePerSample: 5,
            },
          ],
          evaluators: [
            {
              evaluationType: '临床评估',
              sampleCount: 75,
              timePerSample: 10,
            },
          ],
        },
        {
          visitId: 8,
          visitCode: 'V2',
          visitName: '基线访视',
          dayOffset: 7,
          windowDays: 2,
          equipments: [
            {
              equipmentId: 'eq-2',
              equipmentName: 'Corneometer皮肤水分测试仪',
              sampleCount: 75,
              timePerSample: 5,
            },
          ],
          evaluators: [
            {
              evaluationType: '临床评估',
              sampleCount: 75,
              timePerSample: 10,
            },
          ],
        },
      ],
      approvalRecords: [
        {
          id: 'ar-4-1',
          seq: 1,
          nodeName: '访视计划提交',
          operator: '研究员',
          operatorId: 'researcher-001',
          operateDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          action: '提交',
          comment: '方案已提交，等待排程审核',
        },
        {
          id: 'ar-4-2',
          seq: 2,
          nodeName: '资源审核',
          operator: '排程专员',
          operatorId: 'scheduler-001',
          operateDate: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          action: '通过',
          comment: '资源审核通过，资源全部可用',
        },
        {
          id: 'ar-4-3',
          seq: 3,
          nodeName: '排程方案确认',
          operator: '排程专员',
          operatorId: 'scheduler-001',
          operateDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          action: '确认',
          comment: '已确认并保存排程方案',
          metadata: {
            selectedPlanId: 'plan-4',
            schedulePlanCount: 2,
          },
        },
        {
          id: 'ar-4-4',
          seq: 4,
          nodeName: '研究员确认',
          operator: '研究员',
          operatorId: 'researcher-001',
          operateDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          action: '确认',
          comment: '排程方案已确认，符合研究方案要求',
        },
      ],
      updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // 合并现有数据，避免重复
  const projectMap = new Map(existingProjects.map((p: any) => [p.projectId, p]));
  mockProjects.forEach(project => {
    if (!projectMap.has(project.projectId)) {
      projectMap.set(project.projectId, project);
    }
  });

  localStorage.setItem('mock_scheduler_projects', JSON.stringify(Array.from(projectMap.values())));
  console.log('✅ 已初始化排程项目数据');
}

/**
 * 初始化已保存的排程方案
 */
function initSavedSchedules() {
  const STORAGE_KEY = 'scheduler_new_saved_schedules_v1';
  const existingData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"version":1,"items":[]}');
  const existingSchedulesMap = new Map<number, any>();
  
  // 将现有数据转换为Map
  if (existingData.version === 1 && Array.isArray(existingData.items)) {
    existingData.items.forEach((item: any) => {
      if (item && typeof item.projectId === 'number') {
        existingSchedulesMap.set(item.projectId, item);
      }
    });
  }
  
  const now = new Date();
  const startDate1 = '2025-03-05';
  const startDate4 = '2025-02-20';

  const newSchedules: any[] = [
    // 项目1的排程方案
    {
      projectId: 1,
      planId: 'plan-1',
      savedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      visitSchedules: [
        {
          visitCode: 'V1',
          visitName: '筛选访视',
          dailySchedules: [
            {
              date: startDate1,
              splitDay: 1,
              equipmentAssignments: [
                {
                  equipmentName: 'VISIA皮肤检测仪',
                  technicianName: '李技师',
                  roomName: '测试室A',
                  sampleCount: 45,
                },
                {
                  equipmentName: 'VISIA皮肤检测仪',
                  technicianName: '王技师',
                  roomName: '测试室B',
                  sampleCount: 45,
                },
              ],
              evaluatorAssignments: [
                {
                  evaluatorName: '张评估师',
                  evaluationType: '临床评估',
                  roomName: '测试室A',
                  sampleCount: 45,
                },
                {
                  evaluatorName: '李评估师',
                  evaluationType: '临床评估',
                  roomName: '测试室B',
                  sampleCount: 45,
                },
              ],
            },
          ],
          splitDays: 1,
        },
        {
          visitCode: 'V2',
          visitName: '基线访视',
          dailySchedules: [
            {
              date: format(addDays(new Date(startDate1), 7), 'yyyy-MM-dd'),
              splitDay: 1,
              equipmentAssignments: [
                {
                  equipmentName: 'Corneometer皮肤水分测试仪',
                  technicianName: '李技师',
                  roomName: '测试室A',
                  sampleCount: 90,
                },
              ],
              evaluatorAssignments: [
                {
                  evaluatorName: '张评估师',
                  evaluationType: '临床评估',
                  roomName: '测试室A',
                  sampleCount: 90,
                },
              ],
            },
          ],
          splitDays: 1,
        },
        {
          visitCode: 'V3',
          visitName: '第4周访视',
          dailySchedules: [
            {
              date: format(addDays(new Date(startDate1), 28), 'yyyy-MM-dd'),
              splitDay: 1,
              equipmentAssignments: [
                {
                  equipmentName: 'VISIA皮肤检测仪',
                  technicianName: '李技师',
                  roomName: '测试室A',
                  sampleCount: 90,
                },
              ],
              evaluatorAssignments: [
                {
                  evaluatorName: '张评估师',
                  evaluationType: '临床评估',
                  roomName: '测试室A',
                  sampleCount: 90,
                },
              ],
            },
          ],
          splitDays: 1,
        },
      ],
      resolvedConflicts: [],
      workOrders: undefined,
      workOrdersPublishedAt: undefined,
    },
    // 项目4的排程方案
    {
      projectId: 4,
      planId: 'plan-4',
      savedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      visitSchedules: [
        {
          visitCode: 'V1',
          visitName: '筛选访视',
          dailySchedules: [
            {
              date: startDate4,
              splitDay: 1,
              equipmentAssignments: [
                {
                  equipmentName: 'VISIA皮肤检测仪',
                  technicianName: '李技师',
                  roomName: '测试室A',
                  sampleCount: 75,
                },
              ],
              evaluatorAssignments: [
                {
                  evaluatorName: '张评估师',
                  evaluationType: '临床评估',
                  roomName: '测试室A',
                  sampleCount: 75,
                },
              ],
            },
          ],
          splitDays: 1,
        },
        {
          visitCode: 'V2',
          visitName: '基线访视',
          dailySchedules: [
            {
              date: format(addDays(new Date(startDate4), 7), 'yyyy-MM-dd'),
              splitDay: 1,
              equipmentAssignments: [
                {
                  equipmentName: 'Corneometer皮肤水分测试仪',
                  technicianName: '李技师',
                  roomName: '测试室A',
                  sampleCount: 75,
                },
              ],
              evaluatorAssignments: [
                {
                  evaluatorName: '张评估师',
                  evaluationType: '临床评估',
                  roomName: '测试室A',
                  sampleCount: 75,
                },
              ],
            },
          ],
          splitDays: 1,
        },
      ],
      resolvedConflicts: [],
      workOrders: undefined,
      workOrdersPublishedAt: undefined,
    },
  ];

  // 合并现有数据，避免重复
  newSchedules.forEach(schedule => {
    if (!existingSchedulesMap.has(schedule.projectId)) {
      existingSchedulesMap.set(schedule.projectId, schedule);
    }
  });

  // 转换为组件期望的格式
  const finalData = {
    version: 1,
    items: Array.from(existingSchedulesMap.values()),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(finalData));
  console.log('✅ 已初始化已保存的排程方案');
  console.log(`   已保存 ${finalData.items.length} 个项目的排程方案`);
  console.log(`   项目ID列表: [${finalData.items.map((item: any) => item.projectId).join(', ')}]`);
  console.log(`   存储Key: ${STORAGE_KEY}`);
  
  // 验证数据是否正确保存
  const verifyData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  console.log(`   验证数据: version=${verifyData.version}, items数量=${verifyData.items?.length || 0}`);
}

/**
 * 初始化研究员确认待办（确保待研究员确认的项目出现在我的待办中）
 */
function initResearcherConfirmations() {
  // 这个功能已经在 initMockScheduleConfirmation 中实现
  // 这里只是确保数据存在
  const existingProjects = JSON.parse(localStorage.getItem('mock_scheduler_projects') || '[]');
  const pendingConfirmationProjects = existingProjects.filter(
    (p: any) => p.status === 'pending_researcher_confirmation'
  );
  
  if (pendingConfirmationProjects.length > 0) {
    console.log('✅ 研究员确认待办数据已存在');
    console.log(`   待确认项目数量: ${pendingConfirmationProjects.length}`);
  } else {
    console.log('⚠️  未找到待研究员确认的项目');
  }
}

/**
 * 在浏览器控制台执行此函数来初始化完整工作流数据
 */
if (typeof window !== 'undefined') {
  (window as any).initCompleteWorkflowMock = initCompleteWorkflowMock;
}
