/**
 * 3D柱状图组件
 * 3D Bar Chart Component
 * 
 * 基于ECharts-GL的3D柱状图
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import 'echarts-gl';
import type { Chart3DOptions, Chart3DBarData } from './types';

interface Chart3DBarProps {
  /** 数据 */
  data: Chart3DBarData[];
  /** X轴标签 */
  xAxisData: string[];
  /** Y轴标签 */
  yAxisData?: string[];
  /** 配置选项 */
  options?: Chart3DOptions;
  /** 点击事件 */
  onClick?: (params: { name: string; value: number; seriesName: string }) => void;
  /** 类名 */
  className?: string;
  /** 样式 */
  style?: React.CSSProperties;
}

const defaultOptions: Chart3DOptions = {
  height: 400,
  autoRotate: true,
  rotateSpeed: 10,
  viewControl: {
    alpha: 20,
    beta: 30,
    distance: 200,
  },
  light: {
    main: { intensity: 1.2, shadow: true },
    ambient: { intensity: 0.3 },
  },
  postEffect: {
    enable: true,
    bloom: { enable: false },
    SSAO: { enable: true },
  },
  colorPalette: [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'
  ],
};

export const Chart3DBar: React.FC<Chart3DBarProps> = ({
  data,
  xAxisData,
  yAxisData,
  options = {},
  onClick,
  className,
  style,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  
  const mergedOptions = useMemo(() => ({
    ...defaultOptions,
    ...options,
    viewControl: { ...defaultOptions.viewControl, ...options.viewControl },
    light: { ...defaultOptions.light, ...options.light },
    postEffect: { ...defaultOptions.postEffect, ...options.postEffect },
  }), [options]);
  
  // 构建3D数据
  const chartData = useMemo(() => {
    const result: Array<[number, number, number]> = [];
    
    data.forEach((series, seriesIndex) => {
      series.data.forEach((item, itemIndex) => {
        result.push([itemIndex, seriesIndex, item.value]);
      });
    });
    
    return result;
  }, [data]);
  
  // 获取最大值用于设置坐标轴
  const maxValue = useMemo(() => {
    return Math.max(...data.flatMap(s => s.data.map(d => d.value)));
  }, [data]);
  
  useEffect(() => {
    if (!chartRef.current) return;
    
    // 初始化图表
    chartInstance.current = echarts.init(chartRef.current);
    
    const option: any = {
      title: mergedOptions.title ? {
        text: mergedOptions.title,
        left: 'center',
        textStyle: { fontSize: 16, fontWeight: 'bold' },
      } : undefined,
      
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const { data: d } = params;
          const xLabel = xAxisData[d[0]] || d[0];
          const yLabel = yAxisData?.[d[1]] || data[d[1]]?.name || d[1];
          return `${yLabel}<br/>${xLabel}: ${d[2]}`;
        },
      },
      
      visualMap: {
        show: true,
        dimension: 2,
        min: 0,
        max: maxValue,
        inRange: {
          color: mergedOptions.colorPalette?.slice(0, 5) || defaultOptions.colorPalette!.slice(0, 5),
        },
        left: 'right',
        top: 'center',
      },
      
      xAxis3D: {
        type: 'category',
        data: xAxisData,
        axisLabel: { interval: 0 },
      },
      
      yAxis3D: {
        type: 'category',
        data: yAxisData || data.map(s => s.name),
      },
      
      zAxis3D: {
        type: 'value',
        max: maxValue * 1.1,
      },
      
      grid3D: {
        boxWidth: 120,
        boxHeight: 80,
        boxDepth: 80,
        viewControl: {
          autoRotate: mergedOptions.autoRotate,
          autoRotateSpeed: mergedOptions.rotateSpeed,
          alpha: mergedOptions.viewControl?.alpha,
          beta: mergedOptions.viewControl?.beta,
          distance: mergedOptions.viewControl?.distance,
          minDistance: mergedOptions.viewControl?.minDistance,
          maxDistance: mergedOptions.viewControl?.maxDistance,
        },
        light: {
          main: mergedOptions.light?.main,
          ambient: mergedOptions.light?.ambient,
        },
        postEffect: mergedOptions.postEffect,
      },
      series: [{
        type: 'bar3D',
        data: chartData.map(d => ({
          value: d,
          itemStyle: {
            opacity: 0.8,
          },
        })),
        shading: 'realistic',
        realisticMaterial: {
          roughness: 0.5,
          metalness: 0.1,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            formatter: (params: any) => params.value[2],
          },
          itemStyle: {
            opacity: 1,
          },
        },
      }] as any,
    };
    
    chartInstance.current.setOption(option);
    
    // 绑定点击事件
    if (onClick) {
      chartInstance.current.on('click', (params: any) => {
        const { data: d } = params;
        onClick({
          name: xAxisData[d[0]],
          value: d[2],
          seriesName: yAxisData?.[d[1]] || data[d[1]]?.name || '',
        });
      });
    }
    
    // 响应式调整
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [chartData, xAxisData, yAxisData, mergedOptions, maxValue, onClick, data]);
  
  return (
    <div
      ref={chartRef}
      className={className}
      style={{
        width: mergedOptions.width || '100%',
        height: mergedOptions.height || 400,
        ...style,
      }}
    />
  );
};

export default Chart3DBar;


