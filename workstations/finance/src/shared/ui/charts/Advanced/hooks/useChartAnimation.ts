/**
 * 图表动画Hook
 * Chart Animation Hook
 * 
 * 管理图表的动画效果和实时更新
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChartAnimationConfig } from '../types';

interface UseChartAnimationOptions {
  /** 初始动画配置 */
  initialConfig?: ChartAnimationConfig;
  /** 实时数据获取函数 */
  fetchData?: () => Promise<unknown>;
  /** 数据更新回调 */
  onDataUpdate?: (data: unknown) => void;
}

interface AnimationState {
  isPlaying: boolean;
  isPaused: boolean;
  currentFrame: number;
  totalFrames: number;
}

const defaultConfig: ChartAnimationConfig = {
  enabled: true,
  duration: 1000,
  easing: 'cubicInOut',
  delay: 0,
  realtime: false,
  updateInterval: 1000,
  transition: 'fade',
};

export function useChartAnimation(options: UseChartAnimationOptions = {}) {
  const { initialConfig = {}, fetchData, onDataUpdate } = options;
  
  const [config, setConfig] = useState<ChartAnimationConfig>({
    ...defaultConfig,
    ...initialConfig,
  });
  
  const [state, setState] = useState<AnimationState>({
    isPlaying: false,
    isPaused: false,
    currentFrame: 0,
    totalFrames: 0,
  });
  
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameRef = useRef<number>(0);
  
  /**
   * 开始实时更新
   */
  const startRealtime = useCallback(() => {
    if (!fetchData || !config.realtime) return;
    
    // 清除现有定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    const fetchAndUpdate = async () => {
      try {
        const newData = await fetchData();
        setData(newData);
        onDataUpdate?.(newData);
        frameRef.current += 1;
        setState(prev => ({
          ...prev,
          isPlaying: true,
          currentFrame: frameRef.current,
        }));
      } catch (err) {
        setError(err instanceof Error ? err : new Error('数据获取失败'));
      }
    };
    
    // 立即执行一次
    fetchAndUpdate();
    
    // 设置定时器
    intervalRef.current = setInterval(fetchAndUpdate, config.updateInterval);
    
    setState(prev => ({ ...prev, isPlaying: true, isPaused: false }));
  }, [fetchData, config.realtime, config.updateInterval, onDataUpdate]);
  
  /**
   * 停止实时更新
   */
  const stopRealtime = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(prev => ({ ...prev, isPlaying: false, isPaused: false }));
  }, []);
  
  /**
   * 暂停实时更新
   */
  const pauseRealtime = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(prev => ({ ...prev, isPlaying: false, isPaused: true }));
  }, []);
  
  /**
   * 恢复实时更新
   */
  const resumeRealtime = useCallback(() => {
    if (state.isPaused) {
      startRealtime();
    }
  }, [state.isPaused, startRealtime]);
  
  /**
   * 更新配置
   */
  const updateConfig = useCallback((updates: Partial<ChartAnimationConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);
  
  /**
   * 设置更新间隔
   */
  const setUpdateInterval = useCallback((interval: number) => {
    updateConfig({ updateInterval: interval });
    
    // 如果正在运行，重新启动以应用新间隔
    if (state.isPlaying) {
      stopRealtime();
      setTimeout(startRealtime, 0);
    }
  }, [updateConfig, state.isPlaying, stopRealtime, startRealtime]);
  
  /**
   * 切换实时模式
   */
  const toggleRealtime = useCallback(() => {
    if (state.isPlaying) {
      stopRealtime();
    } else {
      startRealtime();
    }
  }, [state.isPlaying, startRealtime, stopRealtime]);
  
  /**
   * 生成ECharts动画配置
   */
  const getEChartsAnimationConfig = useCallback(() => {
    return {
      animation: config.enabled,
      animationDuration: config.duration,
      animationEasing: config.easing,
      animationDelay: config.delay,
      animationDurationUpdate: config.duration,
      animationEasingUpdate: config.easing,
      animationDelayUpdate: config.delay,
    };
  }, [config]);
  
  /**
   * 生成过渡样式
   */
  const getTransitionStyle = useCallback((isVisible: boolean): React.CSSProperties => {
    if (!config.enabled) return {};
    
    switch (config.transition) {
      case 'fade':
        return {
          opacity: isVisible ? 1 : 0,
          transition: `opacity ${config.duration}ms ease-in-out`,
        };
      case 'slide':
        return {
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          opacity: isVisible ? 1 : 0,
          transition: `all ${config.duration}ms ease-out`,
        };
      case 'zoom':
        return {
          transform: isVisible ? 'scale(1)' : 'scale(0.9)',
          opacity: isVisible ? 1 : 0,
          transition: `all ${config.duration}ms ease-out`,
        };
      default:
        return {};
    }
  }, [config]);
  
  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    stopRealtime();
    frameRef.current = 0;
    setData(null);
    setError(null);
    setState({
      isPlaying: false,
      isPaused: false,
      currentFrame: 0,
      totalFrames: 0,
    });
  }, [stopRealtime]);
  
  // 清理
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  // 配置变更时更新
  useEffect(() => {
    if (config.realtime && state.isPlaying) {
      stopRealtime();
      startRealtime();
    }
  }, [config.updateInterval]);
  
  return {
    // 状态
    config,
    state,
    data,
    error,
    
    // 控制方法
    startRealtime,
    stopRealtime,
    pauseRealtime,
    resumeRealtime,
    toggleRealtime,
    
    // 配置方法
    updateConfig,
    setUpdateInterval,
    
    // 工具方法
    getEChartsAnimationConfig,
    getTransitionStyle,
    reset,
  };
}

// 动画预设
export const AnimationPresets = {
  /** 快速渐入 */
  quickFade: {
    enabled: true,
    duration: 300,
    easing: 'linear' as const,
    transition: 'fade' as const,
  },
  
  /** 平滑渐入 */
  smoothFade: {
    enabled: true,
    duration: 800,
    easing: 'cubicOut' as const,
    transition: 'fade' as const,
  },
  
  /** 弹性滑入 */
  elasticSlide: {
    enabled: true,
    duration: 600,
    easing: 'elasticOut' as const,
    transition: 'slide' as const,
  },
  
  /** 缩放弹出 */
  bounceZoom: {
    enabled: true,
    duration: 500,
    easing: 'backOut' as const,
    transition: 'zoom' as const,
  },
  
  /** 实时更新（1秒） */
  realtime1s: {
    enabled: true,
    duration: 300,
    easing: 'linear' as const,
    realtime: true,
    updateInterval: 1000,
    transition: 'none' as const,
  },
  
  /** 实时更新（5秒） */
  realtime5s: {
    enabled: true,
    duration: 300,
    easing: 'linear' as const,
    realtime: true,
    updateInterval: 5000,
    transition: 'none' as const,
  },
  
  /** 无动画 */
  none: {
    enabled: false,
    duration: 0,
    transition: 'none' as const,
  },
};

export default useChartAnimation;


