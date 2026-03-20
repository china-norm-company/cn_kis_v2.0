/**
 * 图表导出Hook
 * Chart Export Hook
 * 
 * 提供图表导出功能的React Hook
 */

import { useCallback, useState } from 'react';
import type { ChartExportOptions } from '../types';

interface UseChartExportOptions {
  /** 默认文件名 */
  defaultFilename?: string;
}

interface ExportState {
  isExporting: boolean;
  error: Error | null;
  lastExportedFormat: string | null;
}

export function useChartExport(options: UseChartExportOptions = {}) {
  const { defaultFilename = 'chart' } = options;
  
  const [state, setState] = useState<ExportState>({
    isExporting: false,
    error: null,
    lastExportedFormat: null,
  });
  
  /**
   * 下载文件
   */
  const downloadFile = useCallback((
    content: string | Blob,
    filename: string,
    mimeType: string
  ) => {
    const blob = content instanceof Blob 
      ? content 
      : new Blob([content], { type: mimeType });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);
  
  /**
   * 导出为PNG
   */
  const exportToPNG = useCallback(async (
    chart: echarts.ECharts,
    exportOptions?: Partial<ChartExportOptions>
  ) => {
    setState(prev => ({ ...prev, isExporting: true, error: null }));
    
    try {
      const dataUrl = chart.getDataURL({
        type: 'png',
        pixelRatio: exportOptions?.pixelRatio || 2,
        backgroundColor: exportOptions?.backgroundColor || '#fff',
      });
      
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      const filename = `${exportOptions?.filename || defaultFilename}.png`;
      downloadFile(blob, filename, 'image/png');
      
      setState(prev => ({ ...prev, isExporting: false, lastExportedFormat: 'png' }));
      return true;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isExporting: false, 
        error: error instanceof Error ? error : new Error('PNG导出失败') 
      }));
      return false;
    }
  }, [defaultFilename, downloadFile]);
  
  /**
   * 导出为SVG
   */
  const exportToSVG = useCallback((
    chart: echarts.ECharts,
    exportOptions?: Partial<ChartExportOptions>
  ) => {
    setState(prev => ({ ...prev, isExporting: true, error: null }));
    
    try {
      const svgData = chart.getDataURL({
        type: 'svg',
        excludeComponents: ['toolbox'],
      });
      
      // 解码base64
      const svgContent = atob(svgData.split(',')[1]);
      
      const filename = `${exportOptions?.filename || defaultFilename}.svg`;
      downloadFile(svgContent, filename, 'image/svg+xml');
      
      setState(prev => ({ ...prev, isExporting: false, lastExportedFormat: 'svg' }));
      return true;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isExporting: false, 
        error: error instanceof Error ? error : new Error('SVG导出失败') 
      }));
      return false;
    }
  }, [defaultFilename, downloadFile]);
  
  /**
   * 导出为PDF
   */
  const exportToPDF = useCallback(async (
    chart: echarts.ECharts,
    exportOptions?: Partial<ChartExportOptions>
  ) => {
    setState(prev => ({ ...prev, isExporting: true, error: null }));
    
    try {
      const { jsPDF } = await import('jspdf');
      
      const dataUrl = chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#fff',
      });
      
      const pdfOptions = exportOptions?.pdfOptions || {};
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
      const imgHeight = (imgWidth * 3) / 4;
      
      const x = margin;
      const y = (pageHeight - imgHeight) / 2;
      
      pdf.addImage(dataUrl, 'PNG', x, y, imgWidth, imgHeight);
      
      const filename = `${exportOptions?.filename || defaultFilename}.pdf`;
      pdf.save(filename);
      
      setState(prev => ({ ...prev, isExporting: false, lastExportedFormat: 'pdf' }));
      return true;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isExporting: false, 
        error: error instanceof Error ? error : new Error('PDF导出失败') 
      }));
      return false;
    }
  }, [defaultFilename]);
  
  /**
   * 导出数据为CSV
   */
  const exportToCSV = useCallback((
    data: Array<Record<string, unknown>>,
    exportOptions?: Partial<ChartExportOptions>
  ) => {
    setState(prev => ({ ...prev, isExporting: true, error: null }));
    
    try {
      if (!data || data.length === 0) {
        throw new Error('没有数据可导出');
      }
      
      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.join(','),
        ...data.map(row => 
          headers.map(h => {
            const value = row[h];
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return String(value ?? '');
          }).join(',')
        ),
      ];
      
      const csvContent = '\ufeff' + csvRows.join('\n');
      const filename = `${exportOptions?.filename || defaultFilename}.csv`;
      downloadFile(csvContent, filename, 'text/csv;charset=utf-8');
      
      setState(prev => ({ ...prev, isExporting: false, lastExportedFormat: 'csv' }));
      return true;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isExporting: false, 
        error: error instanceof Error ? error : new Error('CSV导出失败') 
      }));
      return false;
    }
  }, [defaultFilename, downloadFile]);
  
  /**
   * 导出数据为Excel
   */
  const exportToExcel = useCallback(async (
    data: Array<Record<string, unknown>>,
    exportOptions?: Partial<ChartExportOptions>
  ) => {
    setState(prev => ({ ...prev, isExporting: true, error: null }));
    
    try {
      if (!data || data.length === 0) {
        throw new Error('没有数据可导出');
      }
      
      const XLSX = await import('xlsx');
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      
      const filename = `${exportOptions?.filename || defaultFilename}.xlsx`;
      XLSX.writeFile(wb, filename);
      
      setState(prev => ({ ...prev, isExporting: false, lastExportedFormat: 'xlsx' }));
      return true;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isExporting: false, 
        error: error instanceof Error ? error : new Error('Excel导出失败') 
      }));
      return false;
    }
  }, [defaultFilename]);
  
  /**
   * 统一导出接口
   */
  const exportChart = useCallback(async (
    chart: echarts.ECharts | null,
    format: ChartExportOptions['format'],
    data?: Array<Record<string, unknown>>,
    exportOptions?: Partial<ChartExportOptions>
  ) => {
    if (!chart && !data) {
      setState(prev => ({ 
        ...prev, 
        error: new Error('没有图表或数据可导出') 
      }));
      return false;
    }
    
    switch (format) {
      case 'png':
        return chart ? exportToPNG(chart, exportOptions) : false;
      case 'svg':
        return chart ? exportToSVG(chart, exportOptions) : false;
      case 'pdf':
        return chart ? exportToPDF(chart, exportOptions) : false;
      case 'csv':
        return data ? exportToCSV(data, exportOptions) : false;
      case 'xlsx':
        return data ? exportToExcel(data, exportOptions) : false;
      default:
        setState(prev => ({ 
          ...prev, 
          error: new Error(`不支持的导出格式: ${format}`) 
        }));
        return false;
    }
  }, [exportToPNG, exportToSVG, exportToPDF, exportToCSV, exportToExcel]);
  
  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
  
  return {
    ...state,
    exportToPNG,
    exportToSVG,
    exportToPDF,
    exportToCSV,
    exportToExcel,
    exportChart,
    clearError,
  };
}

export default useChartExport;


