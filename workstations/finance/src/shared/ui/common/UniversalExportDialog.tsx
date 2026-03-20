/**
 * 通用导出对话框组件
 * 统一所有页面的导出功能，通过props配置不同的列和默认值
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { ChevronDown, Trash2, Download } from "lucide-react";
import {
  getAllExportHistory,
  deleteExportHistory,
  ExportHistory,
  saveExportHistory,
} from "@/features/materials/testing/fixtures/exportHistoryMocks";

export interface UniversalExportConfig {
  fileFormat: string;
  exportType: "all" | "custom";
  maxRows: number;
  numericMapping: boolean;
  selectedColumns: string[];
}

interface UniversalExportDialogProps {
  /** 对话框打开状态 */
  open: boolean;
  /** 关闭对话框（与 onOpenChange 二选一或同时提供） */
  onClose?: () => void;
  /** 等同 Radix onOpenChange，关闭时传 false */
  onOpenChange?: (open: boolean) => void;
  /** 导出回调 */
  onExport: (config: UniversalExportConfig) => void;
  /** 可导出的列 */
  columns: string[];
  /** 默认选中的列 */
  defaultSelectedColumns?: string[];
  /** 是否启用导出历史功能 */
  enableHistory?: boolean;
  /** 导出历史的存储key（用于区分不同页面） */
  historyKey?: string;
  /** 当前数据总数（用于导出历史记录） */
  totalCount?: number;
  /** 页面标题（用于导出文件名等，可选） */
  pageTitle?: string;
}

export function UniversalExportDialog({
  open,
  onClose,
  onOpenChange,
  onExport,
  columns,
  defaultSelectedColumns,
  enableHistory = false,
  historyKey = "default",
  totalCount = 0,
  pageTitle: _pageTitle,
}: UniversalExportDialogProps) {
  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  // 安全检查：确保 columns 始终是数组
  const safeColumns = Array.isArray(columns) ? columns : [];
  
  const [fileFormat, setFileFormat] = useState("*.xlsx");
  const [exportType, setExportType] = useState<"all" | "custom">("all");
  const [maxRows, setMaxRows] = useState("50000");
  const [numericMapping, setNumericMapping] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    defaultSelectedColumns || safeColumns.slice(0, Math.min(safeColumns.length, 10))
  );
  const [exportHistory, setExportHistory] = useState<ExportHistory[]>([]);

  // 当对话框打开时，重置为默认值
  useEffect(() => {
    if (open) {
      setFileFormat("*.xlsx");
      setExportType("all");
      setMaxRows("50000");
      setNumericMapping(true);
      setSelectedColumns(
        defaultSelectedColumns || safeColumns.slice(0, Math.min(safeColumns.length, 10))
      );
      if (enableHistory) {
        // 根据historyKey过滤历史记录
        const allHistory = getAllExportHistory();
        setExportHistory(
          allHistory.filter((h) => h.historyKey === historyKey)
        );
      }
    }
  }, [open, safeColumns, defaultSelectedColumns, enableHistory, historyKey]);

  // 从历史记录恢复配置
  const handleLoadHistory = (history: ExportHistory) => {
    setFileFormat(history.fileFormat);
    setExportType(history.exportType);
    setMaxRows(history.maxRows.toString());
    setNumericMapping(history.numericMapping);
    setSelectedColumns([...history.selectedColumns]);
  };

  // 删除历史记录
  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteExportHistory(id);
    const allHistory = getAllExportHistory();
    setExportHistory(allHistory.filter((h) => h.historyKey === historyKey));
  };

  const handleColumnToggle = (column: string) => {
    if (selectedColumns.includes(column)) {
      setSelectedColumns(selectedColumns.filter((c) => c !== column));
    } else {
      setSelectedColumns([...selectedColumns, column]);
    }
  };

  const handleExport = () => {
    const config: UniversalExportConfig = {
      fileFormat,
      exportType,
      maxRows: parseInt(maxRows) || 50000,
      numericMapping,
      selectedColumns,
    };

    // 保存导出历史
    if (enableHistory) {
      saveExportHistory({
        historyKey,
        fileFormat,
        exportType,
        maxRows: parseInt(maxRows) || 50000,
        numericMapping,
        selectedColumns,
        recordCount: totalCount,
      });
    }

    onExport(config);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>导出</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 文件格式 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">文件格式</label>
            <Select value={fileFormat} onValueChange={setFileFormat}>
              <SelectTrigger className="w-48">
                <SelectValue />
                <ChevronDown className="h-4 w-4 opacity-50" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="*.xlsx">*.xlsx</SelectItem>
                <SelectItem value="*.csv">*.csv</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 配置 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">配置</label>
            <div className="flex items-center gap-2">
              <Select
                value={exportType}
                onValueChange={(value) => setExportType(value as "all" | "custom")}
              >
                <SelectTrigger className="w-32 bg-blue-600 text-white hover:bg-blue-700 border-blue-600">
                  <SelectValue />
                  <ChevronDown className="h-4 w-4 opacity-90" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部条数</SelectItem>
                  <SelectItem value="custom">自定义条数</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={maxRows}
                onChange={(e) => setMaxRows(e.target.value)}
                className="w-32"
                disabled={exportType === "all"}
              />
            </div>
          </div>

          {/* 显示规则 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                导出列为数值类型,仅支持数据映射
              </p>
            </div>
            <Switch checked={numericMapping} onCheckedChange={setNumericMapping} />
          </div>

          {/* 导出列 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">导出列</label>
            <div className="grid grid-cols-4 gap-2">
              {safeColumns.map((column) => (
                <button
                  key={column}
                  onClick={() => handleColumnToggle(column)}
                  className={`px-3 py-2 text-sm rounded border transition-colors ${
                    selectedColumns.includes(column)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {column}
                </button>
              ))}
            </div>
          </div>

          {/* 导出历史 */}
          {enableHistory && (
            <div className="space-y-2">
              <label className="text-sm font-medium">导出历史</label>
              <div className="border rounded-md bg-gray-50 max-h-[200px] overflow-y-auto">
                {exportHistory.length === 0 ? (
                  <div className="p-4 text-gray-500 text-sm text-center">
                    暂无导出历史
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {exportHistory.map((history) => (
                      <div
                        key={history.id}
                        className="p-3 hover:bg-gray-100 transition-colors cursor-pointer group"
                        onClick={() => handleLoadHistory(history)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900">
                                {new Date(history.exportTime).toLocaleString("zh-CN", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span className="text-xs text-gray-500">
                                {history.fileFormat}
                              </span>
                              <span className="text-xs text-gray-500">
                                {history.exportType === "all"
                                  ? "全部条数"
                                  : `自定义 ${history.maxRows} 条`}
                              </span>
                              <span className="text-xs text-gray-500">
                                共 {history.recordCount} 条记录
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 truncate">
                              导出列: {history.selectedColumns.join("、")}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => handleDeleteHistory(history.id, e)}
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                const config: UniversalExportConfig = {
                                  fileFormat: history.fileFormat,
                                  exportType: history.exportType,
                                  maxRows: history.maxRows,
                                  numericMapping: history.numericMapping,
                                  selectedColumns: [...history.selectedColumns],
                                };
                                handleLoadHistory(history);
                                setTimeout(() => {
                                  onExport(config);
                                  handleClose();
                                }, 0);
                              }}
                              title="重新导出"
                            >
                              <Download className="h-4 w-4 mr-1" />
                              导出
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700">
            导出
          </Button>
          <Button onClick={handleClose} variant="outline">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
