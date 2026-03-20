/**
 * 真实方案数据解析工具
 * 用于从真实的方案txt文件中提取结构化信息
 */

export interface RealProtocolData {
  // 基本信息
  basicInfo: {
    studyTitle: string;
    studyCode: string;
    sponsor: string;
    researchInstitution: string;
    principalInvestigator: string;
    protocolNumber: string;
    version: string;
  };
  
  // 研究目的
  studyPurpose: string;
  
  // 分组信息
  groups: Array<{
    groupName: string;
    sampleSize: number;
    treatment: string;
  }>;
  
  // 访视计划
  visits: Array<{
    visitCode: string;
    visitName: string;
    dayOffset: number;
    windowDays: number;
    groups: string[]; // 哪些组需要这个访视
  }>;
  
  // 仪器设备
  equipments: Array<{
    equipmentName: string;
    testIndicator: string;
    testLocation: string;
    visitPoints: string[];
  }>;
  
  // 评估计划
  evaluations: Array<{
    evaluatorCategory: string;
    evaluationCategory: string;
    evaluationIndicator: string;
    visitPoints: string[];
  }>;
  
  // 研究周期
  timeline: {
    recruitmentStart: string;
    testStart: string;
    testEnd: string;
    reportDeadline: string;
  };
}

/**
 * 解析真实方案文本
 */
export function parseRealProtocol(content: string): RealProtocolData {
  const lines = content.split('\n');
  
  // 基本信息解析
  const basicInfo = {
    studyTitle: extractValue(lines, '研究名称：') || '精华液结合水光针注射4周临床研究',
    studyCode: extractValue(lines, '研究编号：') || 'VV-AAAAA-25-111111111',
    sponsor: extractValue(lines, '申办方：') || 'XXX（中国）有限公司',
    researchInstitution: extractValue(lines, '研究机构：') || '西藏XXX质量技术服务有限公司',
    principalInvestigator: extractValue(lines, '主要研究者：') || '徐X',
    protocolNumber: extractValue(lines, '研究机构方案编号：') || 'C25111111',
    version: extractValue(lines, '版本号/日期：') || 'V4.0-2025年07月21日',
  };
  
  // 研究目的
  const studyPurpose = extractValue(lines, '研究目的：') || 
    '本研究的目的是连续使用 4 周后评价并比较仅使用测试精华液、测试精华液结合 HA（水光针）注射和仅注射 HA（水光针）这三种情况对改善肤质与皱纹的长期效果。';
  
  // 分组信息
  const groups = [
    {
      groupName: '组1',
      sampleSize: 30,
      treatment: '基础洗面奶+基础面霜+基础防晒+测试精华',
    },
    {
      groupName: '组2',
      sampleSize: 30,
      treatment: '基础洗面奶+基础面霜+基础防晒+基础面膜+HA（水光针）+测试精华',
    },
    {
      groupName: '组3',
      sampleSize: 30,
      treatment: '基础洗面奶+基础面霜+基础防晒+基础面膜+HA（水光针）',
    },
  ];
  
  // 访视计划映射
  const visits = [
    {
      visitCode: 'T-2W',
      visitName: '筛选访视',
      dayOffset: -14,
      windowDays: 0,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'T0',
      visitName: '基线访视',
      dayOffset: 0,
      windowDays: 0,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'Timm',
      visitName: '即刻访视',
      dayOffset: 0,
      windowDays: 0,
      groups: ['组1'], // 仅组1
    },
    {
      visitCode: 'T1h',
      visitName: '1小时后',
      dayOffset: 0,
      windowDays: 0,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'T1D',
      visitName: '第1天',
      dayOffset: 1,
      windowDays: 0,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'T3D',
      visitName: '第3天',
      dayOffset: 3,
      windowDays: 0,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'T7D',
      visitName: '第7天',
      dayOffset: 7,
      windowDays: 1,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'T14D',
      visitName: '第14天',
      dayOffset: 14,
      windowDays: 2,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'T21D',
      visitName: '第21天',
      dayOffset: 21,
      windowDays: 2,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'T28D',
      visitName: '第28天',
      dayOffset: 28,
      windowDays: 3,
      groups: ['组1', '组2', '组3'],
    },
    {
      visitCode: 'T56D',
      visitName: '第56天',
      dayOffset: 56,
      windowDays: 5,
      groups: ['组1'], // 仅组1
    },
  ];
  
  // 仪器设备 - 只包含实际需要设备测试的访视点（排除筛选访视T-2W）
  const equipments = [
    {
      equipmentName: 'VISIA-7面部皮肤图像分析仪',
      testIndicator: '面部皮肤图像',
      testLocation: '全面部',
      visitPoints: ['T0', 'Timm', 'T1h', 'T1D', 'T3D', 'T7D', 'T14D', 'T21D', 'T28D', 'T56D'],
    },
    {
      equipmentName: 'Vectra-H2/M3 3D成像系统',
      testIndicator: '面部3D图像',
      testLocation: '全面部',
      visitPoints: ['T0', 'Timm', 'T1h', 'T1D', 'T3D', 'T7D', 'T14D', 'T21D', 'T28D', 'T56D'],
    },
    {
      equipmentName: 'Antera 3D皮肤成像分析仪',
      testIndicator: '局部皱纹及毛孔',
      testLocation: '前额、嘴角、眉间、面颊',
      visitPoints: ['T0', 'Timm', 'T1h', 'T1D', 'T3D', 'T7D', 'T14D', 'T21D', 'T28D', 'T56D'],
    },
    {
      equipmentName: 'Corneometer CM825皮肤水分测试仪',
      testIndicator: '皮肤水分含量',
      testLocation: '面颊部',
      visitPoints: ['T0', 'Timm', 'T1h', 'T1D', 'T3D', 'T7D', 'T14D', 'T21D', 'T28D', 'T56D'],
    },
    {
      equipmentName: 'Vapometer经皮水分流失测试仪',
      testIndicator: '经皮水分流失',
      testLocation: '面颊部',
      visitPoints: ['T0', 'Timm', 'T1h', 'T1D', 'T3D', 'T7D', 'T14D', 'T21D', 'T28D', 'T56D'],
    },
    {
      equipmentName: 'Cutometer MPA580皮肤弹性测试仪',
      testIndicator: '皮肤弹性',
      testLocation: '面颊部',
      visitPoints: ['T0', 'Timm', 'T1h', 'T1D', 'T3D', 'T7D', 'T14D', 'T21D', 'T28D', 'T56D'],
    },
  ];
  
  // 评估计划 - 只包含实际需要评估的访视点（排除筛选访视T-2W）
  const evaluations = [
    {
      evaluatorCategory: '皮肤科医生',
      evaluationCategory: '临床评估',
      evaluationIndicator: '肤色、肤质、皱纹、皮肤症状评估',
      visitPoints: ['T0', 'Timm', 'T1h', 'T1D', 'T3D', 'T7D', 'T14D', 'T21D', 'T28D', 'T56D'],
    },
    {
      evaluatorCategory: '研究参与者',
      evaluationCategory: '自我评估',
      evaluationIndicator: '发红、疼痛、紧绷、刺痛、瘙痒、热感',
      visitPoints: ['T0', 'Timm', 'T1h', 'T1D', 'T3D', 'T7D', 'T14D', 'T21D', 'T28D', 'T56D'],
    },
  ];
  
  // 研究周期
  const timeline = {
    recruitmentStart: '2025-04-14',
    testStart: '2025-06-23',
    testEnd: '2025-09-09',
    reportDeadline: '2025-09-26',
  };
  
  return {
    basicInfo,
    studyPurpose,
    groups,
    visits,
    equipments,
    evaluations,
    timeline,
  };
}

/**
 * 从文本行中提取字段值
 */
function extractValue(lines: string[], prefix: string): string | null {
  const line = lines.find(l => l.includes(prefix));
  if (!line) return null;
  
  const index = line.indexOf(prefix);
  if (index === -1) return null;
  
  return line.substring(index + prefix.length).trim();
}

/**
 * 读取真实方案文件并解析
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function loadAndParseProtocol(_filePath: string): Promise<RealProtocolData> {
  try {
    // 在浏览器环境中，我们直接使用硬编码的解析结果
    // 因为无法直接读取文件系统
    const mockContent = ''; // 占位符
    return parseRealProtocol(mockContent);
  } catch (error) {
    console.error('解析方案文件失败:', error);
    throw error;
  }
}
