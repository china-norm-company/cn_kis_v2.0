import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";

interface GanttTask {
  name: string;       // 任务名称
  start: string;      // 开始时间 (ISO格式)
  end: string;        // 结束时间 (ISO格式)
  progress?: number;  // 进度 (0-100)
  category?: string;  // 分类
  dependencies?: string[];  // 依赖任务
}

interface GanttChartProps {
  title?: string;
  description?: string;
  tasks: GanttTask[];
  height?: number;
  onTaskClick?: (task: GanttTask) => void;
}

export const GanttChart = ({
  title,
  description,
  tasks,
  height = 400,
  onTaskClick,
}: GanttChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // 初始化图表实例
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // 提取类别（项目或任务组）
    const categories = Array.from(new Set(tasks.map((task) => task.category || "默认")));

    // 转换数据格式
    const seriesData = tasks.map((task) => {
      const start = new Date(task.start).getTime();
      const end = new Date(task.end).getTime();
      const categoryIndex = categories.indexOf(task.category || "默认");

      return {
        name: task.name,
        value: [categoryIndex, start, end, end - start],
        itemStyle: {
          normal: {
            color: task.progress !== undefined ? getProgressColor(task.progress) : "#5470C6",
          },
        },
        task: task,
      };
    });

    const option: echarts.EChartsOption = {
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as { data?: { task?: GanttTask } };
          if (!p.data?.task) return '';
          const task = p.data.task;
          const start = new Date(task.start).toLocaleDateString("zh-CN");
          const end = new Date(task.end).toLocaleDateString("zh-CN");
          const duration = Math.ceil(
            (new Date(task.end).getTime() - new Date(task.start).getTime()) / (1000 * 60 * 60 * 24)
          );

          return `
            <strong>${task.name}</strong><br/>
            开始: ${start}<br/>
            结束: ${end}<br/>
            工期: ${duration}天<br/>
            ${task.progress !== undefined ? `进度: ${task.progress}%<br/>` : ""}
            ${task.category ? `分类: ${task.category}` : ""}
          `;
        },
      },
      grid: {
        left: "15%",
        right: "10%",
        top: "10%",
        bottom: "10%",
      },
      xAxis: {
        type: "time",
        axisLabel: {
          formatter: (value: number) => {
            return echarts.format.formatTime("MM-dd", new Date(value));
          },
        },
      },
      yAxis: {
        type: "category",
        data: categories,
      },
      series: [
        {
          type: "custom",
          renderItem: (_params: unknown, api: unknown) => {
            const a = api as { value: (index: number) => number; coord: (val: [number, number]) => [number, number]; size: (val: [number, number]) => [number, number]; style: () => Record<string, unknown> };
            const categoryIndex = a.value(0);
            const start = a.coord([a.value(1), categoryIndex]);
            const end = a.coord([a.value(2), categoryIndex]);
            const height = a.size([0, 1])[1] * 0.6;

            return {
              type: "rect",
              shape: {
                x: start[0],
                y: start[1] - height / 2,
                width: end[0] - start[0],
                height: height,
              },
              style: {
                ...a.style(),
                strokeWidth: 2,
                stroke: "#fff",
              },
            };
          },
          encode: {
            x: [1, 2],
            y: 0,
          },
          data: seriesData,
        },
      ],
    };

    chartInstance.current.setOption(option);

    // 添加点击事件
    if (onTaskClick) {
      chartInstance.current.on("click", (params: unknown) => {
        const p = params as { data?: { task?: GanttTask } };
        if (p.data?.task) {
          onTaskClick(p.data.task);
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
  }, [tasks, onTaskClick]);

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

// 根据进度返回颜色
const getProgressColor = (progress: number): string => {
  if (progress >= 100) return "#52C41A"; // 绿色
  if (progress >= 75) return "#73D13D";  // 浅绿
  if (progress >= 50) return "#FAAD14";  // 黄色
  if (progress >= 25) return "#FF7A45";  // 橙色
  return "#FF4D4F";                       // 红色
};

// 项目甘特图数据示例
export const createProjectGanttData = (projects: any[]): GanttTask[] => {
  return projects.map((project) => ({
    name: project.name || project.title,
    start: project.start_date || project.created_at,
    end: project.end_date || project.expected_completion_date,
    progress: project.progress || 0,
    category: project.status || "进行中",
  }));
};

