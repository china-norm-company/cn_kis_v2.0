/**
 * 增强的图表交互工具集
 * 提供钻取、筛选、导出、比较等高级交互功能
 */

import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/shared/ui/dropdown-menu";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { X, Download, Maximize2, Filter, RefreshCw } from "lucide-react";
import { useState } from "react";
import * as echarts from "echarts";

/**
 * 图表交互功能Hook
 * 提供钻取、筛选、导出等交互功能
 */
export const useChartInteraction = () => {
  const [drilldownPath, setDrilldownPath] = useState<string[]>([]);
  const [filterState, setFilterState] = useState<Record<string, unknown>>({});

  // 钻取功能
  const drilldown = (dimension: string) => {
    setDrilldownPath([...drilldownPath, dimension]);
  };

  const drillup = () => {
    if (drilldownPath.length > 0) {
      setDrilldownPath(drilldownPath.slice(0, -1));
    }
  };

  const resetDrilldown = () => {
    setDrilldownPath([]);
  };

  // 筛选功能
  const setFilter = (key: string, value: unknown) => {
    setFilterState({ ...filterState, [key]: value });
  };

  const removeFilter = (key: string) => {
    const newState = { ...filterState };
    delete newState[key];
    setFilterState(newState);
  };

  const clearFilters = () => {
    setFilterState({});
  };

  return {
    drilldownPath,
    filterState,
    drilldown,
    drillup,
    resetDrilldown,
    setFilter,
    removeFilter,
    clearFilters,
  };
};

/**
 * 图表导出功能
 */
export const chartExportUtils = {
  /**
   * 导出为图片（PNG）
   */
  exportAsImage: (chartInstance: echarts.ECharts | null, filename: string = "chart") => {
    if (!chartInstance) return;
    
    const url = chartInstance.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#fff",
    });

    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.png`;
    link.click();
  },

  /**
   * 导出数据为CSV
   */
  exportAsCSV: (data: Record<string, unknown>[], filename: string = "chart-data") => {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map((row) => headers.map((header) => String(row[header] || '')).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
  },

  /**
   * 导出数据为JSON
   */
  exportAsJSON: (data: unknown, filename: string = "chart-data") => {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.href = url;
    link.download = `${filename}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  },
};

/**
 * 图表工具栏组件
 */
interface ChartToolbarProps {
  onExportImage?: () => void;
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  onFullscreen?: () => void;
  onRefresh?: () => void;
  showFilters?: boolean;
  onFilterClick?: () => void;
}

export const ChartToolbar = ({
  onExportImage,
  onExportCSV,
  onExportJSON,
  onFullscreen,
  onRefresh,
  showFilters = true,
  onFilterClick,
}: ChartToolbarProps) => {
  return (
    <div className="flex items-center gap-2">
      {showFilters && onFilterClick && (
        <Button variant="outline" size="sm" onClick={onFilterClick}>
          <Filter className="h-4 w-4 mr-2" />
          筛选
        </Button>
      )}

      {onRefresh && (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          刷新
        </Button>
      )}

      {onFullscreen && (
        <Button variant="outline" size="sm" onClick={onFullscreen}>
          <Maximize2 className="h-4 w-4 mr-2" />
          全屏
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            导出
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>导出格式</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {onExportImage && (
            <DropdownMenuItem onClick={onExportImage}>
              导出为图片 (PNG)
            </DropdownMenuItem>
          )}
          {onExportCSV && (
            <DropdownMenuItem onClick={onExportCSV}>
              导出数据 (CSV)
            </DropdownMenuItem>
          )}
          {onExportJSON && (
            <DropdownMenuItem onClick={onExportJSON}>
              导出数据 (JSON)
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/**
 * 全屏对话框组件
 */
interface FullscreenChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export const FullscreenChartDialog = ({
  open,
  onOpenChange,
  title,
  children,
}: FullscreenChartDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>全屏查看图表详情</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * 面包屑导航组件（用于钻取路径）
 */
interface BreadcrumbProps {
  path: string[];
  onNavigate: (index: number) => void;
}

export const ChartBreadcrumb = ({ path, onNavigate }: BreadcrumbProps) => {
  if (path.length === 0) return null;

  return (
    <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-4">
      <button
        onClick={() => onNavigate(-1)}
        className="hover:text-primary transition-colors"
      >
        全部
      </button>
      {path.map((segment, index) => (
        <span key={index} className="flex items-center">
          <span className="mx-2">/</span>
          <button
            onClick={() => onNavigate(index)}
            className="hover:text-primary transition-colors"
          >
            {segment}
          </button>
        </span>
      ))}
    </nav>
  );
};

/**
 * 图表数据比较工具
 */
export const chartCompareUtils = {
  /**
   * 计算同比增长率
   */
  calculateYoY: (current: number, lastYear: number): number => {
    if (lastYear === 0) return 0;
    return ((current - lastYear) / lastYear) * 100;
  },

  /**
   * 计算环比增长率
   */
  calculateMoM: (current: number, lastMonth: number): number => {
    if (lastMonth === 0) return 0;
    return ((current - lastMonth) / lastMonth) * 100;
  },

  /**
   * 格式化增长率
   */
  formatGrowthRate: (rate: number): string => {
    const prefix = rate >= 0 ? "+" : "";
    return `${prefix}${rate.toFixed(2)}%`;
  },

  /**
   * 比较两个数据集
   */
  compareDatasets: (dataset1: Record<string, unknown>[], dataset2: Record<string, unknown>[], key: string) => {
    return dataset1.map((item, index) => {
      const itemValue = Number(item[key]) || 0;
      const compareValue = Number(dataset2[index]?.[key]) || 0;
      return {
        ...item,
        comparison: compareValue,
        difference: itemValue - compareValue,
        growthRate: chartCompareUtils.calculateYoY(itemValue, compareValue),
      };
    });
  },
};

/**
 * 图表筛选器组件
 */
interface ChartFilter {
  key: string;
  label: string;
  value: unknown;
}

interface ChartFiltersProps {
  filters: ChartFilter[];
  onRemoveFilter: (key: string) => void;
  onClearAll: () => void;
}

export const ChartFilters = ({ filters, onRemoveFilter, onClearAll }: ChartFiltersProps) => {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <span className="text-sm text-muted-foreground">筛选条件：</span>
      {filters.map((filter) => (
        <Badge key={filter.key} variant="secondary" className="gap-1">
          {filter.label}: {String(filter.value)}
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-transparent"
            onClick={() => onRemoveFilter(filter.key)}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
      {filters.length > 1 && (
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          清除全部
        </Button>
      )}
    </div>
  );
};

/**
 * 数据钻取管理器
 */
export class DrilldownManager {
  private path: string[] = [];
  private data: Map<string, any> = new Map();

  // 钻取到下一层
  drilldown(dimension: string, data: any): void {
    this.path.push(dimension);
    this.data.set(dimension, data);
  }

  // 返回上一层
  drillup(): void {
    if (this.path.length > 0) {
      const removed = this.path.pop();
      if (removed) {
        this.data.delete(removed);
      }
    }
  }

  // 跳转到指定层级
  jumpTo(index: number): void {
    if (index < 0) {
      this.reset();
      return;
    }
    
    if (index < this.path.length) {
      const toRemove = this.path.splice(index + 1);
      toRemove.forEach(key => this.data.delete(key));
    }
  }

  // 重置到顶层
  reset(): void {
    this.path = [];
    this.data.clear();
  }

  // 获取当前路径
  getPath(): string[] {
    return [...this.path];
  }

  // 获取当前数据
  getCurrentData(key: string): any {
    return this.data.get(key);
  }

  // 获取当前层级
  getCurrentLevel(): number {
    return this.path.length;
  }

  // 是否在顶层
  isTopLevel(): boolean {
    return this.path.length === 0;
  }
}

/**
 * 图表数据转换工具
 */
export const chartDataUtils = {
  /**
   * 将表格数据转换为图表数据
   */
  tableToChartData: (tableData: Record<string, unknown>[], xKey: string, yKey: string) => {
    return tableData.map((row) => ({
      name: String(row[xKey] || ''),
      value: Number(row[yKey]) || 0,
    }));
  },

  /**
   * 分组聚合数据
   */
  groupBy: (data: Record<string, unknown>[], groupKey: string, valueKey: string, aggregation: "sum" | "avg" | "count" = "sum") => {
    const grouped = data.reduce((acc, item: Record<string, unknown>) => {
      const key = String(item[groupKey] || '');
      if (!acc[key]) {
        acc[key] = [];
      }
      const value = item[valueKey];
      let val: number;
      if (typeof value === 'number') {
        val = value;
      } else if (typeof value === 'string') {
        val = Number(value) || 0;
      } else {
        val = 0;
      }
      (acc[key] as number[]).push(val);
      return acc;
    }, {} as Record<string, number[]>);

    return Object.entries(grouped).map((entry) => {
      const [key, values] = entry as [string, number[]];
      let value: number;
      if (aggregation === "sum") {
        value = values.reduce((sum: number, v: number) => sum + v, 0);
      } else if (aggregation === "avg") {
        value = values.reduce((sum: number, v: number) => sum + v, 0) / values.length;
      } else {
        value = values.length;
      }

      return { name: key, value };
    });
  },

  /**
   * 时间序列数据填充（填补缺失日期）
   */
  fillTimeSeries: (data: Record<string, unknown>[], startDate: Date, endDate: Date, dateKey: string, valueKey: string) => {
    const filled: Record<string, unknown>[] = [];
    const dataMap = new Map(data.map((item: Record<string, unknown>) => [String(item[dateKey] || ''), item[valueKey]]));

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
      filled.push({
        [dateKey]: dateStr,
        [valueKey]: dataMap.get(dateStr) || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return filled;
  },

  /**
   * 数据排序
   */
  sortData: (data: Record<string, unknown>[], key: string, order: "asc" | "desc" = "desc") => {
    return [...data].sort((a, b) => {
      const aValue = Number(a[key]) || 0;
      const bValue = Number(b[key]) || 0;
      if (order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  },

  /**
   * Top N 筛选
   */
  topN: (data: Record<string, unknown>[], key: string, n: number = 10) => {
    return chartDataUtils.sortData(data, key, "desc").slice(0, n);
  },
};

/**
 * 增强的图表工具栏组件
 */
interface EnhancedChartToolbarProps {
  chartInstance?: echarts.ECharts | null;
  data?: Record<string, unknown>[];
  filename?: string;
  onRefresh?: () => void;
  onFullscreen?: () => void;
  showFilters?: boolean;
  onFilterClick?: () => void;
}

export const EnhancedChartToolbar = ({
  chartInstance,
  data,
  filename = "chart",
  onRefresh,
  onFullscreen,
  showFilters,
  onFilterClick,
}: EnhancedChartToolbarProps) => {
  const handleExportImage = () => {
    chartExportUtils.exportAsImage(chartInstance || null, filename);
  };

  const handleExportCSV = () => {
    if (data) {
      chartExportUtils.exportAsCSV(data, filename);
    }
  };

  const handleExportJSON = () => {
    if (data) {
      chartExportUtils.exportAsJSON(data, filename);
    }
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {showFilters && onFilterClick && (
          <Button variant="outline" size="sm" onClick={onFilterClick}>
            <Filter className="h-4 w-4 mr-2" />
            筛选
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}

        {onFullscreen && (
          <Button variant="outline" size="sm" onClick={onFullscreen}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              导出
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>导出格式</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExportImage}>
              导出为图片 (PNG)
            </DropdownMenuItem>
            {data && (
              <>
                <DropdownMenuItem onClick={handleExportCSV}>
                  导出数据 (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportJSON}>
                  导出数据 (JSON)
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

/**
 * 图表缩放控制组件
 */
interface ChartZoomControlProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export const ChartZoomControl = ({ onZoomIn, onZoomOut, onReset }: ChartZoomControlProps) => {
  return (
    <div className="flex flex-col gap-1 absolute right-4 top-20 z-10">
      <Button variant="outline" size="sm" onClick={onZoomIn}>
        +
      </Button>
      <Button variant="outline" size="sm" onClick={onZoomOut}>
        -
      </Button>
      <Button variant="outline" size="sm" onClick={onReset}>
        ⊙
      </Button>
    </div>
  );
};

