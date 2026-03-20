/**
 * 项目 API 占位：开票对话框需拉取项目列表，财务台无项目模块时返回空
 */
export const projectsApi = {
  listFull: async (_params: { keyword?: string; pageSize?: number }) => ({
    projects: [] as Array<{ id?: number; project_no?: string; opportunity_no?: string; sponsor_no?: string; sponsor_name?: string; [key: string]: unknown }>,
  }),
};
