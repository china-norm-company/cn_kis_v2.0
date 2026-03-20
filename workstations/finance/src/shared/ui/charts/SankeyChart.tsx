import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";

interface SankeyNode {
  name: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyChartProps {
  title?: string;
  description?: string;
  data: {
    nodes: SankeyNode[];
    links: SankeyLink[];
  };
  height?: number;
  onNodeClick?: (data: any) => void;
}

export const SankeyChart = ({ 
  title, 
  description, 
  data, 
  height = 400,
  onNodeClick 
}: SankeyChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // 初始化图表实例
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; data?: { source?: string; target?: string; value?: number; name?: string } };
          if (p.dataType === "edge" && p.data) {
            return `${p.data.source} → ${p.data.target}<br/>转化数量: ${p.data.value || 0}`;
          }
          return `${p.data?.name || ''}<br/>总量: ${p.data?.value || 0}`;
        },
      },
      series: [
        {
          type: "sankey",
          emphasis: {
            focus: "adjacency",
          },
          data: data.nodes,
          links: data.links,
          lineStyle: {
            color: "gradient",
            curveness: 0.5,
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: "#aaa",
          },
          label: {
            color: "#000",
            fontFamily: "Arial, sans-serif",
          },
        } as echarts.SeriesOption,
      ],
    };

    chartInstance.current.setOption(option);

    // 添加点击事件
    if (onNodeClick) {
      chartInstance.current.on("click", (params: unknown) => {
        const p = params as { dataType?: string; data?: unknown };
        if (p.dataType === "node") {
          onNodeClick(p.data);
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
  }, [data, onNodeClick]);

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

// 销售流程桑基图的数据示例
export const createSalesFunnelSankeyData = (opportunities: any[]) => {
  const stages = ["线索", "商机", "报价", "谈判", "赢单", "流失"];
  
  // 统计各阶段数量
  const stageCounts: Record<string, number> = {};
  stages.forEach(stage => stageCounts[stage] = 0);
  
  opportunities.forEach(opp => {
    if (opp.stage && stageCounts[opp.stage] !== undefined) {
      stageCounts[opp.stage]++;
    }
  });

  // 创建节点
  const nodes: SankeyNode[] = stages.map(stage => ({ name: stage }));

  // 创建连接（模拟转化流）
  const links: SankeyLink[] = [
    { source: "线索", target: "商机", value: stageCounts["商机"] || 0 },
    { source: "线索", target: "流失", value: Math.max(0, (stageCounts["线索"] || 0) - (stageCounts["商机"] || 0)) },
    { source: "商机", target: "报价", value: stageCounts["报价"] || 0 },
    { source: "商机", target: "流失", value: Math.max(0, (stageCounts["商机"] || 0) - (stageCounts["报价"] || 0)) },
    { source: "报价", target: "谈判", value: stageCounts["谈判"] || 0 },
    { source: "报价", target: "流失", value: Math.max(0, (stageCounts["报价"] || 0) - (stageCounts["谈判"] || 0)) },
    { source: "谈判", target: "赢单", value: stageCounts["赢单"] || 0 },
    { source: "谈判", target: "流失", value: Math.max(0, (stageCounts["谈判"] || 0) - (stageCounts["赢单"] || 0)) },
  ].filter(link => link.value > 0);

  return { nodes, links };
};

