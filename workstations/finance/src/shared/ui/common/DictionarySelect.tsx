/**
 * 数据字典选择器组件
 * 
 * 通用的数据字典选择器，可以在各个表单页面中使用
 * 支持单选、多选、搜索等功能
 */

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { useDictionaryItems } from '@/features/system/model/useSystemP1';
import { Loader2 } from 'lucide-react';

interface DictionarySelectProps {
  /** 字典代码 */
  dictCode: string;
  /** 当前选中的值 */
  value?: string | string[];
  /** 值变化回调 */
  onChange?: (value: string | string[]) => void;
  /** 是否多选 */
  multiple?: boolean;
  /** 占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示"全部"选项 */
  showAll?: boolean;
  /** 是否可搜索（暂未实现） */
  searchable?: boolean;
  /** 自定义样式类名 */
  className?: string;
  /** 是否必填 */
  required?: boolean;
}

/**
 * 数据字典选择器
 */
export function DictionarySelect({
  dictCode,
  value,
  onChange,
  multiple = false,
  placeholder = '请选择',
  disabled = false,
  showAll = false,
  searchable = false, // 暂未实现，保留用于未来扩展
  className,
  required = false,
}: DictionarySelectProps) {
  // 暂时忽略searchable参数，未来可以实现搜索功能
  void searchable;
  const { data: items, isLoading, error } = useDictionaryItems(dictCode);

  // 过滤出激活的字典项
  const activeItems = useMemo(() => {
    if (!items) return [];
    return items.filter((item) => item.is_active).sort((a, b) => a.sort_order - b.sort_order);
  }, [items]);

  // 处理值变化
  const handleValueChange = (newValue: string) => {
    if (!onChange) return;

    if (multiple) {
      const currentValues = Array.isArray(value) ? value : value ? [value] : [];
      if (newValue === '') {
        // 清空
        onChange([]);
      } else if (currentValues.includes(newValue)) {
        // 取消选择
        onChange(currentValues.filter((v) => v !== newValue));
      } else {
        // 添加选择
        onChange([...currentValues, newValue]);
      }
    } else {
      onChange(newValue);
    }
  };

  // 获取显示值
  const displayValue = useMemo(() => {
    if (!value) return '';
    if (multiple) {
      if (Array.isArray(value) && value.length > 0) {
        return value
          .map((v) => activeItems.find((item) => item.code === v)?.name || v)
          .join(', ');
      }
      return '';
    }
    return activeItems.find((item) => item.code === value)?.name || value;
  }, [value, activeItems, multiple]);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">加载字典数据...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-sm text-destructive ${className}`}>
        加载字典失败: {dictCode}
      </div>
    );
  }

  if (!activeItems || activeItems.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        暂无可用选项
      </div>
    );
  }

  // 单选模式
  if (!multiple) {
    return (
      <Select
        value={value as string}
        onValueChange={handleValueChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {showAll && (
            <SelectItem value="">全部</SelectItem>
          )}
          {activeItems.map((item) => (
            <SelectItem key={item.code} value={item.code}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // 多选模式（使用Combobox或自定义实现）
  // 这里简化实现，使用Select显示已选值，点击时弹出多选对话框
  return (
    <div className={className}>
      <Select
        value=""
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={displayValue || placeholder} />
        </SelectTrigger>
        <SelectContent>
          {showAll && (
            <SelectItem value="">全部</SelectItem>
          )}
          {activeItems.map((item) => {
            const isSelected = Array.isArray(value) && value.includes(item.code);
            return (
              <SelectItem
                key={item.code}
                value={item.code}
                className={isSelected ? 'bg-accent' : ''}
              >
                {isSelected ? '✓ ' : ''}
                {item.name}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {Array.isArray(value) && value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((v) => {
            const item = activeItems.find((i) => i.code === v);
            if (!item) return null;
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-sm"
              >
                {item.name}
                <button
                  type="button"
                  onClick={() => {
                    const newValues = value.filter((val) => val !== v);
                    onChange?.(newValues);
                  }}
                  className="ml-1 text-primary hover:text-primary/80"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 数据字典单选组件（简化版）
 */
export function DictionarySelectSimple({
  dictCode,
  value,
  onChange,
  placeholder = '请选择',
  disabled = false,
  showAll = false,
  className,
  required = false,
}: Omit<DictionarySelectProps, 'multiple' | 'searchable'>) {
  return (
    <DictionarySelect
      dictCode={dictCode}
      value={value}
      onChange={onChange}
      multiple={false}
      placeholder={placeholder}
      disabled={disabled}
      showAll={showAll}
      className={className}
      required={required}
    />
  );
}
