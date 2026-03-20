/**
 * 仪表盘构建器
 * Dashboard Builder Component
 * 
 * 功能：
 * - 拖拽式布局编辑
 * - 组件库（卡片、图表、列表）
 * - 布局保存与加载
 * - 主题定制
 * - 数据刷新策略
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import {
  Plus,
  Trash2,
  Save,
  Download,
  Upload,
  Copy,
  MoreHorizontal,
  BarChart3,
  LineChart,
  PieChart,
  Type,
  Hash,
  List,
  LayoutGrid,
} from 'lucide-react';
import type { DashboardConfig, WidgetConfig } from './types';

interface DashboardBuilderProps {
  /** 初始配置 */
  initialConfig?: DashboardConfig;
  /** 保存回调 */
  onSave?: (config: DashboardConfig) => void;
  /** 是否编辑模式 */
  editable?: boolean;
  /** 数据获取函数 */
  fetchData?: (widgetId: string, dataSource: WidgetConfig['dataSource']) => Promise<unknown>;
  /** 类名 */
  className?: string;
}

// 组件库定义
const widgetTypes = [
  { type: 'stat', label: '统计卡片', icon: Hash, defaultSize: { w: 3, h: 2 } },
  { type: 'chart', label: '图表', icon: BarChart3, defaultSize: { w: 6, h: 4 } },
  { type: 'table', label: '数据表格', icon: LayoutGrid, defaultSize: { w: 6, h: 4 } },
  { type: 'list', label: '列表', icon: List, defaultSize: { w: 4, h: 4 } },
  { type: 'text', label: '文本', icon: Type, defaultSize: { w: 4, h: 2 } },
] as const;

const chartTypes = [
  { type: 'line', label: '折线图', icon: LineChart },
  { type: 'bar', label: '柱状图', icon: BarChart3 },
  { type: 'pie', label: '饼图', icon: PieChart },
] as const;

// 默认配置
const defaultConfig: DashboardConfig = {
  id: '',
  name: '新建仪表盘',
  columns: 12,
  rowHeight: 60,
  widgets: [],
  theme: 'light',
  refreshInterval: 0,
};

// 单个Widget组件
interface WidgetItemProps {
  widget: WidgetConfig;
  editable: boolean;
  onUpdate: (id: string, updates: Partial<WidgetConfig>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  columnWidth: number;
  rowHeight: number;
  data?: unknown;
}

const WidgetItem: React.FC<WidgetItemProps> = ({
  widget,
  editable,
  onUpdate,
  onDelete,
  onDuplicate,
  columnWidth,
  rowHeight,
  data,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const { position, style } = widget;
  
  // 计算实际尺寸
  const width = position.w * columnWidth - 8;
  const height = position.h * rowHeight - 8;
  const left = position.x * columnWidth + 4;
  const top = position.y * rowHeight + 4;
  
  // 渲染图表
  useEffect(() => {
    if (widget.type !== 'chart' || !chartRef.current) return;
    
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    
    // 简单的示例图表配置
    const option = generateChartOption(widget.chartType || 'bar', data);
    chartInstance.current.setOption(option);
    
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, [widget.type, widget.chartType, data]);
  
  // 调整图表大小
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.resize();
    }
  }, [width, height]);
  
  // 渲染内容
  const renderContent = () => {
    switch (widget.type) {
      case 'stat':
        return (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <div className="text-3xl font-bold text-gray-800">
              {typeof data === 'number' ? data.toLocaleString() : '---'}
            </div>
            <div className="text-sm text-gray-500 mt-1">{widget.title}</div>
          </div>
        );
      
      case 'chart':
        return (
          <div className="h-full p-2">
            <div className="text-sm font-medium text-gray-700 mb-2">{widget.title}</div>
            <div ref={chartRef} style={{ height: height - 50 }} />
          </div>
        );
      
      case 'table':
        return (
          <div className="h-full p-2 overflow-auto">
            <div className="text-sm font-medium text-gray-700 mb-2">{widget.title}</div>
            <div className="text-gray-400 text-sm">表格数据...</div>
          </div>
        );
      
      case 'list':
        return (
          <div className="h-full p-2 overflow-auto">
            <div className="text-sm font-medium text-gray-700 mb-2">{widget.title}</div>
            <ul className="space-y-1">
              {Array.isArray(data) ? data.slice(0, 5).map((item, i) => (
                <li key={i} className="text-sm text-gray-600 truncate">• {String(item)}</li>
              )) : <li className="text-gray-400 text-sm">暂无数据</li>}
            </ul>
          </div>
        );
      
      case 'text':
        return (
          <div className="h-full p-4 flex items-center justify-center">
            {isEditing ? (
              <textarea
                className="w-full h-full text-sm resize-none border rounded p-2"
                defaultValue={widget.options?.content as string || ''}
                onBlur={e => {
                  onUpdate(widget.id, { options: { ...widget.options, content: e.target.value } });
                  setIsEditing(false);
                }}
                autoFocus
              />
            ) : (
              <div 
                className="text-sm text-gray-600 cursor-pointer"
                onDoubleClick={() => editable && setIsEditing(true)}
              >
                {widget.options?.content as string || widget.title || '双击编辑文本'}
              </div>
            )}
          </div>
        );
      
      default:
        return (
          <div className="h-full flex items-center justify-center text-gray-400">
            {widget.title}
          </div>
        );
    }
  };
  
  return (
    <div
      className="absolute bg-white rounded-lg shadow-sm border overflow-hidden transition-shadow hover:shadow-md"
      style={{
        left,
        top,
        width,
        height,
        backgroundColor: style?.backgroundColor || '#fff',
        borderColor: style?.borderColor || '#e5e7eb',
        borderRadius: style?.borderRadius || 8,
      }}
    >
      {/* 编辑模式工具栏 */}
      {editable && (
        <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity z-10">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 bg-white/90 rounded shadow-sm hover:bg-gray-100"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 min-w-[100px] z-20">
              <button
                onClick={() => { onDuplicate(widget.id); setShowMenu(false); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Copy className="w-3 h-3" /> 复制
              </button>
              <button
                onClick={() => { onDelete(widget.id); setShowMenu(false); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" /> 删除
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* 内容 */}
      {renderContent()}
    </div>
  );
};

// 生成图表配置
function generateChartOption(chartType: string, data?: unknown): echarts.EChartsOption {
  // 示例数据
  const sampleData = Array.isArray(data) && data.length > 0 
    ? data 
    : [120, 200, 150, 80, 70, 110, 130];
  const categories = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  
  switch (chartType) {
    case 'line':
      return {
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: sampleData, smooth: true }],
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
      };
    
    case 'bar':
      return {
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: sampleData }],
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
      };
    
    case 'pie':
      return {
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: categories.map((name, i) => ({ 
            name, 
            value: typeof sampleData[i] === 'number' ? sampleData[i] : 0 
          })),
        }],
      };
    
    default:
      return {};
  }
}

// 主组件
export const DashboardBuilder: React.FC<DashboardBuilderProps> = ({
  initialConfig,
  onSave,
  editable = true,
  fetchData,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<DashboardConfig>(initialConfig || defaultConfig);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({});
  
  // 计算列宽
  const columnWidth = containerWidth / config.columns;
  
  // 监听容器宽度
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  // 加载数据
  useEffect(() => {
    if (!fetchData) return;
    
    config.widgets.forEach(async widget => {
      if (widget.dataSource) {
        try {
          const data = await fetchData(widget.id, widget.dataSource);
          setWidgetData(prev => ({ ...prev, [widget.id]: data }));
        } catch (error) {
          console.error(`加载Widget ${widget.id} 数据失败:`, error);
        }
      }
    });
  }, [config.widgets, fetchData]);
  
  // 添加组件
  const addWidget = useCallback((type: WidgetConfig['type'], chartType?: string) => {
    const widgetType = widgetTypes.find(w => w.type === type);
    const defaultSize = widgetType?.defaultSize || { w: 4, h: 3 };
    
    // 查找空闲位置
    const findPosition = () => {
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x <= config.columns - defaultSize.w; x++) {
          const canPlace = !config.widgets.some(w => 
            x < w.position.x + w.position.w &&
            x + defaultSize.w > w.position.x &&
            y < w.position.y + w.position.h &&
            y + defaultSize.h > w.position.y
          );
          if (canPlace) return { x, y };
        }
      }
      return { x: 0, y: 0 };
    };
    
    const position = findPosition();
    
    const newWidget: WidgetConfig = {
      id: `widget-${Date.now()}`,
      type,
      title: widgetType?.label || '组件',
      position: { ...position, ...defaultSize },
      chartType: chartType as WidgetConfig['chartType'],
    };
    
    setConfig(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
    }));
    
    setShowWidgetPicker(false);
  }, [config.columns, config.widgets]);
  
  // 更新组件
  const updateWidget = useCallback((id: string, updates: Partial<WidgetConfig>) => {
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => w.id === id ? { ...w, ...updates } : w),
    }));
  }, []);
  
  // 删除组件
  const deleteWidget = useCallback((id: string) => {
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.filter(w => w.id !== id),
    }));
  }, []);
  
  // 复制组件
  const duplicateWidget = useCallback((id: string) => {
    const widget = config.widgets.find(w => w.id === id);
    if (!widget) return;
    
    const newWidget: WidgetConfig = {
      ...widget,
      id: `widget-${Date.now()}`,
      position: {
        ...widget.position,
        x: Math.min(widget.position.x + 1, config.columns - widget.position.w),
        y: widget.position.y + 1,
      },
    };
    
    setConfig(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
    }));
  }, [config.widgets, config.columns]);
  
  // 保存配置
  const handleSave = useCallback(() => {
    const saveConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    onSave?.(saveConfig);
  }, [config, onSave]);
  
  // 导出配置
  const exportConfig = useCallback(() => {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard-${config.id || 'export'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [config]);
  
  // 导入配置
  const importConfig = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as DashboardConfig;
        setConfig(imported);
      } catch (error) {
        console.error('导入配置失败:', error);
        alert('配置文件格式错误');
      }
    };
    input.click();
  }, []);
  
  // 计算画布高度
  const canvasHeight = Math.max(
    400,
    ...config.widgets.map(w => (w.position.y + w.position.h) * config.rowHeight + 20)
  );
  
  return (
    <div className={`bg-gray-50 rounded-xl ${className}`}>
      {/* 工具栏 */}
      {editable && (
        <div className="p-4 bg-white border-b flex items-center justify-between">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={config.name}
              onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))}
              className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0"
              placeholder="仪表盘名称"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWidgetPicker(true)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1.5 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> 添加组件
            </button>
            <button
              onClick={exportConfig}
              className="p-2 border rounded-lg hover:bg-gray-50"
              title="导出配置"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={importConfig}
              className="p-2 border rounded-lg hover:bg-gray-50"
              title="导入配置"
            >
              <Upload className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm flex items-center gap-1.5 hover:bg-green-700"
            >
              <Save className="w-4 h-4" /> 保存
            </button>
          </div>
        </div>
      )}
      
      {/* 画布 */}
      <div
        ref={containerRef}
        className="relative p-2 overflow-auto"
        style={{ minHeight: canvasHeight }}
      >
        {/* 网格背景（编辑模式） */}
        {editable && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundSize: `${columnWidth}px ${config.rowHeight}px`,
              backgroundImage: 'linear-gradient(to right, #f0f0f0 1px, transparent 1px), linear-gradient(to bottom, #f0f0f0 1px, transparent 1px)',
            }}
          />
        )}
        
        {/* 组件 */}
        {config.widgets.map(widget => (
          <WidgetItem
            key={widget.id}
            widget={widget}
            editable={editable}
            onUpdate={updateWidget}
            onDelete={deleteWidget}
            onDuplicate={duplicateWidget}
            columnWidth={columnWidth}
            rowHeight={config.rowHeight}
            data={widgetData[widget.id]}
          />
        ))}
        
        {/* 空状态 */}
        {config.widgets.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <LayoutGrid className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>仪表盘为空</p>
              {editable && (
                <button
                  onClick={() => setShowWidgetPicker(true)}
                  className="mt-2 text-blue-600 hover:underline text-sm"
                >
                  添加第一个组件
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* 组件选择器 */}
      {showWidgetPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">添加组件</h3>
              <button
                onClick={() => setShowWidgetPicker(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <span className="sr-only">关闭</span>×
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {widgetTypes.map(wt => {
                const Icon = wt.icon;
                if (wt.type === 'chart') {
                  return (
                    <div key={wt.type} className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">{wt.label}</div>
                      <div className="grid grid-cols-3 gap-2">
                        {chartTypes.map(ct => {
                          const ChartIcon = ct.icon;
                          return (
                            <button
                              key={ct.type}
                              onClick={() => addWidget('chart', ct.type)}
                              className="p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 flex flex-col items-center gap-1"
                            >
                              <ChartIcon className="w-5 h-5 text-gray-600" />
                              <span className="text-xs text-gray-600">{ct.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={wt.type}
                    onClick={() => addWidget(wt.type)}
                    className="p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-300 flex flex-col items-center gap-2"
                  >
                    <Icon className="w-6 h-6 text-gray-600" />
                    <span className="text-sm text-gray-700">{wt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardBuilder;


