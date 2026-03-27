export const RECRUITER_USER = {
  open_id: 'ou_test_recruiter_001',
  name: '李招募',
  avatar: '',
  email: 'li.zhaomu@cnkis.test',
}

export const AUTH_TOKEN = 'mock-e2e-token-recruiter-001'

export const authProfileData = {
  id: 1,
  username: 'recruiter_li',
  display_name: '李招募',
  email: 'li.zhaomu@cnkis.test',
  avatar: '',
  account_type: 'recruiter',
  roles: [
    { name: 'recruiter', display_name: '招募专员', level: 3, category: 'clinical' },
  ],
  permissions: [
    'subject.recruitment.read',
    'subject.recruitment.create',
    'subject.recruitment.update',
    'subject.subject.read',
    'subject.subject.update',
  ],
  data_scope: 'self',
  visible_workbenches: ['recruitment'],
  visible_menu_items: {
    recruitment: [
      'dashboard', 'plans', 'registrations', 'screening',
      'enrollment', 'subjects', 'checkin', 'compliance',
      'payments', 'support', 'questionnaires', 'loyalty',
      'channel-analytics',
    ],
  },
}

export const authProfileResponse = { code: 0, msg: 'ok', data: authProfileData }

const planExtra = {
  protocol_code: 'MOCK-P',
  project_code: 'MOCK-P',
  display_project_code: 'MOCK-P',
  sample_requirement: '',
  wei_visit_point: '',
  wei_visit_date: null,
  researcher_name: '',
  supervisor_name: '',
  recruit_start_date: null,
  recruit_end_date: null,
  planned_appointment_count: 0,
  actual_appointment_count: 0,
  appointment_completion_rate: 60,
  recruit_specialist_names: [] as string[],
  channel_recruitment_needed: false,
  material_prep_status: 'draft',
}

export const plans = [
  {
    id: 1,
    plan_no: 'RP-2026-001',
    title: '保湿功效评价招募',
    protocol_id: 1,
    target_count: 40,
    registered_count: 35,
    screened_count: 28,
    enrolled_count: 22,
    completion_rate: 55,
    status: 'active',
    start_date: '2026-01-15',
    end_date: '2026-06-30',
    description: '40名受试者保湿功效评价',
    create_time: '2026-01-10T10:00:00',
    update_time: '2026-02-18T10:00:00',
    ...planExtra,
    project_code: 'RP-2026-001',
    display_project_code: 'RP-2026-001',
  },
  {
    id: 2,
    plan_no: 'RP-2026-002',
    title: '抗衰老功效评价招募',
    protocol_id: 2,
    target_count: 30,
    registered_count: 18,
    screened_count: 12,
    enrolled_count: 8,
    completion_rate: 27,
    status: 'active',
    start_date: '2026-02-01',
    end_date: '2026-08-31',
    description: '30名受试者抗衰老功效评价',
    create_time: '2026-01-25T10:00:00',
    update_time: '2026-02-18T10:00:00',
    ...planExtra,
    project_code: 'RP-2026-002',
    display_project_code: 'RP-2026-002',
  },
  {
    id: 3,
    plan_no: 'RP-2026-003',
    title: '美白功效评价招募',
    protocol_id: 3,
    target_count: 25,
    registered_count: 10,
    screened_count: 5,
    enrolled_count: 3,
    completion_rate: 12,
    status: 'draft',
    start_date: '2026-03-01',
    end_date: '2026-09-30',
    description: '25名受试者美白功效评价',
    create_time: '2026-02-10T10:00:00',
    update_time: '2026-02-18T10:00:00',
    ...planExtra,
    project_code: 'RP-2026-003',
    display_project_code: 'RP-2026-003',
  },
]

export const registrations = [
  {
    id: 101, registration_no: 'REG-2026-0001', name: '张三', phone: '13800138001',
    gender: 'male', age: 28, status: 'registered', plan_id: 1,
    create_time: '2026-02-15T09:00:00', contacted_at: null, contact_notes: null,
    next_contact_date: null, withdrawal_reason: null,
  },
  {
    id: 102, registration_no: 'REG-2026-0002', name: '王芳', phone: '13800138002',
    gender: 'female', age: 35, status: 'contacted', plan_id: 1,
    create_time: '2026-02-14T14:00:00', contacted_at: '2026-02-15T10:00:00',
    contact_notes: '有意向，约本周五筛选', next_contact_date: '2026-02-20',
    withdrawal_reason: null,
  },
  {
    id: 103, registration_no: 'REG-2026-0003', name: '李四', phone: '13800138003',
    gender: 'male', age: 42, status: 'screening', plan_id: 1,
    create_time: '2026-02-13T11:00:00', contacted_at: '2026-02-14T09:00:00',
    contact_notes: '已确认筛选', next_contact_date: null, withdrawal_reason: null,
  },
  {
    id: 104, registration_no: 'REG-2026-0004', name: '赵敏', phone: '13800138004',
    gender: 'female', age: 30, status: 'enrolled', plan_id: 1,
    create_time: '2026-02-10T10:00:00', contacted_at: '2026-02-11T09:00:00',
    contact_notes: '已入组', next_contact_date: null, withdrawal_reason: null,
  },
  {
    id: 105, registration_no: 'REG-2026-0005', name: '刘洋', phone: '13800138005',
    gender: 'male', age: 25, status: 'withdrawn', plan_id: 2,
    create_time: '2026-02-08T09:00:00', contacted_at: '2026-02-09T10:00:00',
    contact_notes: '个人原因退出', next_contact_date: null,
    withdrawal_reason: '个人时间安排冲突',
  },
]

export const myTasks = {
  pending_contact: {
    count: 3,
    items: [
      { id: 101, registration_no: 'REG-2026-0001', name: '张三', phone: '13800138001', status: 'registered', create_time: '2026-02-15T09:00:00', contacted_at: null },
      { id: 106, registration_no: 'REG-2026-0006', name: '陈明', phone: '13800138006', status: 'registered', create_time: '2026-02-16T09:00:00', contacted_at: null },
      { id: 107, registration_no: 'REG-2026-0007', name: '周静', phone: '13800138007', status: 'registered', create_time: '2026-02-17T10:00:00', contacted_at: null },
    ],
  },
  pending_screening: {
    count: 2,
    items: [
      { id: 103, registration_no: 'REG-2026-0003', name: '李四', phone: '13800138003', status: 'screening', create_time: '2026-02-13T11:00:00', contacted_at: '2026-02-14T09:00:00' },
    ],
  },
  pending_enrollment: {
    count: 1,
    items: [
      { id: 108, registration_no: 'REG-2026-0008', name: '吴丽', phone: '13800138008', status: 'screened_pass', create_time: '2026-02-12T10:00:00', contacted_at: '2026-02-13T09:00:00' },
    ],
  },
  need_callback: {
    count: 1,
    items: [
      { id: 102, registration_no: 'REG-2026-0002', name: '王芳', phone: '13800138002', status: 'contacted', create_time: '2026-02-14T14:00:00', contacted_at: '2026-02-15T10:00:00' },
    ],
  },
  overdue_followup: { count: 0, items: [] },
}

export const contactRecords = [
  {
    id: 1, contact_type: 'phone', content: '首次电话联系，介绍试验基本情况',
    result: 'interested', contact_date: '2026-02-15T10:30:00',
    next_contact_date: '2026-02-20', next_contact_plan: '确认筛选时间',
  },
  {
    id: 2, contact_type: 'wechat', content: '微信发送知情同意书预览',
    result: 'scheduled', contact_date: '2026-02-16T14:00:00',
    next_contact_date: null, next_contact_plan: '',
  },
]

export const subjects = [
  { id: 1, subject_no: 'S-001', name: '赵敏', gender: 'female', age: 30, status: 'active', risk_level: 'low', create_time: '2026-02-10T10:00:00' },
  { id: 2, subject_no: 'S-002', name: '陈明', gender: 'male', age: 42, status: 'active', risk_level: 'medium', create_time: '2026-02-12T10:00:00' },
  { id: 3, subject_no: 'S-003', name: '王芳', gender: 'female', age: 35, status: 'withdrawn', risk_level: 'low', create_time: '2026-02-08T10:00:00' },
]
