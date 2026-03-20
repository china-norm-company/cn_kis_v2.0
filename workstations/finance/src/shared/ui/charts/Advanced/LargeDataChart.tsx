/**
 * 大数据图表组件
 * Large Data Chart Component
 * 
 * 专为大数据量优化：
 * - LTTB降采样算法
 * - 渐进式渲染
 * - 虚拟滚动
 * - Web Worker处理
 */

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import { Loader2, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';
import type { LargeDataChartConfig } from './types';

interface LargeDataChartProps {
  /** 数据点数组 [x, y] */
  data: Array<[number, number]>;
  /** 配置 */
  config?: LargeDataChartConfig;
  /** 图表类型 */
  type?: 'line' | 'scatter';
  /** X轴名称 */
  xAxisName?: string;
  /** Y轴名称 */
  yAxisName?: string;
  /** 标题 */
  title?: string;
  /** 高度 */
  height?: number;
  /** 加载状态 */
  loading?: boolean;
  /** 类名 */
  className?: string;
}

// LTTB (Largest Triangle Three Buckets) 降采样算法
function lttbDownsample(data: Array<[number, number]>, threshold: number): Array<[number, number]> {
  if (threshold >= data.length || threshold <= 2) {
    return data;
  }

  const sampled: Array<[number, number]> = [];
  
  // 保留第一个点
  sampled.push(data[0]);
  
  const bucketSize = (data.length - 2) / (threshold - 2);
  
  let a = 0; // 上一个选中的点
  
  for (let i = 0; i < threshold - 2; i++) {
    // 计算当前桶的范围
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 2) * bucketSize) + 1;
    
    // 计算下一个桶的平均值（用于计算三角形面积）
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length);
    
    let avgX = 0;
    let avgY = 0;
    const avgCount = nextBucketEnd - nextBucketStart;
    
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += data[j][0];
      avgY += data[j][1];
    }
    avgX /= avgCount;
    avgY /= avgCount;
    
    // 在当前桶中找到与上一个点和平均点形成最大三角形的点
    let maxArea = -1;
    let maxAreaPoint: [number, number] = data[bucketStart];
    
    const pointA = data[a];
    
    for (let j = bucketStart; j < Math.min(bucketEnd, data.length); j++) {
      const area = Math.abs(
        (pointA[0] - avgX) * (data[j][1] - pointA[1]) -
        (pointA[0] - data[j][0]) * (avgY - pointA[1])
      ) / 2;
      
      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[j];
        a = j;
      }
    }
    
    sampled.push(maxAreaPoint);
  }
  
  // 保留最后一个点
  sampled.push(data[data.length - 1]);
  
  return sampled;
}

// 平均值降采样
function averageDownsample(data: Array<[number, number]>, threshold: number): Array<[number, number]> {
  if (threshold >= data.length) return data;
  
  const bucketSize = Math.ceil(data.length / threshold);
  const sampled: Array<[number, number]> = [];
  
  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, Math.min(i + bucketSize, data.length));
    const avgX = bucket.reduce((sum, p) => sum + p[0], 0) / bucket.length;
    const avgY = bucket.reduce((sum, p) => sum + p[1], 0) / bucket.length;
    sampled.push([avgX, avgY]);
  }
  
  return sampled;
}

// 最大值降采样
function maxDownsample(data: Array<[number, number]>, threshold: number): Array<[number, number]> {
  if (threshold >= data.length) return data;
  
  const bucketSize = Math.ceil(data.length / threshold);
  const sampled: Array<[number, number]> = [];
  
  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, Math.min(i + bucketSize, data.length));
    const maxPoint = bucket.reduce((max, p) => p[1] > max[1] ? p : max, bucket[0]);
    sampled.push(maxPoint);
  }
  
  return sampled;
}

const defaultConfig: LargeDataChartConfig = {
  samplingStrategy: 'lttb',
  samplingThreshold: 2000,
  progressive: true,
  progressiveThreshold: 5000,
  largeMode: true,
  largeModeThreshold: 10000,
  useWebWorker: false,
};

export const LargeDataChart: React.FC<LargeDataChartProps> = ({
  data,
  config = {},
  type = 'line',
  xAxisName = 'X',
  yAxisName = 'Y',
  title,
  height = 400,
  loading = false,
  className,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState({ start: 0, end: 100 });
  const [stats, setStats] = useState({ original: 0, displayed: 0, time: 0 });
  
  const mergedConfig = { ...defaultConfig, ...config };
  
  // 数据处理
  const processedData = useMemo(() => {
    const startTime = performance.now();
    
    if (!data || data.length === 0) {
      return { data: [], stats: { original: 0, displayed: 0, time: 0 } };
    }
    
    let result = data;
    
    // 应用降采样
    if (data.length > mergedConfig.samplingThreshold!) {
      switch (mergedConfig.samplingStrategy) {
        case 'lttb':
          result = lttbDownsample(data, mergedConfig.samplingThreshold!);
          break;
        case 'average':
          result = averageDownsample(data, mergedConfig.samplingThreshold!);
          break;
        case 'max':
          result = maxDownsample(data, mergedConfig.samplingThreshold!);
          break;
        case 'min':
          result = data.filter((_, i) => i % Math.ceil(data.length / mergedConfig.samplingThreshold!) === 0);
          break;
        case 'first':
          result = data.slice(0, mergedConfig.samplingThreshold!);
          break;
        default:
          result = lttbDownsample(data, mergedConfig.samplingThreshold!);
      }
    }
    
    const endTime = performance.now();
    
    return {
      data: result,
      stats: {
        original: data.length,
        displayed: result.length,
        time: Math.round(endTime - startTime),
      },
    };
  }, [data, mergedConfig.samplingStrategy, mergedConfig.samplingThreshold]);
  
  // 更新统计信息
  useEffect(() => {
    setStats(processedData.stats);
  }, [processedData.stats]);
  
  // 图表配置
  const chartOption = useMemo((): echarts.EChartsOption => {
    const isLarge = data.length > mergedConfig.largeModeThreshold!;
    
    return {
      title: title ? {
        text: title,
        left: 'center',
      } : undefined,
      
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (!p?.data) return '';
          return `${xAxisName}: ${p.data[0].toFixed(4)}<br/>${yAxisName}: ${p.data[1].toFixed(4)}`;
        },
      },
      
      toolbox: {
        show: false, // 使用自定义工具栏
      },
      
      xAxis: {
        type: 'value',
        name: xAxisName,
        nameLocation: 'middle',
        nameGap: 30,
        min: 'dataMin',
        max: 'dataMax',
      },
      
      yAxis: {
        type: 'value',
        name: yAxisName,
        nameLocation: 'middle',
        nameGap: 40,
      },
      
      dataZoom: [
        {
          type: 'inside',
          start: zoomLevel.start,
          end: zoomLevel.end,
          throttle: 100,
        },
        {
          type: 'slider',
          start: zoomLevel.start,
          end: zoomLevel.end,
          height: 20,
          bottom: 20,
        },
      ],
      
      grid: {
        left: 60,
        right: 40,
        top: title ? 60 : 30,
        bottom: 70,
      },
      
      series: [{
        type: type,
        data: processedData.data,
        large: isLarge && mergedConfig.largeMode,
        largeThreshold: mergedConfig.largeModeThreshold,
        progressive: mergedConfig.progressive ? mergedConfig.progressiveThreshold : 0,
        progressiveThreshold: mergedConfig.progressiveThreshold,
        
        ...(type === 'line' ? {
          showSymbol: processedData.data.length < 500,
          symbolSize: 4,
          smooth: processedData.data.length < 1000,
          lineStyle: {
            width: 1.5,
          },
          areaStyle: processedData.data.length < 2000 ? {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(84, 112, 198, 0.3)' },
              { offset: 1, color: 'rgba(84, 112, 198, 0.05)' },
            ]),
          } : undefined,
        } : {}),
        
        ...(type === 'scatter' ? {
          symbolSize: 4,
          itemStyle: {
            opacity: Math.max(0.3, 1 - processedData.data.length / 10000),
          },
        } : {}),
      }],
    };
  }, [processedData.data, type, xAxisName, yAxisName, title, zoomLevel, mergedConfig, data.length]);
  
  // 初始化和更新图表
  useEffect(() => {
    if (!chartRef.current) return;
    
    setIsProcessing(true);
    
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    
    chartInstance.current.setOption(chartOption, { notMerge: true });
    
    // 监听缩放事件
    chartInstance.current.on('dataZoom', (_params: any) => {
      const option = chartInstance.current?.getOption() as any;
      if (option?.dataZoom?.[0]) {
        setZoomLevel({
          start: option.dataZoom[0].start,
          end: option.dataZoom[0].end,
        });
      }
    });
    
    setIsProcessing(false);
    
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartOption]);
  
  // 清理
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
    };
  }, []);
  
  // 缩放控制
  const handleZoomIn = useCallback(() => {
    const range = zoomLevel.end - zoomLevel.start;
    const newRange = Math.max(range * 0.5, 5);
    const center = (zoomLevel.start + zoomLevel.end) / 2;
    
    setZoomLevel({
      start: Math.max(0, center - newRange / 2),
      end: Math.min(100, center + newRange / 2),
    });
  }, [zoomLevel]);
  
  const handleZoomOut = useCallback(() => {
    const range = zoomLevel.end - zoomLevel.start;
    const newRange = Math.min(range * 2, 100);
    const center = (zoomLevel.start + zoomLevel.end) / 2;
    
    setZoomLevel({
      start: Math.max(0, center - newRange / 2),
      end: Math.min(100, center + newRange / 2),
    });
  }, [zoomLevel]);
  
  const handleReset = useCallback(() => {
    setZoomLevel({ start: 0, end: 100 });
  }, []);
  
  const handleExport = useCallback(() => {
    if (!chartInstance.current) return;
    
    const dataUrl = chartInstance.current.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#fff',
    });
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `chart-${Date.now()}.png`;
    link.click();
  }, []);
  
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${className}`}>
      {/* 工具栏 */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>原始: <strong className="text-gray-700">{stats.original.toLocaleString()}</strong> 点</span>
          <span>显示: <strong className="text-gray-700">{stats.displayed.toLocaleString()}</strong> 点</span>
          {stats.time > 0 && (
            <span>处理: <strong className="text-gray-700">{stats.time}</strong> ms</span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="重置"
          >
            <RotateCcw className="w-4 h-4 text-gray-600" />
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button
            onClick={handleExport}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="导出图片"
          >
            <Download className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>
      
      {/* 图表 */}
      <div className="relative">
        {(loading || isProcessing) && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}
        
        <div
          ref={chartRef}
          style={{ height }}
          className="w-full"
        />
      </div>
      
      {/* 降采样信息 */}
      {stats.original > stats.displayed && (
        <div className="px-3 py-2 bg-blue-50 text-sm text-blue-700 flex items-center gap-2">
          <span>ℹ️</span>
          <span>
            数据已使用 {mergedConfig.samplingStrategy?.toUpperCase()} 算法降采样，
            压缩比 {((1 - stats.displayed / stats.original) * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
};

export default LargeDataChart;


