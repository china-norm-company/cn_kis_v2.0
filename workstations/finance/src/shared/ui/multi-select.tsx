import { useState, useEffect, useRef } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

// 支持两种格式：字符串数组或对象数组
type OptionItem = string | { value: string; label: string };

interface MultiSelectProps {
  options: OptionItem[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  disabled = false,
  placeholder = "请选择",
  className,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 辅助函数：从选项项中提取 value
  const getOptionValue = (option: OptionItem): string => {
    return typeof option === "string" ? option : option.value;
  };

  // 辅助函数：从选项项中提取 label
  const getOptionLabel = (option: OptionItem): string => {
    return typeof option === "string" ? option : option.label;
  };

  const toggleOption = (optionValue: string) => {
    if (disabled) return;

    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const removeOption = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(value.filter((v) => v !== optionValue));
  };

  // 获取已选中的选项（用于显示）
  const selectedOptions = options.filter((opt) => value.includes(getOptionValue(opt)));

  return (
    <div className={cn("relative w-full", className)} ref={dropdownRef}>
      {/* 显示区域 */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full min-h-[36px] px-3 py-2 border rounded-md text-sm flex items-center justify-between",
          disabled
            ? "bg-muted cursor-not-allowed opacity-50"
            : "bg-background cursor-pointer hover:border-primary",
          isOpen ? "border-primary ring-2 ring-primary/20" : "border-input"
        )}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-muted-foreground whitespace-nowrap">{placeholder}</span>
        ) : (
          <div className="flex gap-1 flex-1 overflow-hidden min-w-0">
            <div className="flex gap-1 flex-1 min-w-0 overflow-hidden">
              {selectedOptions.map((option) => {
                const optionValue = getOptionValue(option);
                const optionLabel = getOptionLabel(option);
                return (
                  <span
                    key={optionValue}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs whitespace-nowrap flex-shrink-0"
                  >
                    {optionLabel}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={(e) => removeOption(optionValue, e)}
                        className="hover:text-primary/80 focus:outline-none"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {!disabled && (
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform ml-2 flex-shrink-0",
              isOpen && "rotate-180"
            )}
          />
        )}
      </div>

      {/* 下拉列表 */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-60 overflow-auto">
          {options.length > 0 ? (
            <div className="py-1">
              {options.map((option) => {
                const optionValue = getOptionValue(option);
                const optionLabel = getOptionLabel(option);
                const isSelected = value.includes(optionValue);
                return (
                  <div
                    key={optionValue}
                    onClick={() => toggleOption(optionValue)}
                    className={cn(
                      "px-3 py-2 text-sm cursor-pointer flex items-center gap-2",
                      isSelected ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 text-primary border-input rounded focus:ring-primary"
                    />
                    <span className={isSelected ? "font-medium" : ""}>{optionLabel}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground text-center">暂无选项</div>
          )}
        </div>
      )}
    </div>
  );
}
