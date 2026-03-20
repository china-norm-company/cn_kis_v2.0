import { RadarChart as RechartsRadar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";

interface RadarDataPoint {
  subject: string;    // 维度名称
  value: number;      // 数值
  fullMark: number;   // 满分值
}

interface RadarChartProps {
  title?: string;
  description?: string;
  data: RadarDataPoint[];
  height?: number;
  fillColor?: string;
  strokeColor?: string;
  fillOpacity?: number;
  onDimensionClick?: (dimension: string) => void;
}

export const RadarChart = ({
  title,
  description,
  data,
  height = 400,
  fillColor = "#8884d8",
  strokeColor = "#8884d8",
  fillOpacity = 0.6,
  onDimensionClick,
}: RadarChartProps) => {
  const handleClick = (data: any) => {
    if (onDimensionClick && data && data.payload) {
      onDimensionClick(data.payload.subject);
    }
  };

  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <RechartsRadar data={data}>
            <PolarGrid />
            <PolarAngleAxis 
              dataKey="subject"
              onClick={handleClick}
              style={{ cursor: onDimensionClick ? 'pointer' : 'default' }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 'dataMax']} />
            <Radar
              name="评分"
              dataKey="value"
              stroke={strokeColor}
              fill={fillColor}
              fillOpacity={fillOpacity}
            />
            <Tooltip
              formatter={(value: number, name: string, props: any) => {
                const fullMark = props.payload.fullMark;
                const percentage = fullMark > 0 ? Math.round((value / fullMark) * 100) : 0;
                return [`${value}/${fullMark} (${percentage}%)`, name];
              }}
            />
            <Legend />
          </RechartsRadar>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

// 多系列雷达图（对比多个对象）
interface MultiRadarChartProps {
  title?: string;
  description?: string;
  data: RadarDataPoint[];
  series: {
    name: string;
    dataKey: string;
    color: string;
  }[];
  height?: number;
}

export const MultiRadarChart = ({
  title,
  description,
  data,
  series,
  height = 400,
}: MultiRadarChartProps) => {
  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <RechartsRadar data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis angle={90} domain={[0, 'dataMax']} />
            {series.map((s, index) => (
              <Radar
                key={index}
                name={s.name}
                dataKey={s.dataKey}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.4}
              />
            ))}
            <Tooltip />
            <Legend />
          </RechartsRadar>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

// 客户健康度雷达图数据示例
export const createCustomerHealthRadarData = (customer: any): RadarDataPoint[] => {
  return [
    {
      subject: "合作时长",
      value: customer.cooperation_months || 0,
      fullMark: 36, // 3年
    },
    {
      subject: "项目数量",
      value: customer.project_count || 0,
      fullMark: 20,
    },
    {
      subject: "营收贡献",
      value: Math.min((customer.total_revenue || 0) / 10000, 100), // 单位：万元
      fullMark: 100,
    },
    {
      subject: "满意度",
      value: (customer.satisfaction_score || 0) * 20, // 5分制转100分制
      fullMark: 100,
    },
    {
      subject: "响应度",
      value: (customer.response_rate || 0) * 100,
      fullMark: 100,
    },
    {
      subject: "付款及时性",
      value: (customer.payment_timeliness || 0) * 100,
      fullMark: 100,
    },
  ];
};

// 项目质量雷达图数据示例
export const createProjectQualityRadarData = (project: any): RadarDataPoint[] => {
  return [
    {
      subject: "进度完成度",
      value: project.progress || 0,
      fullMark: 100,
    },
    {
      subject: "数据质量",
      value: project.data_quality_score || 0,
      fullMark: 100,
    },
    {
      subject: "合规性",
      value: project.compliance_score || 0,
      fullMark: 100,
    },
    {
      subject: "受试者满意度",
      value: (project.subject_satisfaction || 0) * 20,
      fullMark: 100,
    },
    {
      subject: "客户满意度",
      value: (project.client_satisfaction || 0) * 20,
      fullMark: 100,
    },
    {
      subject: "成本控制",
      value: project.cost_control_score || 0,
      fullMark: 100,
    },
  ];
};
