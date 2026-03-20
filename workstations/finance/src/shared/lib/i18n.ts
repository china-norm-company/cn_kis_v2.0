/**
 * 国际化配置
 * 
 * 提供多语言支持，包括中文和英文
 */

// Note: React hooks and context are in useI18n.tsx

// ============ 类型定义 ============

export type Locale = "zh-CN" | "en-US";

export interface TranslationResources {
  [key: string]: string | TranslationResources;
}

// ============ 翻译资源 ============

const translations: Record<Locale, TranslationResources> = {
  "zh-CN": {
    // 通用
    common: {
      loading: "加载中...",
      save: "保存",
      cancel: "取消",
      confirm: "确认",
      delete: "删除",
      edit: "编辑",
      add: "添加",
      search: "搜索",
      filter: "筛选",
      reset: "重置",
      export: "导出",
      import: "导入",
      refresh: "刷新",
      back: "返回",
      next: "下一步",
      prev: "上一步",
      submit: "提交",
      close: "关闭",
      yes: "是",
      no: "否",
      all: "全部",
      none: "无",
      select: "选择",
      upload: "上传",
      download: "下载",
      view: "查看",
      details: "详情",
      actions: "操作",
      status: "状态",
      createTime: "创建时间",
      updateTime: "更新时间",
      createdBy: "创建人",
      remarks: "备注",
      success: "成功",
      error: "错误",
      warning: "警告",
      info: "提示",
    },
    
    // 状态
    status: {
      active: "激活",
      inactive: "未激活",
      pending: "待处理",
      approved: "已批准",
      rejected: "已拒绝",
      completed: "已完成",
      cancelled: "已取消",
      draft: "草稿",
      published: "已发布",
      archived: "已归档",
    },
    
    // 导航菜单
    nav: {
      dashboard: "仪表盘",
      workbench: "工作台",
      projects: "项目管理",
      subjects: "受试者管理",
      protocols: "项目管理",
      visits: "访视管理",
      samples: "样品管理",
      documents: "文档管理",
      reports: "报告管理",
      finance: "财务管理",
      quality: "质量控制",
      ethics: "伦理管理",
      regulatory: "法规合规",
      system: "系统管理",
      settings: "设置",
    },
    
    // 项目模块
    project: {
      title: "项目管理",
      name: "项目名称",
      code: "项目编号",
      client: "委托方",
      sponsor: "申办方",
      startDate: "开始日期",
      endDate: "结束日期",
      status: "项目状态",
      manager: "项目经理",
      description: "项目描述",
      create: "创建项目",
      edit: "编辑项目",
      delete: "删除项目",
      list: "项目列表",
      detail: "项目详情",
      statistics: "项目统计",
    },
    
    // 受试者模块
    subject: {
      title: "受试者管理",
      name: "姓名",
      code: "受试者编号",
      gender: "性别",
      age: "年龄",
      phone: "联系电话",
      idCard: "身份证号",
      enrollDate: "入组日期",
      status: "状态",
      male: "男",
      female: "女",
      create: "登记受试者",
      edit: "编辑受试者",
      list: "受试者列表",
      detail: "受试者详情",
      screening: "筛选",
      enrolled: "已入组",
      completed: "已完成",
      withdrawn: "退出",
    },
    
    // 访视模块
    visit: {
      title: "访视管理",
      name: "访视名称",
      date: "访视日期",
      window: "访视窗口",
      status: "访视状态",
      scheduled: "已计划",
      completed: "已完成",
      missed: "错过",
      cancelled: "已取消",
      create: "创建访视",
      calendar: "访视日历",
    },
    
    // 样品模块
    sample: {
      title: "样品管理",
      code: "样品编号",
      type: "样品类型",
      collectDate: "采集日期",
      storage: "存储位置",
      status: "状态",
      collected: "已采集",
      processing: "处理中",
      stored: "已存储",
      shipped: "已发运",
      destroyed: "已销毁",
    },
    
    // 质量控制
    quality: {
      title: "质量控制",
      deviation: "偏差",
      capa: "CAPA",
      audit: "审核",
      finding: "发现",
      corrective: "纠正措施",
      preventive: "预防措施",
    },
    
    // 伦理管理
    ethics: {
      title: "伦理管理",
      committee: "伦理委员会",
      application: "伦理申请",
      approval: "批件管理",
      review: "伦理审查",
    },
    
    // 法规合规
    regulatory: {
      title: "法规合规",
      regulation: "法规跟踪",
      compliance: "合规检查",
      training: "合规培训",
    },
    
    // 数据分析
    analysis: {
      title: "数据分析",
      statistics: "统计分析",
      efficacy: "功效评价",
      safety: "安全性分析",
      report: "分析报告",
    },
    
    // 系统设置
    system: {
      title: "系统管理",
      users: "用户管理",
      roles: "角色管理",
      permissions: "权限管理",
      config: "系统配置",
      backup: "数据备份",
      audit: "审计日志",
    },
    
    // 用户认证
    auth: {
      login: "登录",
      logout: "退出登录",
      register: "注册",
      forgotPassword: "忘记密码",
      resetPassword: "重置密码",
      username: "用户名",
      password: "密码",
      confirmPassword: "确认密码",
      email: "邮箱",
      phone: "手机号",
      verifyCode: "验证码",
      getCode: "获取验证码",
      rememberMe: "记住我",
      loginSuccess: "登录成功",
      logoutSuccess: "已退出登录",
    },
    
    // 消息提示
    message: {
      saveSuccess: "保存成功",
      saveFailed: "保存失败",
      deleteSuccess: "删除成功",
      deleteFailed: "删除失败",
      deleteConfirm: "确定要删除吗？",
      operationSuccess: "操作成功",
      operationFailed: "操作失败",
      networkError: "网络错误，请稍后重试",
      serverError: "服务器错误",
      validationError: "请检查输入内容",
      unauthorized: "未授权，请重新登录",
      forbidden: "没有权限执行此操作",
      notFound: "请求的资源不存在",
    },
    
    // 表单验证
    validation: {
      required: "此项为必填项",
      email: "请输入有效的邮箱地址",
      phone: "请输入有效的手机号",
      minLength: "最少输入 {min} 个字符",
      maxLength: "最多输入 {max} 个字符",
      min: "不能小于 {min}",
      max: "不能大于 {max}",
      pattern: "格式不正确",
      passwordMatch: "两次输入的密码不一致",
    },
    
    // 分页
    pagination: {
      total: "共 {total} 条",
      page: "第 {page} 页",
      pageSize: "每页 {size} 条",
      goto: "跳转到",
      prev: "上一页",
      next: "下一页",
    },
    
    // 化妆品CRO特定
    cosmetic: {
      efficacy: "功效评价",
      moisturizing: "保湿",
      whitening: "美白",
      antiWrinkle: "抗皱",
      antiAcne: "祛痘",
      sunscreen: "防晒",
      skinBarrier: "皮肤屏障",
      patchTest: "斑贴试验",
      humanTrial: "人体试验",
      instrumentTest: "仪器检测",
      corneometer: "皮肤水分测试仪",
      tewameter: "经皮水分流失测试仪",
      cutometer: "皮肤弹性测试仪",
      mexameter: "皮肤黑色素/红斑测试仪",
    },
  },
  
  "en-US": {
    // Common
    common: {
      loading: "Loading...",
      save: "Save",
      cancel: "Cancel",
      confirm: "Confirm",
      delete: "Delete",
      edit: "Edit",
      add: "Add",
      search: "Search",
      filter: "Filter",
      reset: "Reset",
      export: "Export",
      import: "Import",
      refresh: "Refresh",
      back: "Back",
      next: "Next",
      prev: "Previous",
      submit: "Submit",
      close: "Close",
      yes: "Yes",
      no: "No",
      all: "All",
      none: "None",
      select: "Select",
      upload: "Upload",
      download: "Download",
      view: "View",
      details: "Details",
      actions: "Actions",
      status: "Status",
      createTime: "Created At",
      updateTime: "Updated At",
      createdBy: "Created By",
      remarks: "Remarks",
      success: "Success",
      error: "Error",
      warning: "Warning",
      info: "Info",
    },
    
    // Status
    status: {
      active: "Active",
      inactive: "Inactive",
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
      completed: "Completed",
      cancelled: "Cancelled",
      draft: "Draft",
      published: "Published",
      archived: "Archived",
    },
    
    // Navigation
    nav: {
      dashboard: "Dashboard",
      workbench: "Workbench",
      projects: "Projects",
      subjects: "Subjects",
      protocols: "Protocols",
      visits: "Visits",
      samples: "Samples",
      documents: "Documents",
      reports: "Reports",
      finance: "Finance",
      quality: "Quality Control",
      ethics: "Ethics",
      regulatory: "Regulatory",
      system: "System",
      settings: "Settings",
    },
    
    // Project Module
    project: {
      title: "Project Management",
      name: "Project Name",
      code: "Project Code",
      client: "Client",
      sponsor: "Sponsor",
      startDate: "Start Date",
      endDate: "End Date",
      status: "Status",
      manager: "Project Manager",
      description: "Description",
      create: "Create Project",
      edit: "Edit Project",
      delete: "Delete Project",
      list: "Project List",
      detail: "Project Details",
      statistics: "Statistics",
    },
    
    // Subject Module
    subject: {
      title: "Subject Management",
      name: "Name",
      code: "Subject ID",
      gender: "Gender",
      age: "Age",
      phone: "Phone",
      idCard: "ID Card",
      enrollDate: "Enrollment Date",
      status: "Status",
      male: "Male",
      female: "Female",
      create: "Register Subject",
      edit: "Edit Subject",
      list: "Subject List",
      detail: "Subject Details",
      screening: "Screening",
      enrolled: "Enrolled",
      completed: "Completed",
      withdrawn: "Withdrawn",
    },
    
    // Visit Module
    visit: {
      title: "Visit Management",
      name: "Visit Name",
      date: "Visit Date",
      window: "Visit Window",
      status: "Status",
      scheduled: "Scheduled",
      completed: "Completed",
      missed: "Missed",
      cancelled: "Cancelled",
      create: "Create Visit",
      calendar: "Visit Calendar",
    },
    
    // Sample Module
    sample: {
      title: "Sample Management",
      code: "Sample ID",
      type: "Sample Type",
      collectDate: "Collection Date",
      storage: "Storage Location",
      status: "Status",
      collected: "Collected",
      processing: "Processing",
      stored: "Stored",
      shipped: "Shipped",
      destroyed: "Destroyed",
    },
    
    // Quality Control
    quality: {
      title: "Quality Control",
      deviation: "Deviation",
      capa: "CAPA",
      audit: "Audit",
      finding: "Finding",
      corrective: "Corrective Action",
      preventive: "Preventive Action",
    },
    
    // Ethics
    ethics: {
      title: "Ethics Management",
      committee: "Ethics Committee",
      application: "Ethics Application",
      approval: "Approval Documents",
      review: "Ethics Review",
    },
    
    // Regulatory
    regulatory: {
      title: "Regulatory Compliance",
      regulation: "Regulation Tracking",
      compliance: "Compliance Check",
      training: "Compliance Training",
    },
    
    // Analysis
    analysis: {
      title: "Data Analysis",
      statistics: "Statistical Analysis",
      efficacy: "Efficacy Evaluation",
      safety: "Safety Analysis",
      report: "Analysis Report",
    },
    
    // System
    system: {
      title: "System Management",
      users: "User Management",
      roles: "Role Management",
      permissions: "Permission Management",
      config: "System Configuration",
      backup: "Data Backup",
      audit: "Audit Log",
    },
    
    // Authentication
    auth: {
      login: "Login",
      logout: "Logout",
      register: "Register",
      forgotPassword: "Forgot Password",
      resetPassword: "Reset Password",
      username: "Username",
      password: "Password",
      confirmPassword: "Confirm Password",
      email: "Email",
      phone: "Phone",
      verifyCode: "Verification Code",
      getCode: "Get Code",
      rememberMe: "Remember Me",
      loginSuccess: "Login successful",
      logoutSuccess: "Logged out",
    },
    
    // Messages
    message: {
      saveSuccess: "Saved successfully",
      saveFailed: "Failed to save",
      deleteSuccess: "Deleted successfully",
      deleteFailed: "Failed to delete",
      deleteConfirm: "Are you sure you want to delete?",
      operationSuccess: "Operation successful",
      operationFailed: "Operation failed",
      networkError: "Network error, please try again",
      serverError: "Server error",
      validationError: "Please check your input",
      unauthorized: "Unauthorized, please login again",
      forbidden: "You don't have permission",
      notFound: "Resource not found",
    },
    
    // Validation
    validation: {
      required: "This field is required",
      email: "Please enter a valid email",
      phone: "Please enter a valid phone number",
      minLength: "Minimum {min} characters",
      maxLength: "Maximum {max} characters",
      min: "Must be at least {min}",
      max: "Must be at most {max}",
      pattern: "Invalid format",
      passwordMatch: "Passwords do not match",
    },
    
    // Pagination
    pagination: {
      total: "Total {total} items",
      page: "Page {page}",
      pageSize: "{size} per page",
      goto: "Go to",
      prev: "Previous",
      next: "Next",
    },
    
    // Cosmetic CRO Specific
    cosmetic: {
      efficacy: "Efficacy Evaluation",
      moisturizing: "Moisturizing",
      whitening: "Whitening",
      antiWrinkle: "Anti-Wrinkle",
      antiAcne: "Anti-Acne",
      sunscreen: "Sunscreen",
      skinBarrier: "Skin Barrier",
      patchTest: "Patch Test",
      humanTrial: "Human Trial",
      instrumentTest: "Instrument Test",
      corneometer: "Corneometer",
      tewameter: "Tewameter",
      cutometer: "Cutometer",
      mexameter: "Mexameter",
    },
  },
};

// ============ 工具函数 ============

/**
 * 获取嵌套翻译值
 */
function getNestedValue(obj: TranslationResources, path: string): string | undefined {
  const keys = path.split(".");
  let current: any = obj;
  
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  
  return typeof current === "string" ? current : undefined;
}

/**
 * 替换模板参数
 */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() ?? `{${key}}`;
  });
}

// ============ 创建翻译函数 ============

export function createTranslator(locale: Locale) {
  const resource = translations[locale];
  
  return function t(key: string, params?: Record<string, string | number>): string {
    const value = getNestedValue(resource, key);
    
    if (!value) {
      console.warn(`Translation missing: ${key}`);
      return key;
    }
    
    if (params) {
      return interpolate(value, params);
    }
    
    return value;
  };
}

// ============ 日期格式化 ============

export function createDateFormatter(locale: Locale) {
  const dateLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  
  return function formatDate(
    date: Date | string,
    format: "short" | "long" | "full" | "time" | "datetime" = "short"
  ): string {
    const d = typeof date === "string" ? new Date(date) : date;
    
    if (isNaN(d.getTime())) {
      return "";
    }
    
    const options: Intl.DateTimeFormatOptions = (() => {
      switch (format) {
        case "short":
          return { year: "numeric", month: "2-digit", day: "2-digit" };
        case "long":
          return { year: "numeric", month: "long", day: "numeric" };
        case "full":
          return { year: "numeric", month: "long", day: "numeric", weekday: "long" };
        case "time":
          return { hour: "2-digit", minute: "2-digit", second: "2-digit" };
        case "datetime":
          return {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          };
        default:
          return { year: "numeric", month: "2-digit", day: "2-digit" };
      }
    })();
    
    return new Intl.DateTimeFormat(dateLocale, options).format(d);
  };
}

// ============ 数字格式化 ============

export function createNumberFormatter(locale: Locale) {
  const numberLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  
  return function formatNumber(
    num: number,
    options?: Intl.NumberFormatOptions
  ): string {
    return new Intl.NumberFormat(numberLocale, options).format(num);
  };
}

// ============ 货币格式化 ============

export function createCurrencyFormatter(locale: Locale) {
  const currencyLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  const defaultCurrency = locale === "zh-CN" ? "CNY" : "USD";
  
  return function formatCurrency(
    amount: number,
    currency: string = defaultCurrency
  ): string {
    return new Intl.NumberFormat(currencyLocale, {
      style: "currency",
      currency,
    }).format(amount);
  };
}

// ============ 获取支持的语言列表 ============

export const SUPPORTED_LOCALES: { locale: Locale; name: string; nativeName: string }[] = [
  { locale: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文" },
  { locale: "en-US", name: "English (US)", nativeName: "English" },
];

// ============ 语言检测 ============

export function detectLocale(): Locale {
  // 1. 检查localStorage
  const stored = localStorage.getItem("locale");
  if (stored && (stored === "zh-CN" || stored === "en-US")) {
    return stored;
  }
  
  // 2. 检查浏览器语言
  const browserLang = navigator.language;
  if (browserLang.startsWith("zh")) {
    return "zh-CN";
  }
  
  return "en-US";
}

// ============ 导出翻译资源（供外部使用）============

export { translations };

