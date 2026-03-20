/**
 * 初始化工单任务 Mock 数据
 * 用于测试工单任务功能
 */
import type { WorkOrder } from "@/entities/work-order/domain";
import { workOrdersApi } from "@/features/work-order/api/workOrdersApi";
import { format, addDays, subDays } from 'date-fns';

// 生成mock工单数据
function generateMockWorkOrders(): WorkOrder[] {
  const today = new Date();
  const workOrders: WorkOrder[] = [];
  let sequence = 1;

  // 项目列表
  const projects = [
    { id: 'PRJ-2025-001', name: '抗衰老精华液功效评价研究', technician: '李技师', technicianId: 'TECH-001' },
    { id: 'PRJ-2025-002', name: '美白精华临床验证', technician: '李技师', technicianId: 'TECH-001' },
    { id: 'PRJ-2025-003', name: '保湿面霜功效测试', technician: '李技师', technicianId: 'TECH-001' },
  ];

  // 设备列表
  const equipments = [
    'VISIA皮肤检测仪',
    'Cutometer弹性测试仪',
    'Mexameter黑色素测试仪',
    'Corneometer水分测试仪',
    'Tewameter水分流失测试仪',
  ];

  // 房间列表
  const rooms = [
    '功效测试室A',
    '功效测试室B',
    '临床评估室',
    '暗室',
    '恒温恒湿室',
  ];

  // 访视点列表
  const visits = [
    { code: 'T0', name: '基线访视' },
    { code: 'T2d', name: '2天后随访' },
    { code: 'T1wk', name: '1周后复查' },
    { code: 'T4wk', name: '4周后结束' },
  ];

  // 为每个项目生成工单
  projects.forEach((project, projectIdx) => {
    visits.forEach((visit, visitIdx) => {
      // 每个访视点生成2-3个工单（不同设备）
      const numOrders = 2 + (visitIdx % 2);
      
      for (let i = 0; i < numOrders; i++) {
        const equipment = equipments[(projectIdx * 2 + visitIdx + i) % equipments.length];
        const room = rooms[(projectIdx + visitIdx + i) % rooms.length];
        const sampleCount = 30 + (i * 10); // 30, 40, 50等
        const scheduledDate = format(addDays(today, visitIdx * 7 + i), 'yyyy-MM-dd');
        const scheduledTime = `${9 + i}:00-${10 + i}:00`;
        
        // 根据索引决定状态和完成量
        const statusIndex = (projectIdx * 4 + visitIdx * 2 + i) % 7;
        let status: WorkOrder['status'];
        let completedCount: number;
        let qualityReviewNote: string | undefined;
        
        switch (statusIndex) {
          case 0:
            status = 'pending';
            completedCount = 0;
            break;
          case 1:
            status = 'in_progress';
            completedCount = Math.floor(sampleCount * 0.3);
            break;
          case 2:
            status = 'in_progress';
            completedCount = Math.floor(sampleCount * 0.7);
            break;
          case 3:
            status = 'completed';
            completedCount = sampleCount;
            break;
          case 4:
            status = 'quality_review';
            completedCount = sampleCount;
            break;
          case 5:
            status = 'approved';
            completedCount = sampleCount;
            qualityReviewNote = '质量审核通过';
            break;
          case 6:
            status = 'pending';
            completedCount = 0;
            break;
          default:
            status = 'pending';
            completedCount = 0;
        }

        const workOrderNo = `WO-${project.id.replace('PRJ-', '')}-${String(sequence).padStart(3, '0')}`;
        const id = `WO-${project.id}-${visit.code}-${scheduledDate}-${equipment.replace(/\s+/g, '-')}`;
        const createdAt = format(subDays(new Date(scheduledDate), 3), "yyyy-MM-dd'T'HH:mm:ss");
        const updatedAt = status === 'pending' 
          ? createdAt 
          : format(addDays(new Date(scheduledDate), statusIndex % 2), "yyyy-MM-dd'T'HH:mm:ss");

        workOrders.push({
          id,
          workOrderNo,
          projectId: project.id,
          projectName: project.name,
          visitNode: visit.code,
          visitName: visit.name,
          subjectId: `BATCH-${sampleCount}`,
          subjectName: `批次任务(${sampleCount}人)`,
          subjectCode: `BATCH-${sampleCount}`,
          testItem: {
            id: `TI-${equipment.replace(/\s+/g, '-')}`,
            name: equipment,
            category: '仪器检测',
            equipment: equipment,
            duration: 30 + (i * 10),
            sop: `SOP-${equipment}-V1.0`,
          },
          assignedTo: project.technician,
          assignedToId: project.technicianId,
          equipment: equipment,
          equipmentId: `EQ-${equipment.replace(/\s+/g, '-')}`,
          venue: room,
          venueId: `ROOM-${room.replace(/\s+/g, '-')}`,
          scheduledDate,
          scheduledTime,
          subjectCount: sampleCount,
          completedCount,
          status,
          priority: i === 0 ? 'high' : i === 1 ? 'medium' : 'low',
          dataEntered: status === 'completed' || status === 'approved',
          sourceScheduleId: `SCHEDULE-${project.id}`,
          createdFrom: 'schedule',
          createdAt,
          updatedAt,
          qualityReviewNote,
        });

        sequence++;
      }
    });
  });

  return workOrders;
}

/**
 * 初始化工单任务Mock数据
 * 注意：此函数会检查 localStorage，如果已有数据则跳过初始化
 * 这样可以确保不会覆盖已发布的工单数据
 */
export function initMockWorkOrders() {
  try {
    // 检查是否已有数据
    const existing = localStorage.getItem('scheduler_new_work_orders_v1');
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        // 如果数据存在且有效，跳过初始化，保留现有数据（包括已发布的工单）
        if (parsed && parsed.workOrders && Array.isArray(parsed.workOrders) && parsed.workOrders.length > 0) {
          return;
        }
      } catch {
        // 如果解析失败，继续初始化
      }
    }

    // 只有在数据为空或无效时才生成新的mock数据
    // 使用 upsertMany 确保不会覆盖已有数据（虽然这里应该是空数据）
    const mockWorkOrders = generateMockWorkOrders();
    
    // 使用API保存数据（upsertMany 会合并数据，不会覆盖）
    workOrdersApi.upsertMany(mockWorkOrders);
    
    return mockWorkOrders;
  } catch (error) {
    return null;
  }
}

// 在浏览器环境中，将函数挂载到window对象，方便调试
if (typeof window !== 'undefined') {
  (window as any).initMockWorkOrders = initMockWorkOrders;
}
