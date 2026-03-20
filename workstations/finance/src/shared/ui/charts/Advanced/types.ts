/**
 * 高级图表类型定义
 * Advanced Charts Type Definitions
 */

// =============================================================================
// 3D图表配置
// =============================================================================

export interface Chart3DOptions {
  /** 图表标题 */
  title?: string;
  /** 图表宽度 */
  width?: number | string;
  /** 图表高度 */
  height?: number | string;
  /** 是否启用旋转 */
  autoRotate?: boolean;
  /** 旋转速度 */
  rotateSpeed?: number;
  /** 相机视角 */
  viewControl?: {
    alpha?: number;
    beta?: number;
    distance?: number;
    minDistance?: number;
    maxDistance?: number;
  };
  /** 光照配置 */
  light?: {
    main?: { intensity?: number; shadow?: boolean };
    ambient?: { intensity?: number };
  };
  /** 后处理效果 */
  postEffect?: {
    enable?: boolean;
    bloom?: { enable?: boolean; intensity?: number };
    SSAO?: { enable?: boolean };
  };
  /** 颜色主题 */
  colorPalette?: string[];
}

export interface Chart3DBarData {
  name: string;
  data: Array<{
    name: string;
    value: number;
    itemStyle?: { color?: string };
  }>;
}

export interface Chart3DSurfaceData {
  xAxis: string[] | number[];
  yAxis: string[] | number[];
  data: number[][];
}

export interface Chart3DScatterData {
  name: string;
  data: Array<[number, number, number, ...unknown[]]>;
  itemStyle?: { color?: string };
}

// =============================================================================
// 图表导出配置
// =============================================================================

export interface ChartExportOptions {
  /** 导出格式 */
  format: 'png' | 'svg' | 'pdf' | 'csv' | 'xlsx';
  /** 文件名 */
  filename?: string;
  /** 图片质量 (0-1) */
  quality?: number;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
  /** 背景色 */
  backgroundColor?: string;
  /** 像素比例 */
  pixelRatio?: number;
  /** 是否包含标题 */
  includeTitle?: boolean;
  /** 是否包含图例 */
  includeLegend?: boolean;
  /** PDF页面设置 */
  pdfOptions?: {
    orientation?: 'portrait' | 'landscape';
    pageSize?: 'A4' | 'A3' | 'Letter';
    margin?: number;
  };
}

// =============================================================================
// 仪表盘配置
// =============================================================================

export interface WidgetConfig {
  /** 组件ID */
  id: string;
  /** 组件类型 */
  type: 'chart' | 'stat' | 'table' | 'list' | 'text' | 'custom';
  /** 组件标题 */
  title: string;
  /** 位置 */
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  /** 图表类型 (如果type='chart') */
  chartType?: 'line' | 'bar' | 'pie' | 'scatter' | 'radar' | 'heatmap' | '3d-bar' | '3d-surface';
  /** 数据源 */
  dataSource?: {
    type: 'api' | 'static' | 'realtime';
    url?: string;
    refreshInterval?: number;
    data?: unknown;
  };
  /** 样式配置 */
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    borderRadius?: number;
    padding?: number;
  };
  /** 其他配置 */
  options?: Record<string, unknown>;
}

export interface DashboardConfig {
  /** 仪表盘ID */
  id: string;
  /** 仪表盘名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 布局列数 */
  columns: number;
  /** 行高 */
  rowHeight: number;
  /** 组件列表 */
  widgets: WidgetConfig[];
  /** 主题 */
  theme?: 'light' | 'dark' | 'custom';
  /** 自定义主题配置 */
  customTheme?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    borderColor?: string;
  };
  /** 全局刷新间隔 */
  refreshInterval?: number;
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;
  /** 创建者 */
  createdBy?: string;
}

// =============================================================================
// 数据探索配置
// =============================================================================

export interface DataExplorerConfig {
  /** 数据源 */
  data: Array<Record<string, unknown>>;
  /** 可用字段 */
  fields: DataField[];
  /** 默认图表类型 */
  defaultChartType?: string;
  /** 启用的图表类型 */
  enabledChartTypes?: string[];
  /** 最大数据点数 */
  maxDataPoints?: number;
  /** 是否启用过滤 */
  enableFilter?: boolean;
  /** 是否启用排序 */
  enableSort?: boolean;
  /** 是否启用聚合 */
  enableAggregation?: boolean;
  /** 是否启用导出 */
  enableExport?: boolean;
}

export interface DataField {
  /** 字段名 */
  name: string;
  /** 显示名称 */
  label: string;
  /** 数据类型 */
  type: 'string' | 'number' | 'date' | 'boolean';
  /** 聚合方式 */
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  /** 格式化函数 */
  format?: (value: unknown) => string;
}

// =============================================================================
// 动画配置
// =============================================================================

export interface ChartAnimationConfig {
  /** 是否启用动画 */
  enabled?: boolean;
  /** 动画时长 */
  duration?: number;
  /** 动画缓动 */
  easing?: string;
  /** 延迟 */
  delay?: number | ((idx: number) => number);
  /** 是否实时更新 */
  realtime?: boolean;
  /** 更新间隔 */
  updateInterval?: number;
  /** 过渡效果 */
  transition?: 'fade' | 'slide' | 'zoom' | 'none';
}

// =============================================================================
// 大数据配置
// =============================================================================

export interface LargeDataChartConfig {
  /** 数据采样策略 */
  samplingStrategy?: 'lttb' | 'average' | 'max' | 'min' | 'first';
  /** 采样阈值 */
  samplingThreshold?: number;
  /** 是否启用渐进渲染 */
  progressive?: boolean;
  /** 渐进渲染阈值 */
  progressiveThreshold?: number;
  /** 是否启用大数据模式 */
  largeMode?: boolean;
  /** 大数据模式阈值 */
  largeModeThreshold?: number;
  /** 是否使用WebWorker */
  useWebWorker?: boolean;
}


