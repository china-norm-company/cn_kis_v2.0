export const PAGE_COPY = {
  index: {
    loginTip: '登录后可查看报名、筛选、入组、访视与结项全流程信息',
  },
  queue: {
    emptyQueue: '暂未进入今日排队队列',
    emptyDescription: '完成签到后将展示排位与预计等待时间。',
  },
  projects: {
    loading: {
      title: '正在加载可报名项目',
      description: '请稍候，系统正在同步当前开放的招募计划。',
      icon: '⏳',
    },
    empty: {
      title: '当前暂无开放招募',
      description: '项目会在“了解项目/线上报名”阶段开放，建议稍后刷新或关注通知。',
      icon: '🧪',
      actionText: '刷新项目列表',
    },
  },
  results: {
    empty: {
      title: '暂无检测结果',
      description: '在“现场测试/检测”阶段完成 CRF 后，结果会自动同步到此处。',
      icon: '🔬',
    },
  },
  compliance: {
    empty: {
      title: '暂无依从性评估记录',
      description: '完成签到、访视与问卷后，系统会在“项目执行”阶段生成依从性评分。',
      icon: '📈',
    },
  },
  referral: {
    empty: {
      title: '暂无转介绍记录',
      description: '当被推荐人完成“入组”后，会在“转介绍”阶段显示记录与奖励。',
      icon: '🤝',
    },
  },
  myqrcode: {
    loading: {
      title: '正在生成二维码',
      description: '请稍候，正在创建您的身份识别码。',
      icon: '⏳',
    },
    empty: {
      title: '暂无二维码',
      actionText: '去查看可报名项目',
      icon: '🔲',
    },
    noSubjectDescription: '未关联受试者身份，请先完成报名、筛选和入组流程。',
    loadFailDescription: '二维码暂时不可用，请稍后重试或联系研究协调员。',
    defaultDescription: '请先完成入组后再到此页展示签到二维码。',
  },
  technician: {
    empty: {
      title: '今日暂无分配的工单',
      description: '您可先执行扫码，系统会自动识别受试者并拉取今日工单。',
      icon: '🧑‍🔬',
      actionText: '扫码执行',
    },
  },
  screeningStatus: {
    empty: {
      title: '暂无报名记录',
      description: '先完成项目报名，系统会自动展示粗筛、正式筛选和入组进度。',
      icon: '🧬',
      actionText: '去发现项目',
    },
  },
  profile: {
    guest: {
      title: '当前未登录',
      description: '登录后可查看访视、问卷、礼金、样品签收等全流程信息。',
      icon: '🔐',
      actionText: '去首页登录',
    },
  },
  visit: {
    timelineEmpty: {
      title: '暂无访视安排',
      description: '完成入组后会自动生成访视时间线。',
      icon: '🧭',
      actionText: '去项目发现',
    },
    upcomingEmpty: {
      title: '近期暂无预约',
      description: '可主动预约下一次到访，避免超窗影响依从性评分。',
      icon: '📆',
      actionText: '预约新访视',
    },
    scheduleEmpty: {
      title: '暂无排程数据',
      description: '排程确认后将显示检测活动与执行时间。',
      icon: '🗂️',
    },
  },
  diary: {
    empty: {
      title: '暂无日记记录',
      description: '建议从今天开始记录症状、感受和用药情况。',
      icon: '📔',
      actionText: '填写今日日记',
    },
  },
  questionnaire: {
    empty: {
      title: '暂无可填写的问卷',
      description: '问卷会在对应访视节点自动下发，请关注通知中心。',
      icon: '📝',
    },
  },
  notifications: {
    loading: {
      title: '正在加载通知',
      description: '请稍候，正在同步研究团队通知。',
      icon: '⏳',
    },
    empty: {
      title: '暂无通知',
      description: '后续访视提醒、问卷催办和结果通知会在这里展示。',
      icon: '🔔',
    },
  },
  payment: {
    loading: {
      title: '正在加载礼金记录',
      description: '请稍候，正在同步您的补偿发放信息。',
      icon: '⏳',
    },
    empty: {
      title: '暂无礼金记录',
      description: '完成访视、问卷或阶段任务后将自动生成礼金记录。',
      icon: '💰',
    },
  },
  appointment: {
    loading: {
      title: '正在加载预约信息',
      description: '请稍候，正在同步您的访视安排。',
      icon: '⏳',
    },
    empty: {
      title: '暂无预约记录',
      description: '建议尽早预约下一次访视，避免超出窗口期。',
      icon: '📅',
      actionText: '新建预约',
    },
  },
  support: {
    loading: {
      title: '正在加载咨询记录',
      description: '请稍候，正在同步您的客服工单。',
      icon: '⏳',
    },
    empty: {
      title: '暂无咨询记录',
      description: '如有不适或流程疑问，可随时提交工单咨询。',
      icon: '💬',
      actionText: '立即新建工单',
    },
  },
  report: {
    history: {
      empty: {
        title: '暂无上报记录',
        description: '提交 AE 后会同步显示处理状态与进展。',
        icon: '📋',
      },
    },
  },
} as const
