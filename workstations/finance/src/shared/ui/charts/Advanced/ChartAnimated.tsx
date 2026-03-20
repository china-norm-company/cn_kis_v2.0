/**
 * 动画图表组件
 * Animated Chart Component
 * 
 * 支持多种动画效果的图表容器
 * - 入场动画
 * - 数据更新动画
 * - 实时数据流
 */

import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { ChartAnimationConfig } from './types';

interface ChartAnimatedProps {
  /** ECharts配置 */
  option: echarts.EChartsOption;
  /** 动画配置 */
  animation?: ChartAnimationConfig;
  /** 宽度 */
  width?: number | string;
  /** 高度 */
  height?: number | string;
  /** 主题 */
  theme?: string | object;
  /** 图表就绪回调 */
  onReady?: (chart: echarts.ECharts) => void;
  /** 类名 */
  className?: string;
  /** 样式 */
  style?: React.CSSProperties;
}

const defaultAnimation: ChartAnimationConfig = {
  enabled: true,
  duration: 1000,
  easing: 'cubicInOut',
  delay: 0,
  transition: 'fade',
};

export const ChartAnimated: React.FC<ChartAnimatedProps> = ({
  option,
  animation = {},
  width = '100%',
  height = 400,
  theme,
  onReady,
  className,
  style,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  
  const mergedAnimation = { ...defaultAnimation, ...animation };
  
  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartInstance.current = echarts.init(chartRef.current, theme);
    
    // 设置动画配置
    // ECharts GL 的 animationEasing 类型定义不完整，需要类型断言
    const animatedOption = {
      ...option,
      animation: mergedAnimation.enabled,
      animationDuration: mergedAnimation.duration,
      animationEasing: mergedAnimation.easing,
      animationDelay: mergedAnimation.delay,
    } as echarts.EChartsOption;
    
    // 使用类型断言绕过 animationEasing 的类型检查
    (chartInstance.current as any).setOption(animatedOption);
    
    if (onReady) {
      onReady(chartInstance.current);
    }
    
    // 入场动画
    setIsVisible(true);
    
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      chartInstance.current?.dispose();
    };
  }, [theme, onReady]);
  
  // 更新配置
  useEffect(() => {
    if (!chartInstance.current) return;
    
    // ECharts GL 的 animationEasing 类型定义不完整，需要类型断言
    const animatedOption = {
      ...option,
      animation: mergedAnimation.enabled,
      animationDuration: mergedAnimation.duration,
      animationEasing: mergedAnimation.easing,
      animationDelay: mergedAnimation.delay,
    } as echarts.EChartsOption;
    
    // 使用类型断言绕过 animationEasing 的类型检查
    (chartInstance.current as any).setOption(animatedOption, {
      notMerge: false,
      lazyUpdate: true,
    });
  }, [option, mergedAnimation]);
  
  // 实时更新
  useEffect(() => {
    if (!mergedAnimation.realtime || !mergedAnimation.updateInterval) return;
    
    updateIntervalRef.current = setInterval(() => {
      if (chartInstance.current) {
        chartInstance.current.setOption(option, {
          notMerge: false,
          lazyUpdate: true,
        });
      }
    }, mergedAnimation.updateInterval);
    
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [mergedAnimation.realtime, mergedAnimation.updateInterval, option]);
  
  // 过渡动画样式
  const transitionStyle = React.useMemo(() => {
    const baseStyle: React.CSSProperties = {
      width,
      height,
      ...style,
    };
    
    if (!mergedAnimation.enabled) return baseStyle;
    
    switch (mergedAnimation.transition) {
      case 'fade':
        return {
          ...baseStyle,
          opacity: isVisible ? 1 : 0,
          transition: `opacity ${mergedAnimation.duration}ms ease-in-out`,
        };
      case 'slide':
        return {
          ...baseStyle,
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          opacity: isVisible ? 1 : 0,
          transition: `all ${mergedAnimation.duration}ms ease-out`,
        };
      case 'zoom':
        return {
          ...baseStyle,
          transform: isVisible ? 'scale(1)' : 'scale(0.9)',
          opacity: isVisible ? 1 : 0,
          transition: `all ${mergedAnimation.duration}ms ease-out`,
        };
      default:
        return baseStyle;
    }
  }, [width, height, style, mergedAnimation, isVisible]);
  
  return (
    <div
      ref={chartRef}
      className={className}
      style={transitionStyle}
    />
  );
};

// =============================================================================
// 动画预设
// =============================================================================

export const AnimationPresets = {
  /** 渐入 */
  fadeIn: {
    enabled: true,
    duration: 800,
    easing: 'cubicOut',
    transition: 'fade' as const,
  },
  
  /** 滑入 */
  slideIn: {
    enabled: true,
    duration: 600,
    easing: 'elasticOut',
    transition: 'slide' as const,
  },
  
  /** 缩放 */
  zoomIn: {
    enabled: true,
    duration: 500,
    easing: 'backOut',
    transition: 'zoom' as const,
  },
  
  /** 弹性 */
  bounce: {
    enabled: true,
    duration: 1000,
    easing: 'bounceOut',
    transition: 'zoom' as const,
  },
  
  /** 无动画 */
  none: {
    enabled: false,
    duration: 0,
    transition: 'none' as const,
  },
  
  /** 实时更新 */
  realtime: (interval: number) => ({
    enabled: true,
    duration: 300,
    easing: 'linear',
    realtime: true,
    updateInterval: interval,
    transition: 'none' as const,
  }),
};

export default ChartAnimated;


