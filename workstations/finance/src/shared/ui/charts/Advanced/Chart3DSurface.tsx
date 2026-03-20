/**
 * 3D曲面图组件
 * 3D Surface Chart Component
 * 
 * 用于展示连续数据的三维分布
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import 'echarts-gl';
import type { Chart3DOptions, Chart3DSurfaceData } from './types';

interface Chart3DSurfaceProps {
  /** 数据 */
  data: Chart3DSurfaceData;
  /** 配置选项 */
  options?: Chart3DOptions;
  /** 是否显示等高线 */
  showContour?: boolean;
  /** 颜色映射 */
  colorMap?: string[];
  /** 类名 */
  className?: string;
  /** 样式 */
  style?: React.CSSProperties;
}

const defaultColorMap = [
  '#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8',
  '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'
];

export const Chart3DSurface: React.FC<Chart3DSurfaceProps> = ({
  data,
  options = {},
  showContour = false,
  colorMap = defaultColorMap,
  className,
  style,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  
  // 将2D数组转换为ECharts格式
  const surfaceData = useMemo(() => {
    const result: Array<[number, number, number]> = [];
    
    data.data.forEach((row, i) => {
      row.forEach((value, j) => {
        result.push([j, i, value]);
      });
    });
    
    return result;
  }, [data]);
  
  // 计算数据范围
  const valueRange = useMemo(() => {
    const values = data.data.flat();
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [data]);
  
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartInstance.current = echarts.init(chartRef.current);
    
    const option: any = {
      title: options.title ? {
        text: options.title,
        left: 'center',
      } : undefined,
      
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const d = params.data;
          const xLabel = typeof data.xAxis[d[0]] === 'string' ? data.xAxis[d[0]] : d[0];
          const yLabel = typeof data.yAxis[d[1]] === 'string' ? data.yAxis[d[1]] : d[1];
          return `X: ${xLabel}<br/>Y: ${yLabel}<br/>值: ${d[2].toFixed(2)}`;
        },
      },
      
      visualMap: {
        show: true,
        dimension: 2,
        min: valueRange.min,
        max: valueRange.max,
        inRange: {
          color: colorMap,
        },
        left: 'right',
        top: 'center',
        text: ['高', '低'],
        calculable: true,
      },
      
      xAxis3D: {
        type: typeof data.xAxis[0] === 'string' ? 'category' : 'value',
        data: typeof data.xAxis[0] === 'string' ? data.xAxis : undefined,
        name: 'X',
      },
      
      yAxis3D: {
        type: typeof data.yAxis[0] === 'string' ? 'category' : 'value',
        data: typeof data.yAxis[0] === 'string' ? data.yAxis : undefined,
        name: 'Y',
      },
      
      zAxis3D: {
        type: 'value',
        name: 'Z',
      },
      
      grid3D: {
        boxWidth: 100,
        boxHeight: 60,
        boxDepth: 100,
        viewControl: {
          autoRotate: options.autoRotate ?? true,
          autoRotateSpeed: options.rotateSpeed ?? 5,
          alpha: options.viewControl?.alpha ?? 30,
          beta: options.viewControl?.beta ?? 45,
          distance: options.viewControl?.distance ?? 200,
        },
        light: {
          main: options.light?.main ?? { intensity: 1.2, shadow: true },
          ambient: options.light?.ambient ?? { intensity: 0.3 },
        },
        postEffect: options.postEffect ?? {
          enable: true,
          SSAO: { enable: true },
        },
      },
      series: [
        {
          type: 'surface',
          data: surfaceData,
          wireframe: {
            show: true,
            lineStyle: {
              opacity: 0.1,
              width: 0.5,
            },
          },
          shading: 'realistic',
          realisticMaterial: {
            roughness: 0.5,
            metalness: 0.1,
          },
          itemStyle: {
            opacity: 0.9,
          },
        },
        // 等高线（可选）
        ...(showContour ? [{
          type: 'surface' as const,
          data: surfaceData,
          wireframe: {
            show: true,
            lineStyle: {
              color: '#333',
              opacity: 0.5,
            },
          },
          itemStyle: {
            opacity: 0,
          },
        }] : []),
      ] as any
    };
    
    chartInstance.current.setOption(option);
    
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [surfaceData, data, options, valueRange, colorMap, showContour]);
  
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

export default Chart3DSurface;


