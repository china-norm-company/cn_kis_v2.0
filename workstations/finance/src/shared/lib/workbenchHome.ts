export type UserRole = string;

/**
 * 角色默认首页（用于“工作台概览”入口 & /workbench 的默认落点一致化）
 * - 商务总监/商务助理：使用统一工作台（/workbench）
 * - 其他角色：回到各自原本默认模块首页
 */
export function getWorkbenchHomePath(role: UserRole): string {
  const isUnifiedDashboardRole =
    role === "sales_director" || role === "business_assistant" || role === "sales_assistant";
  if (isUnifiedDashboardRole) return "/workbench";
  if (role === "ethics_secretary") return "/workbench/ethics-secretary";
  if (role === "researcher") return "/workbench";

  const defaultPathByRole: Partial<Record<UserRole, string>> = {
    // 销售相关
    sales: "/workbench/sales",
    sales_manager: "/workbench/sales",
    customer_success: "/workbench/customers",
    // 项目相关
    project_manager: "/projects",
    project_director: "/projects",
    crc_supervisor: "/projects",
    crc: "/projects",
    clinical_executor: "/workbench/visit-execution",
    recruiter: "/workbench/recruitment",
    // 排程/资源
    scheduler: "/workbench/scheduler",
    // 技术/实验
    technician: "/workbench/technician/tasks",
    equipment_engineer: "/workbench/instrument",
    equipment_manager: "/workbench/resources",
    tech_director: "/workbench/resources",
    technical_director: "/workbench/resources",
    // HR：工作台概览使用默认工作台页面
    hr: "/workbench",
    // 质量/合规
    quality_manager: "/workbench/quality",
    qa_manager: "/workbench/quality",
    qa: "/workbench/quality",
    // 财务
    finance_manager: "/workbench/finance",
    finance: "/workbench/finance",
    // 管理/系统
    admin: "/workbench/management",
    superadmin: "/workbench/management",
    general_manager: "/workbench/management",
    // 数据
    data_analyst: "/workbench/data-analysis",
    data_manager: "/workbench/data-analysis",
    // 其他
    it_specialist: "/workbench/system",
    warehouse_clerk: "/workbench/materials",
    subject: "/workbench/subjects",
  };

  return defaultPathByRole[role] || "/workbench/sales";
}


