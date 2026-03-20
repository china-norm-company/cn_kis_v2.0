import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";

interface HeatmapDataPoint {
  x: string | number; // x轴值（如日期、小时）
  y: string | number; // y轴值（如设备名称、星期）
  value: number;      // 热力值
}

interface HeatmapChartProps {
  title?: string;
  description?: string;
  data: HeatmapDataPoint[];
  xAxisData: (string | number)[];  // x轴类别
  yAxisData: (string | number)[];  // y轴类别
  height?: number;
  visualMap?: {
    min: number;
    max: number;
    inRange?: {
      color?: string[];
    };
  };
  onCellClick?: (data: any) => void;
}

export const HeatmapChart = ({
  title,
  description,
  data,
  xAxisData,
  yAxisData,
  height = 400,
  visualMap,
  onCellClick,
}: HeatmapChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // 初始化图表实例
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // 转换数据格式为 [x, y, value]
    const chartData = data.map((item) => {
      const xIndex = xAxisData.indexOf(item.x);
      const yIndex = yAxisData.indexOf(item.y);
      return [xIndex, yIndex, item.value || 0];
    });

    const option: echarts.EChartsOption = {
      tooltip: {
        position: "top",
        formatter: (params: unknown) => {
          const p = params as { value?: [number, number, number] };
          if (!p.value || p.value.length < 3) return '';
          const xValue = xAxisData[p.value[0]];
          const yValue = yAxisData[p.value[1]];
          const value = p.value[2];
          return `${yValue} - ${xValue}<br/>使用次数: ${value}`;
        },
      },
      grid: {
        left: "10%",
        right: "10%",
        top: "10%",
        bottom: "15%",
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        splitArea: {
          show: true,
        },
      },
      yAxis: {
        type: "category",
        data: yAxisData,
        splitArea: {
          show: true,
        },
      },
      visualMap: {
        min: visualMap?.min || 0,
        max: visualMap?.max || 100,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: "0%",
        inRange: {
          color: visualMap?.inRange?.color || [
            "#E0F3FF",
            "#A8D8F0",
            "#6BB6E0",
            "#3A95D1",
            "#0066CC",
          ],
        },
      },
      series: [
        {
          name: "热力值",
          type: "heatmap",
          data: chartData,
          label: {
            show: true,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
    };

    chartInstance.current.setOption(option);

    // 添加点击事件
    if (onCellClick) {
      chartInstance.current.on("click", (params: unknown) => {
        const p = params as { componentType?: string; value?: [number, number, number] };
        if (p.componentType === "series" && p.value && p.value.length >= 3) {
          onCellClick({
            x: xAxisData[p.value[0]],
            y: yAxisData[p.value[1]],
            value: p.value[2],
          });
        }
      });
    }

    // 响应式
    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [data, xAxisData, yAxisData, visualMap, onCellClick]);

  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <div ref={chartRef} className="w-full" style={{ height: `${height}px` }} />
      </CardContent>
    </Card>
  );
};

// 设备使用热力图数据示例
export const createEquipmentUsageHeatmapData = (usageRecords: any[]) => {
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  // 初始化热力图数据
  const heatmapData: HeatmapDataPoint[] = [];

  hours.forEach((hour, hourIndex) => {
    days.forEach((day, dayIndex) => {
      // 统计该时间段的使用次数
      const count = usageRecords.filter((record) => {
        const recordDate = new Date(record.start_time);
        const recordHour = recordDate.getHours();
        const recordDay = recordDate.getDay();
        return recordHour === hourIndex && recordDay === dayIndex + 1;
      }).length;

      heatmapData.push({
        x: hour,
        y: day,
        value: count,
      });
    });
  });

  return {
    data: heatmapData,
    xAxisData: hours,
    yAxisData: days,
    visualMap: {
      min: 0,
      max: Math.max(...heatmapData.map((d) => d.value), 10),
    },
  };
};

