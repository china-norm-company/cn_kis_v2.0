/**
 * 图表导出组件
 * Chart Exporter Component
 * 
 * 支持多种格式导出：PNG, SVG, PDF, CSV, XLSX
 */

import React, { useState, useCallback } from 'react';
import { Download, FileImage, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import type { ChartExportOptions } from './types';

interface ChartExporterProps {
  /** ECharts实例获取函数 */
  getChart: () => echarts.ECharts | null;
  /** 数据（用于CSV/XLSX导出） */
  data?: Array<Record<string, unknown>>;
  /** 导出文件名 */
  filename?: string;
  /** 启用的导出格式 */
  enabledFormats?: Array<'png' | 'svg' | 'pdf' | 'csv' | 'xlsx'>;
  /** 导出前回调 */
  onBeforeExport?: (format: string) => void;
  /** 导出后回调 */
  onAfterExport?: (format: string, success: boolean) => void;
  /** 显示模式 */
  mode?: 'dropdown' | 'buttons' | 'icon';
  /** 类名 */
  className?: string;
}

const formatConfig = {
  png: { label: 'PNG 图片', icon: FileImage, mime: 'image/png' },
  svg: { label: 'SVG 矢量图', icon: FileImage, mime: 'image/svg+xml' },
  pdf: { label: 'PDF 文档', icon: FileText, mime: 'application/pdf' },
  csv: { label: 'CSV 表格', icon: FileSpreadsheet, mime: 'text/csv' },
  xlsx: { label: 'Excel 表格', icon: FileSpreadsheet, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

export const ChartExporter: React.FC<ChartExporterProps> = ({
  getChart,
  data,
  filename = 'chart',
  enabledFormats = ['png', 'svg', 'csv'],
  onBeforeExport,
  onAfterExport,
  mode = 'dropdown',
  className,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const downloadFile = useCallback((content: string | Blob, name: string, mimeType: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);
  
  const exportPNG = useCallback(async (options?: Partial<ChartExportOptions>) => {
    const chart = getChart();
    if (!chart) return false;
    
    try {
      const dataUrl = chart.getDataURL({
        type: 'png',
        pixelRatio: options?.pixelRatio || 2,
        backgroundColor: options?.backgroundColor || '#fff',
      });
      
      // 转换为Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      downloadFile(blob, `${options?.filename || filename}.png`, 'image/png');
      return true;
    } catch (error) {
      console.error('PNG导出失败:', error);
      return false;
    }
  }, [getChart, filename, downloadFile]);
  
  const exportSVG = useCallback((options?: Partial<ChartExportOptions>) => {
    const chart = getChart();
    if (!chart) return false;
    
    try {
      const svgData = chart.getDataURL({
        type: 'svg',
        excludeComponents: ['toolbox'],
      });
      
      // 解码base64
      const svgContent = atob(svgData.split(',')[1]);
      
      downloadFile(svgContent, `${options?.filename || filename}.svg`, 'image/svg+xml');
      return true;
    } catch (error) {
      console.error('SVG导出失败:', error);
      return false;
    }
  }, [getChart, filename, downloadFile]);
  
  const exportPDF = useCallback(async (options?: Partial<ChartExportOptions>) => {
    const chart = getChart();
    if (!chart) return false;
    
    try {
      // 动态导入jsPDF
      const { jsPDF } = await import('jspdf');
      
      const dataUrl = chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#fff',
      });
      
      const pdfOptions = options?.pdfOptions || {};
      const orientation = pdfOptions.orientation || 'landscape';
      const pageSize = pdfOptions.pageSize || 'A4';
      
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: pageSize,
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = pdfOptions.margin || 10;
      
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (imgWidth * 3) / 4; // 假设4:3比例
      
      const x = margin;
      const y = (pageHeight - imgHeight) / 2;
      
      pdf.addImage(dataUrl, 'PNG', x, y, imgWidth, imgHeight);
      pdf.save(`${options?.filename || filename}.pdf`);
      
      return true;
    } catch (error) {
      console.error('PDF导出失败:', error);
      return false;
    }
  }, [getChart, filename]);
  
  const exportCSV = useCallback((options?: Partial<ChartExportOptions>) => {
    if (!data || data.length === 0) {
      console.warn('没有数据可导出');
      return false;
    }
    
    try {
      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.join(','),
        ...data.map(row => 
          headers.map(h => {
            const value = row[h];
            // 处理包含逗号或引号的值
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        ),
      ];
      
      const csvContent = '\ufeff' + csvRows.join('\n'); // BOM for Excel
      downloadFile(csvContent, `${options?.filename || filename}.csv`, 'text/csv;charset=utf-8');
      
      return true;
    } catch (error) {
      console.error('CSV导出失败:', error);
      return false;
    }
  }, [data, filename, downloadFile]);
  
  const exportXLSX = useCallback(async (options?: Partial<ChartExportOptions>) => {
    if (!data || data.length === 0) {
      console.warn('没有数据可导出');
      return false;
    }
    
    try {
      // 动态导入xlsx
      const XLSX = await import('xlsx');
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      
      XLSX.writeFile(wb, `${options?.filename || filename}.xlsx`);
      
      return true;
    } catch (error) {
      console.error('XLSX导出失败:', error);
      return false;
    }
  }, [data, filename]);
  
  const handleExport = useCallback(async (format: 'png' | 'svg' | 'pdf' | 'csv' | 'xlsx') => {
    setIsExporting(true);
    onBeforeExport?.(format);
    
    let success = false;
    
    switch (format) {
      case 'png':
        success = await exportPNG();
        break;
      case 'svg':
        success = exportSVG();
        break;
      case 'pdf':
        success = await exportPDF();
        break;
      case 'csv':
        success = exportCSV();
        break;
      case 'xlsx':
        success = await exportXLSX();
        break;
    }
    
    onAfterExport?.(format, success);
    setIsExporting(false);
    setShowDropdown(false);
  }, [exportPNG, exportSVG, exportPDF, exportCSV, exportXLSX, onBeforeExport, onAfterExport]);
  
  // 图标模式
  if (mode === 'icon') {
    return (
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`p-2 rounded-lg hover:bg-gray-100 transition-colors relative ${className}`}
        disabled={isExporting}
      >
        {isExporting ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        ) : (
          <Download className="w-5 h-5 text-gray-600" />
        )}
        
        {showDropdown && (
          <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 z-50 min-w-[140px]">
            {enabledFormats.map(format => {
              const config = formatConfig[format];
              const Icon = config.icon;
              return (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <Icon className="w-4 h-4" />
                  {config.label}
                </button>
              );
            })}
          </div>
        )}
      </button>
    );
  }
  
  // 按钮模式
  if (mode === 'buttons') {
    return (
      <div className={`flex gap-2 ${className}`}>
        {enabledFormats.map(format => {
          const config = formatConfig[format];
          const Icon = config.icon;
          return (
            <button
              key={format}
              onClick={() => handleExport(format)}
              disabled={isExporting}
              className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 
                         flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Icon className="w-4 h-4" />
              {format.toUpperCase()}
            </button>
          );
        })}
      </div>
    );
  }
  
  // 下拉菜单模式（默认）
  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isExporting}
        className="px-4 py-2 bg-white border rounded-lg hover:bg-gray-50 
                   flex items-center gap-2 transition-colors disabled:opacity-50"
      >
        {isExporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        <span>导出</span>
      </button>
      
      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 z-50 min-w-[160px]">
          {enabledFormats.map(format => {
            const config = formatConfig[format];
            const Icon = config.icon;
            return (
              <button
                key={format}
                onClick={() => handleExport(format)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Icon className="w-4 h-4" />
                {config.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChartExporter;


