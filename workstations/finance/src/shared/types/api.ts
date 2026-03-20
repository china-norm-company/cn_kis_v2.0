/**
 * 统一API响应类型定义
 * 解决any类型过多的问题
 */

// ============ 基础响应类型 ============

/** API统一响应格式 */
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

/** 分页响应格式 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** API错误类型 */
export interface ApiError {
  code: number;
  message: string;
  details?: Record<string, string[]>;
  field_errors?: Record<string, string>;
}

/** Axios错误响应类型（用于hooks中的onError回调） */
export interface MutationErrorResponse {
  response?: {
    data?: {
      message?: string;
      detail?: string;
      error?: string;
    };
  };
  message?: string;
}

// ============ 通用业务类型 ============

/** 审计字段 */
export interface AuditFields {
  created_at: string;
  updated_at: string;
  created_by?: number;
  updated_by?: number;
}

/** ID字段 */
export interface WithId {
  id: number;
}

/** 激活状态字段 */
export interface WithActiveStatus {
  is_active?: boolean;
}

/** 基础实体类型 */
export interface BaseEntity extends WithId, AuditFields, WithActiveStatus {}

// ============ 图表回调类型 ============

/** ECharts通用回调参数 */
export interface EChartsCallbackParams {
  componentType: string;
  seriesType?: string;
  seriesIndex?: number;
  seriesName?: string;
  name: string;
  dataIndex: number;
  data: unknown;
  value: unknown;
  color?: string;
  percent?: number;
  event?: MouseEvent;
}

/** ECharts tooltip格式化参数 */
export interface EChartsTooltipParams extends EChartsCallbackParams {
  marker: string;
  axisValue?: string | number;
  axisValueLabel?: string;
}

/** ECharts配置基础类型 */
export interface EChartsBaseOption {
  title?: {
    text?: string;
    subtext?: string;
    left?: string | number;
    top?: string | number;
  };
  tooltip?: {
    trigger?: 'item' | 'axis' | 'none';
    formatter?: string | ((params: EChartsTooltipParams | EChartsTooltipParams[]) => string);
  };
  legend?: {
    data?: string[];
    orient?: 'horizontal' | 'vertical';
    left?: string | number;
    top?: string | number;
  };
  grid?: {
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    containLabel?: boolean;
  };
  xAxis?: {
    type?: 'category' | 'value' | 'time' | 'log';
    data?: string[];
    name?: string;
  };
  yAxis?: {
    type?: 'category' | 'value' | 'time' | 'log';
    name?: string;
  };
  series?: Array<{
    name?: string;
    type: string;
    data: unknown[];
    [key: string]: unknown;
  }>;
}

// ============ 查询参数类型 ============

/** 基础列表查询参数 */
export interface BaseListParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
}

/** 日期范围查询 */
export interface DateRangeParams {
  start_date?: string;
  end_date?: string;
}

/** 状态筛选 */
export interface StatusFilterParams {
  status?: string;
  is_active?: boolean;
}

// ============ 操作结果类型 ============

/** 删除操作结果 */
export interface DeleteResult {
  success: boolean;
  message?: string;
  deleted_count?: number;
}

/** 批量操作结果 */
export interface BatchOperationResult {
  success_count: number;
  failed_count: number;
  errors?: Array<{
    id: number;
    error: string;
  }>;
}

// ============ 文件上传类型 ============

/** 上传文件信息 */
export interface UploadedFile {
  id: number;
  name: string;
  url: string;
  size: number;
  mime_type: string;
  created_at: string;
}

// ============ 用户相关类型 ============

/** 用户基础信息 */
export interface UserBasic {
  id: number;
  username: string;
  full_name?: string;
  avatar?: string;
}

/** 用户简要信息（用于选择器等） */
export interface UserOption {
  id: number;
  label: string;
  value: number;
}

