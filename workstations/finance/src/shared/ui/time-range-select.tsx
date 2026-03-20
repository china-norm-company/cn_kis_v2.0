/**
 * 时间维度选择：本月/本季/本年/自定义（自定义时显示起止日期）
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { DateRangePeriod } from "@/shared/lib/dateRange";

const PERIOD_OPTIONS: { value: DateRangePeriod; label: string }[] = [
  { value: "month", label: "本月" },
  { value: "quarter", label: "本季" },
  { value: "year", label: "本年" },
  { value: "custom", label: "自定义" },
];

interface TimeRangeSelectProps {
  period: DateRangePeriod;
  onPeriodChange: (period: DateRangePeriod) => void;
  customStart?: string;
  customEnd?: string;
  onCustomStartChange?: (v: string) => void;
  onCustomEndChange?: (v: string) => void;
  className?: string;
}

export function TimeRangeSelect({
  period,
  onPeriodChange,
  customStart = "",
  customEnd = "",
  onCustomStartChange,
  onCustomEndChange,
  className,
}: TimeRangeSelectProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={(v) => onPeriodChange(v as DateRangePeriod)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="时间范围" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-slate-600 whitespace-nowrap">开始</Label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => onCustomStartChange?.(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-slate-600 whitespace-nowrap">结束</Label>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => onCustomEndChange?.(e.target.value)}
                className="w-[140px]"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
