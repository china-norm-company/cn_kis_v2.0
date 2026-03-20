/**
 * 3D散点图组件
 * 3D Scatter Chart Component
 * 
 * 用于展示三维空间中的数据点分布
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import 'echarts-gl';
import type { Chart3DOptions, Chart3DScatterData } from './types';

interface Chart3DScatterProps {
  /** 数据系列 */
  series: Chart3DScatterData[];
  /** X轴名称 */
  xAxisName?: string;
  /** Y轴名称 */
  yAxisName?: string;
  /** Z轴名称 */
  zAxisName?: string;
  /** 配置选项 */
  options?: Chart3DOptions;
  /** 点大小 */
  symbolSize?: number | ((value: number[]) => number);
  /** 点击事件 */
  onClick?: (params: { data: number[]; seriesName: string }) => void;
  /** 类名 */
  className?: string;
  /** 样式 */
  style?: React.CSSProperties;
}

const defaultColors = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'
];

export const Chart3DScatter: React.FC<Chart3DScatterProps> = ({
  series,
  xAxisName = 'X',
  yAxisName = 'Y',
  zAxisName = 'Z',
  options = {},
  symbolSize = 10,
  onClick,
  className,
  style,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  
  // 计算数据范围
  const axisRange = useMemo(() => {
    const allData = series.flatMap(s => s.data);
    
    const xValues = allData.map(d => d[0]);
    const yValues = allData.map(d => d[1]);
    const zValues = allData.map(d => d[2]);
    
    return {
      x: { min: Math.min(...xValues), max: Math.max(...xValues) },
      y: { min: Math.min(...yValues), max: Math.max(...yValues) },
      z: { min: Math.min(...zValues), max: Math.max(...zValues) },
    };
  }, [series]);
  
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartInstance.current = echarts.init(chartRef.current);
    
    const option: any = {
      title: options.title ? {
        text: options.title,
        left: 'center',
      } : undefined,
      
      legend: {
        show: series.length > 1,
        data: series.map(s => s.name),
        top: 30,
        left: 'center',
      },
      
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const d = params.data;
          return `${params.seriesName}<br/>${xAxisName}: ${d[0].toFixed(2)}<br/>${yAxisName}: ${d[1].toFixed(2)}<br/>${zAxisName}: ${d[2].toFixed(2)}`;
        },
      },
      
      xAxis3D: {
        type: 'value',
        name: xAxisName,
        min: axisRange.x.min - (axisRange.x.max - axisRange.x.min) * 0.1,
        max: axisRange.x.max + (axisRange.x.max - axisRange.x.min) * 0.1,
      },
      
      yAxis3D: {
        type: 'value',
        name: yAxisName,
        min: axisRange.y.min - (axisRange.y.max - axisRange.y.min) * 0.1,
        max: axisRange.y.max + (axisRange.y.max - axisRange.y.min) * 0.1,
      },
      
      zAxis3D: {
        type: 'value',
        name: zAxisName,
        min: axisRange.z.min - (axisRange.z.max - axisRange.z.min) * 0.1,
        max: axisRange.z.max + (axisRange.z.max - axisRange.z.min) * 0.1,
      },
      
      grid3D: {
        boxWidth: 100,
        boxHeight: 80,
        boxDepth: 100,
        viewControl: {
          autoRotate: options.autoRotate ?? false,
          autoRotateSpeed: options.rotateSpeed ?? 10,
          alpha: options.viewControl?.alpha ?? 25,
          beta: options.viewControl?.beta ?? 45,
          distance: options.viewControl?.distance ?? 250,
        },
        light: {
          main: options.light?.main ?? { intensity: 1.2, shadow: true },
          ambient: options.light?.ambient ?? { intensity: 0.4 },
        },
        postEffect: options.postEffect ?? {
          enable: true,
          bloom: { enable: false },
          SSAO: { enable: true, radius: 4 },
        },
      },
      series: series.map((s, index) => ({
        type: 'scatter3D',
        name: s.name,
        data: s.data,
        symbolSize: typeof symbolSize === 'function' ? symbolSize : symbolSize,
        itemStyle: {
          color: s.itemStyle?.color || options.colorPalette?.[index] || defaultColors[index % defaultColors.length],
          opacity: 0.8,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.5)',
        },
        emphasis: {
          itemStyle: {
            opacity: 1,
            borderWidth: 2,
          },
        },
      })) as any,
    };
    
    chartInstance.current.setOption(option);
    
    // 绑定点击事件
    if (onClick) {
      chartInstance.current.on('click', (params: any) => {
        onClick({
          data: params.data,
          seriesName: params.seriesName,
        });
      });
    }
    
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [series, xAxisName, yAxisName, zAxisName, options, axisRange, symbolSize, onClick]);
  
  return (
    <div
      ref={chartRef}
      className={className}
      style={{
        width: options.width || '100%',
        height: options.height || 400,
        ...style,
      }}
    />
  );
};

export default Chart3DScatter;


