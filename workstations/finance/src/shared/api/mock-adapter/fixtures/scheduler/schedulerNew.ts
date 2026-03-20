export interface SchedulerNewSeedVisitSchedule {
  visitCode: string;
  visitName: string;
  splitDays: number;
  dailySchedules: Array<{
    date: string;
    splitDay: number;
    sampleCount: number;
    equipmentAssignments: Array<{
      equipmentName: string;
      technicianName: string;
      roomName: string;
      sampleCount: number;
      timeSlot: string;
    }>;
    evaluatorAssignments: Array<{
      evaluatorName: string;
      evaluationType: string;
      roomName: string;
      sampleCount: number;
      timeSlot: string;
    }>;
  }>;
}

export const SCHEDULER_NEW_SEED_PROJECT_1003 = {
  projectId: 1003,
  projectCode: 'PRJ-2026-003',
  projectName: 'SK-II神仙水保湿测试',
  priority: 'high' as const,
  planId: 'plan-saved-1003',
  savedAt: '2026-01-15T10:30:00.000Z',
  publishedAt: '2026-01-15T10:40:00.000Z',
};

export const SCHEDULER_NEW_SEED_VISIT_SCHEDULES_1003: SchedulerNewSeedVisitSchedule[] = [
  {
    visitCode: 'T0',
    visitName: '基线访视',
    splitDays: 2,
    dailySchedules: [
      {
        date: '2026-01-25',
        splitDay: 1,
        sampleCount: 40,
        equipmentAssignments: [
          {
            equipmentName: 'Corneometer水分测试仪',
            technicianName: '王技术员',
            roomName: '功效测试室A',
            sampleCount: 40,
            timeSlot: '09:00-12:00',
          },
        ],
        evaluatorAssignments: [
          {
            evaluatorName: '王评估师',
            evaluationType: '皮肤水分评估',
            roomName: '临床评估室',
            sampleCount: 40,
            timeSlot: '14:00-17:00',
          },
        ],
      },
      {
        date: '2026-01-26',
        splitDay: 2,
        sampleCount: 40,
        equipmentAssignments: [
          {
            equipmentName: 'Corneometer水分测试仪',
            technicianName: '刘技术员',
            roomName: '功效测试室A',
            sampleCount: 40,
            timeSlot: '09:00-12:00',
          },
        ],
        evaluatorAssignments: [
          {
            evaluatorName: '王评估师',
            evaluationType: '皮肤水分评估',
            roomName: '临床评估室',
            sampleCount: 40,
            timeSlot: '14:00-17:00',
          },
        ],
      },
    ],
  },
  {
    visitCode: 'T1wk',
    visitName: '1周后',
    splitDays: 2,
    dailySchedules: [
      {
        date: '2026-02-01',
        splitDay: 1,
        sampleCount: 40,
        equipmentAssignments: [
          {
            equipmentName: 'Corneometer水分测试仪',
            technicianName: '王技术员',
            roomName: '功效测试室A',
            sampleCount: 40,
            timeSlot: '09:00-11:00',
          },
        ],
        evaluatorAssignments: [],
      },
      {
        date: '2026-02-02',
        splitDay: 2,
        sampleCount: 40,
        equipmentAssignments: [
          {
            equipmentName: 'Corneometer水分测试仪',
            technicianName: '刘技术员',
            roomName: '功效测试室A',
            sampleCount: 40,
            timeSlot: '09:00-11:00',
          },
        ],
        evaluatorAssignments: [],
      },
    ],
  },
  {
    visitCode: 'T2wk',
    visitName: '2周后结束',
    splitDays: 2,
    dailySchedules: [
      {
        date: '2026-02-08',
        splitDay: 1,
        sampleCount: 40,
        equipmentAssignments: [
          {
            equipmentName: 'Corneometer水分测试仪',
            technicianName: '王技术员',
            roomName: '功效测试室A',
            sampleCount: 40,
            timeSlot: '09:00-12:00',
          },
        ],
        evaluatorAssignments: [
          {
            evaluatorName: '王评估师',
            evaluationType: '保湿功效评估',
            roomName: '临床评估室',
            sampleCount: 40,
            timeSlot: '14:00-17:00',
          },
        ],
      },
      {
        date: '2026-02-09',
        splitDay: 2,
        sampleCount: 40,
        equipmentAssignments: [
          {
            equipmentName: 'Corneometer水分测试仪',
            technicianName: '刘技术员',
            roomName: '功效测试室A',
            sampleCount: 40,
            timeSlot: '09:00-12:00',
          },
        ],
        evaluatorAssignments: [
          {
            evaluatorName: '王评估师',
            evaluationType: '保湿功效评估',
            roomName: '临床评估室',
            sampleCount: 40,
            timeSlot: '14:00-17:00',
          },
        ],
      },
    ],
  },
];

