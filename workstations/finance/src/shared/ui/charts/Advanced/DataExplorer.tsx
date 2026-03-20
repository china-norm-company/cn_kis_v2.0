/**
 * 交互式数据探索工具
 * Interactive Data Explorer Component
 * 
 * 功能：
 * - 动态选择维度和指标
 * - 多种图表类型切换
 * - 数据过滤和排序
 * - 数据聚合
 * - 图表配置
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import * as echarts from 'echarts';
import {
  BarChart3,
  LineChart,
  PieChart,
  ScatterChart,
  Filter,
  SortAsc,
  SortDesc,
  Settings2,
  X,
  Plus,
} from 'lucide-react';
import type { DataExplorerConfig } from './types';
import { ChartExporter } from './ChartExporter';

interface DataExplorerProps {
  /** 配置 */
  config: DataExplorerConfig;
  /** 标题 */
  title?: string;
  /** 高度 */
  height?: number;
  /** 类名 */
  className?: string;
}

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'radar';

interface FilterCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | number;
}

const chartTypeConfig: Record<ChartType, { icon: React.FC<{ className?: string }>; label: string }> = {
  bar: { icon: BarChart3, label: '柱状图' },
  line: { icon: LineChart, label: '折线图' },
  pie: { icon: PieChart, label: '饼图' },
  scatter: { icon: ScatterChart, label: '散点图' },
  area: { icon: LineChart, label: '面积图' },
  radar: { icon: PieChart, label: '雷达图' },
};

const aggregationOptions = [
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均值' },
  { value: 'count', label: '计数' },
  { value: 'min', label: '最小值' },
  { value: 'max', label: '最大值' },
];

const operatorOptions = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lte', label: '小于等于' },
  { value: 'contains', label: '包含' },
];

export const DataExplorer: React.FC<DataExplorerProps> = ({
  config,
  title = '数据探索',
  height = 500,
  className,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  
  // 状态
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xField, setXField] = useState<string>(
    config.fields.find(f => f.type === 'string')?.name || config.fields[0]?.name || ''
  );
  const [yField, setYField] = useState<string>(
    config.fields.find(f => f.type === 'number')?.name || ''
  );
  const [aggregation, setAggregation] = useState<string>('sum');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // 字段分类
  const { dimensionFields, measureFields } = useMemo(() => {
    const dimensions = config.fields.filter(f => f.type === 'string' || f.type === 'date');
    const measures = config.fields.filter(f => f.type === 'number');
    return { dimensionFields: dimensions, measureFields: measures };
  }, [config.fields]);
  
  // 数据过滤
  const filteredData = useMemo(() => {
    let result = [...config.data];
    
    // 应用过滤条件
    filters.forEach(filter => {
      result = result.filter(row => {
        const value = row[filter.field];
        const filterValue = filter.value;
        
        switch (filter.operator) {
          case 'eq':
            return value === filterValue;
          case 'ne':
            return value !== filterValue;
          case 'gt':
            return Number(value) > Number(filterValue);
          case 'lt':
            return Number(value) < Number(filterValue);
          case 'gte':
            return Number(value) >= Number(filterValue);
          case 'lte':
            return Number(value) <= Number(filterValue);
          case 'contains':
            return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
          default:
            return true;
        }
      });
    });
    
    return result;
  }, [config.data, filters]);
  
  // 数据聚合
  const aggregatedData = useMemo(() => {
    if (!xField || !yField) return [];
    
    const grouped = new Map<string, number[]>();
    
    filteredData.forEach(row => {
      const key = String(row[xField]);
      const value = Number(row[yField]) || 0;
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(value);
    });
    
    const result: Array<{ name: string; value: number }> = [];
    
    grouped.forEach((values, key) => {
      let aggregatedValue: number;
      
      switch (aggregation) {
        case 'sum':
          aggregatedValue = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'count':
          aggregatedValue = values.length;
          break;
        case 'min':
          aggregatedValue = Math.min(...values);
          break;
        case 'max':
          aggregatedValue = Math.max(...values);
          break;
        default:
          aggregatedValue = values.reduce((a, b) => a + b, 0);
      }
      
      result.push({ name: key, value: aggregatedValue });
    });
    
    // 排序
    if (sortField) {
      result.sort((a, b) => {
        const aVal = sortField === 'value' ? a.value : a.name;
        const bVal = sortField === 'value' ? b.value : b.name;
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return sortOrder === 'asc' 
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });
    }
    
    // 限制数据点数
    if (config.maxDataPoints && result.length > config.maxDataPoints) {
      return result.slice(0, config.maxDataPoints);
    }
    
    return result;
  }, [filteredData, xField, yField, aggregation, sortField, sortOrder, config.maxDataPoints]);
  
  // 生成图表配置
  const chartOption = useMemo((): echarts.EChartsOption => {
    const xAxisData = aggregatedData.map(d => d.name);
    const seriesData = aggregatedData.map(d => d.value);
    
    const yFieldConfig = config.fields.find(f => f.name === yField);
    const xFieldConfig = config.fields.find(f => f.name === xField);
    
    const baseOption: echarts.EChartsOption = {
      tooltip: {
        trigger: chartType === 'pie' ? 'item' : 'axis',
        formatter: (params: any) => {
          if (chartType === 'pie') {
            return `${params.name}: ${params.value.toFixed(2)} (${params.percent}%)`;
          }
          const p = Array.isArray(params) ? params[0] : params;
          return `${p.name}: ${p.value?.toFixed(2) || p.value}`;
        },
      },
      legend: {
        show: chartType === 'pie',
        bottom: 0,
      },
      grid: chartType !== 'pie' ? {
        left: 60,
        right: 40,
        top: 40,
        bottom: 60,
      } : undefined,
    };
    
    switch (chartType) {
      case 'bar':
        return {
          ...baseOption,
          xAxis: {
            type: 'category',
            data: xAxisData,
            axisLabel: { rotate: xAxisData.length > 10 ? 45 : 0, interval: 0 },
            name: xFieldConfig?.label || xField,
          },
          yAxis: {
            type: 'value',
            name: yFieldConfig?.label || yField,
          },
          series: [{
            type: 'bar',
            data: seriesData,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#5470c6' },
                { offset: 1, color: '#91cc75' },
              ]),
              borderRadius: [4, 4, 0, 0],
            },
          }],
        };
      
      case 'line':
        return {
          ...baseOption,
          xAxis: {
            type: 'category',
            data: xAxisData,
            axisLabel: { rotate: xAxisData.length > 10 ? 45 : 0 },
            name: xFieldConfig?.label || xField,
          },
          yAxis: {
            type: 'value',
            name: yFieldConfig?.label || yField,
          },
          series: [{
            type: 'line',
            data: seriesData,
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: { width: 2 },
            areaStyle: undefined,
          }],
        };
      
      case 'area':
        return {
          ...baseOption,
          xAxis: {
            type: 'category',
            data: xAxisData,
            boundaryGap: false,
            name: xFieldConfig?.label || xField,
          },
          yAxis: {
            type: 'value',
            name: yFieldConfig?.label || yField,
          },
          series: [{
            type: 'line',
            data: seriesData,
            smooth: true,
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(84, 112, 198, 0.5)' },
                { offset: 1, color: 'rgba(84, 112, 198, 0.05)' },
              ]),
            },
          }],
        };
      
      case 'pie':
        return {
          ...baseOption,
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            data: aggregatedData.map(d => ({ name: d.name, value: d.value })),
            label: {
              show: true,
              formatter: '{b}: {d}%',
            },
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)',
              },
            },
          }],
        };
      
      case 'scatter':
        return {
          ...baseOption,
          xAxis: {
            type: 'value',
            name: xFieldConfig?.label || xField,
          },
          yAxis: {
            type: 'value',
            name: yFieldConfig?.label || yField,
          },
          series: [{
            type: 'scatter',
            data: aggregatedData.map((d, i) => [i, d.value]),
            symbolSize: 12,
          }],
        };
      
      case 'radar':
        return {
          ...baseOption,
          radar: {
            indicator: aggregatedData.slice(0, 10).map(d => ({
              name: d.name,
              max: Math.max(...seriesData) * 1.2,
            })),
          },
          series: [{
            type: 'radar',
            data: [{
              value: aggregatedData.slice(0, 10).map(d => d.value),
              name: yFieldConfig?.label || yField,
            }],
          }],
        };
      
      default:
        return baseOption;
    }
  }, [aggregatedData, chartType, xField, yField, config.fields]);
  
  // 更新图表
  React.useEffect(() => {
    if (!chartRef.current) return;
    
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    
    chartInstance.current.setOption(chartOption, { notMerge: true });
    
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartOption]);
  
  // 清理
  React.useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
    };
  }, []);
  
  const addFilter = useCallback(() => {
    setFilters(prev => [...prev, {
      field: config.fields[0]?.name || '',
      operator: 'eq',
      value: '',
    }]);
  }, [config.fields]);
  
  const removeFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  const updateFilter = useCallback((index: number, updates: Partial<FilterCondition>) => {
    setFilters(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  }, []);
  
  const getChart = useCallback(() => chartInstance.current, []);
  
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${className}`}>
      {/* 工具栏 */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
              aria-label="筛选数据"
              title="筛选"
            >
              <Filter className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
              aria-label="图表设置"
              title="设置"
            >
              <Settings2 className="w-4 h-4" aria-hidden="true" />
            </button>
            <ChartExporter
              getChart={getChart}
              data={aggregatedData.map(d => ({ [xField]: d.name, [yField]: d.value }))}
              filename={`data-explorer-${Date.now()}`}
              mode="icon"
            />
          </div>
        </div>
        
        {/* 图表类型选择 */}
        <div className="flex items-center gap-1 mb-4">
          {(Object.keys(chartTypeConfig) as ChartType[]).map(type => {
            const config = chartTypeConfig[type];
            const Icon = config.icon;
            return (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-sm
                  ${chartType === type ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
                title={config.label}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{config.label}</span>
              </button>
            );
          })}
        </div>
        
        {/* 维度和指标选择 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label htmlFor="x-field-select" className="block text-xs text-gray-500 mb-1">维度 (X轴)</label>
            <select
              id="x-field-select"
              value={xField}
              onChange={e => setXField(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="选择X轴维度"
            >
              {dimensionFields.map(f => (
                <option key={f.name} value={f.name}>{f.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="y-field-select" className="block text-xs text-gray-500 mb-1">指标 (Y轴)</label>
            <select
              id="y-field-select"
              value={yField}
              onChange={e => setYField(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="选择Y轴指标"
            >
              {measureFields.map(f => (
                <option key={f.name} value={f.name}>{f.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="aggregation-select" className="block text-xs text-gray-500 mb-1">聚合方式</label>
            <select
              id="aggregation-select"
              value={aggregation}
              onChange={e => setAggregation(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="选择聚合方式"
            >
              {aggregationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="sort-field-select" className="block text-xs text-gray-500 mb-1">排序</label>
            <div className="flex gap-1">
              <select
                id="sort-field-select"
                value={sortField}
                onChange={e => setSortField(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                aria-label="选择排序字段"
              >
                <option value="">不排序</option>
                <option value="name">按名称</option>
                <option value="value">按数值</option>
              </select>
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="p-1.5 border rounded-lg hover:bg-gray-50"
                disabled={!sortField}
              >
                {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        
        {/* 过滤器 */}
        {showFilters && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">数据过滤</span>
              <button
                onClick={addFilter}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> 添加条件
              </button>
            </div>
            
            {filters.length === 0 ? (
              <p className="text-sm text-gray-500">暂无过滤条件</p>
            ) : (
              <div className="space-y-2">
                {filters.map((filter, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={filter.field}
                      onChange={e => updateFilter(index, { field: e.target.value })}
                      className="px-2 py-1 text-sm border rounded"
                      aria-label={`筛选条件${index + 1}的字段`}
                    >
                      {config.fields.map(f => (
                        <option key={f.name} value={f.name}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      value={filter.operator}
                      onChange={e => updateFilter(index, { operator: e.target.value as FilterCondition['operator'] })}
                      className="px-2 py-1 text-sm border rounded"
                      aria-label={`筛选条件${index + 1}的操作符`}
                    >
                      {operatorOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={filter.value}
                      onChange={e => updateFilter(index, { value: e.target.value })}
                      placeholder="值"
                      className="px-2 py-1 text-sm border rounded flex-1"
                      aria-label={`筛选条件${index + 1}的值`}
                    />
                    <button
                      onClick={() => removeFilter(index)}
                      aria-label={`删除筛选条件${index + 1}`}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 图表区域 */}
      <div className="p-4">
        <div
          ref={chartRef}
          style={{ height: height - 200 }}
          className="w-full"
        />
        
        {/* 数据统计 */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-gray-500">
          <span>共 {aggregatedData.length} 条数据</span>
          <span>原始数据 {filteredData.length} / {config.data.length} 条</span>
        </div>
      </div>
    </div>
  );
};

export default DataExplorer;

