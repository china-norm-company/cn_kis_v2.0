/**
 * Mock数据生成器
 * 基于真实方案数据生成符合系统格式的Mock数据变体
 */

import { parseRealProtocol, RealProtocolData } from './mockDataParser';

// 真实方案文本（从文件中读取的内容）
const REAL_PROTOCOL_CONTENT = `
精华液结合水光针注射4周临床研究
申办方：XXX（中国）有限公司
研究机构：西藏XXX质量技术服务有限公司
主要研究者：徐X
研究机构方案编号：C25111111
版本号/日期：V4.0-2025年07月21日
研究目的：本研究的目的是连续使用 4 周后评价并比较仅使用测试精华液、测试精华液结合 HA（水光针）注射和仅注射 HA（水光针）这三种情况对改善肤质与皱纹的长期效果。
`;

export interface MockProtocolData {
  id: number;
  name: string;
  code: string;
  description: string;
  file_url: string;
  file_size: number;
  file_type: string;
  status: string;
  create_time: string;
  update_time: string;
  project_id: number;
  project_name: string;
  parsed_data: any;
  parse_error?: string;
  visit_plan_generated?: boolean;
}

// 模板数据配置（用于随机选择）
const TEMPLATE_VARIANTS = [
  {
    templateId: 1,
    name: '精华液结合水光针注射4周临床研究',
    clientName: 'XXX（中国）有限公司',
    priority: 'high',
    expectedStartDate: '2025-01-15',
    expectedEndDate: '2026-04-15',
  },
  {
    templateId: 2,
    name: '美白精华临床功效验证研究',
    clientName: '资生堂',
    priority: 'medium',
    expectedStartDate: '2025-02-01',
    expectedEndDate: '2026-05-01',
  },
  {
    templateId: 3,
    name: '保湿霜功效评估临床试验',
    clientName: '雅诗兰黛',
    priority: 'low',
    expectedStartDate: '2025-03-01',
    expectedEndDate: '2026-06-01',
  },
];

/**
 * 随机选择一个模板并生成parsed_data
 * @param uploadedFileName 用户上传的文件名（用于日志）
 * @returns 随机选中的模板的parsed_data
 */
export function getRandomTemplateParsedData(uploadedFileName?: string): any {
  // 随机选择一个模板
  const randomIndex = Math.floor(Math.random() * TEMPLATE_VARIANTS.length);
  const selectedTemplate = TEMPLATE_VARIANTS[randomIndex];
  
  console.log(`🎲 为文件 "${uploadedFileName}" 随机选择了模板 ${selectedTemplate.templateId}: ${selectedTemplate.name}`);
  console.log('[Mock数据生成] 开始生成 visit_plan，包含 test_time_point 字段');
  
  // 解析真实方案数据
  const realData = parseRealProtocol(REAL_PROTOCOL_CONTENT);
  
  // 生成并返回parsed_data
  const parsedData = generateParsedData(realData, selectedTemplate);
  
  // 验证生成的 test_time_point
  if (parsedData.visit_plan) {
    console.log('[Mock数据生成] 生成的 visit_plan 数量:', parsedData.visit_plan.length);
    const t0Visits = parsedData.visit_plan.filter((v: any) => v.visit_code === 'T0' || v.visit_code === 'Timm' || v.visit_code === 'T1h');
    console.log('[Mock数据生成] T0相关访视点的 test_time_point:', t0Visits.map((v: any) => ({
      visit_code: v.visit_code,
      group_name: v.group_name,
      test_time_point: v.test_time_point
    })));
  }
  
  return parsedData;
}

/**
 * 生成Mock方案数据的变体（已废弃，仅用于向后兼容）
 * @deprecated 不再预生成方案，改为上传时随机选择模板
 */
export function generateMockProtocolVariants(): MockProtocolData[] {
  console.warn('generateMockProtocolVariants() 已废弃，不再预生成方案');
  return [];
}

/**
 * 根据访视点代码和组别生成检测环节名称数组
 * 参考文档2.5.1节的流程表格和详细描述
 * 严格按照真实文档中的操作顺序和组别特定操作生成
 * 返回数组，每个元素是一个检测环节名称
 */
function generateProcessSteps(visitCode: string, groupName: string, _visitIndex: number): string[] {
  const steps: string[] = [];
  
  // T-2W（筛选访视）- 所有组别
  if (visitCode === 'T-2W') {
    steps.push('签署知情及肖像使用授权书');
    steps.push('完成入排标准（初筛）');
    steps.push('病史调查');
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估（Screening）');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品分发（基础产品分发）');
    return steps;
  }
  
  // T0（基线访视）- 所有组别
  if (visitCode === 'T0') {
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    
    // 组1在T0使用测试产品（在现场涂抹测试精华）
    if (groupName === '组1') {
      steps.push('使用测试产品');
    }
    
    // 组2、组3在T0注射HA（在医疗美容机构注射）
    if (groupName === '组2' || groupName === '组3') {
      steps.push('注射HA（水光针）');
    }
    
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品分发（基础产品分发）');
    return steps;
  }
  
  // Timm（组1产品使用后即刻）- 仅组1
  if (visitCode === 'Timm') {
    // Timm是在T0使用测试产品后立即进行的检测，不需要洁面和静坐
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    return steps;
  }
  
  // T1h（产品使用/注射后1小时）- 所有组别
  if (visitCode === 'T1h') {
    // T1h是在T0后1小时进行的检测，不需要洁面和静坐
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    
    // 组2、组3在T1h测量后使用辅助面膜
    if (groupName === '组2' || groupName === '组3') {
      steps.push('使用辅助面膜');
    }
    
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    return steps;
  }
  
  // T1D（产品使用/注射后1天）- 所有组别
  if (visitCode === 'T1D') {
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品称重（基础产品称重）');
    return steps;
  }
  
  // T3D（产品使用/注射后3天）- 所有组别
  if (visitCode === 'T3D') {
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品称重（基础产品及测试产品称重）');
    return steps;
  }
  
  // T7D（产品使用/注射后7天）- 所有组别
  if (visitCode === 'T7D') {
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    steps.push('检查产品及产品使用日志（第7天随访）');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品称重（基础产品及测试产品称重）');
    return steps;
  }
  
  // T14D（产品使用/注射后14天）- 所有组别
  if (visitCode === 'T14D') {
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    steps.push('检查产品及产品使用日志（第14天随访）');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品称重（基础产品及测试产品称重）');
    return steps;
  }
  
  // T21D（产品使用/注射后21天）- 所有组别
  if (visitCode === 'T21D') {
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    steps.push('检查产品及产品使用日志（第21天随访）');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品称重（基础产品及测试产品称重）');
    return steps;
  }
  
  // T28D（产品使用/注射后28天）- 所有组别
  if (visitCode === 'T28D') {
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    steps.push('检查并回收产品及产品使用日志');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品称重/回收（基础产品及测试产品称重/回收）');
    return steps;
  }
  
  // T56D（产品使用后56天）- 仅组1
  if (visitCode === 'T56D') {
    steps.push('辅助洗面奶洁面');
    steps.push('静坐平衡30分钟');
    steps.push('临床评估');
    steps.push('VISIA-7拍摄');
    steps.push('Vectra-H2/Vectra-M3拍摄');
    steps.push('Antera 3D局部皱纹及毛孔测量');
    steps.push('Corneometer皮肤水分测量');
    steps.push('Vapometer皮肤经皮水分流失测量');
    steps.push('Cutometer皮肤弹性测量');
    steps.push('检查并回收产品及产品使用日志');
    steps.push('依从性检查');
    steps.push('AE/SAE报告');
    steps.push('测试产品及辅助产品称重/回收（基础产品及测试产品称重/回收）');
    steps.push('研究结束');
    return steps;
  }
  
  // 默认情况：标准检测流程（用于未知访视点）
  steps.push('辅助洗面奶洁面');
  steps.push('静坐平衡30分钟');
  steps.push('临床评估');
  steps.push('VISIA-7拍摄');
  steps.push('Vectra-H2/Vectra-M3拍摄');
  steps.push('Antera 3D局部皱纹及毛孔测量');
  steps.push('Corneometer皮肤水分测量');
  steps.push('Vapometer皮肤经皮水分流失测量');
  steps.push('Cutometer皮肤弹性测量');
  steps.push('依从性检查');
  steps.push('AE/SAE报告');
  
  return steps;
}

/**
 * 生成解析后的数据结构
 */
function generateParsedData(realData: RealProtocolData, variant: any) {
  return {
    project_info: {
      project_no: variant.code,
      research_purpose: realData.studyPurpose,
      sponsor: variant.clientName,
      research_institution: realData.basicInfo.researchInstitution,
      principal_investigator: realData.basicInfo.principalInvestigator,
      protocol_version: realData.basicInfo.version,
      priority: variant.priority,
      expected_start_date: variant.expectedStartDate,
      expected_end_date: variant.expectedEndDate,
      execution_period: `${variant.expectedStartDate} - ${variant.expectedEndDate}`,
      client_expected_delivery_date: calculateDeliveryDate(variant.expectedEndDate),
    },
    
    site_plan: {
      site_requirements: '需要符合GCP标准的临床试验场地，具备完善的受试者接待区、测试区、等候区',
      temperature: '21±1℃',
      humidity: '45±5%',
      dark_room: '需要（用于VISIA拍摄）',
    },
    
    sample_plan: {
      total_samples: realData.groups.reduce((sum, g) => sum + g.sampleSize, 0),
      groups: realData.groups,
    },
    
    recruitment_plan: realData.groups.map((group) => {
      // 根据组别生成不同的受试者来访注意事项
      let subjectVisitNotes = '测试开始前1周内及测试期间无任何户外暴晒、游泳等行为；\n研究参与者到访前仅用清水洗脸，脸部不使用任何化妆品及护肤品；\n每次到访：在到达现场之前，不要使用任何产品，包括基础洗面奶、测试精华、基础面霜和基础防晒。只能用清水洗脸。';
      
      if (group.groupName === '组2' || group.groupName === '组3') {
        subjectVisitNotes += '\n访视当天需做好物理防晒，工作人员安排打车来回。';
      }
      
      return {
        group_name: group.groupName,
        sample_size: String(group.sampleSize),
        age_range: '25-40岁',
        age_quota: '25-32岁占50%，33-40岁占50%',
        gender_requirement: '女性',
        gender_quota: '100%女性',
        skin_type: '中性、干性、混合性',
        skin_type_quota: '中性30%、干性40%、混合性30%',
        backup_count: String(Math.ceil(group.sampleSize * 0.2)),
        inclusion_criteria: '年龄25-40岁健康女性；自述面部皮肤缺乏水分、光泽度；签署知情同意书',
        exclusion_criteria: '孕妇、哺乳期妇女；面部有开放性伤口或皮肤病；对化妆品成分过敏',
        subject_visit_notes: subjectVisitNotes,
      };
    }),
    
    visit_plan: (() => {
      // 为每个组别生成对应的访视计划，将检测环节拆分成多行
      // 访视时间点是日期级别的，当日测试时间点是时间段级别的
      const visitPlanItems: any[] = [];
      let lastTestTimePoint: string | null = null;
      let sequenceCounter = 1;
      
      realData.visits.forEach((visit, visitIndex) => {
        visit.groups.forEach((groupName) => {
          // 确定当日测试时间点
          // 访视时间点是日期级别的，当日测试时间点是时间段级别的
          // 例如：visit_time_point = "第1天(T1D)"，test_time_point = "Timm" 或其他测试时间点
          let testTimePoint: string;
          
          // T0 这一天有多个测试时间点：T0（基础值）、Timm（组1）、T1h（所有组别）
          if (visit.visitCode === 'T0') {
            // T0 是基础值，所有组别都有
            testTimePoint = 'T0（基础值）';
          } else if (visit.visitCode === 'Timm') {
            // Timm 是组1在T0当天的即刻测试
            testTimePoint = 'Timm（产品使用后即刻）';
          } else if (visit.visitCode === 'T1h') {
            // T1h 是T0当天的1小时后测试
            testTimePoint = 'T1h（产品使用/注射后1小时）';
          } else if (visit.visitCode === 'T-2W' || visit.visitCode === 'T-2w') {
            // T-2w 是筛选访视，当日测试时间点应该是 Timm 或其他测试时间点，而不是 T-2w 本身
            testTimePoint = 'Timm';
          } else if (visit.visitCode === 'T1D') {
            // T1D 的当日测试时间点可能是 Timm、T1h 等，而不是 T1D 本身
            testTimePoint = 'Timm';
          } else if (visit.visitCode === 'T3D') {
            // T3D 的当日测试时间点可能是 Timm、T1h 等，而不是 T3D 本身
            testTimePoint = 'Timm';
          } else if (visit.visitCode === 'T7D') {
            // T7D 的当日测试时间点可能是 Timm、T1h 等，而不是 T7D 本身
            testTimePoint = 'Timm';
          } else if (visit.visitCode === 'T14D') {
            // T14D 的当日测试时间点可能是 Timm、T1h 等，而不是 T14D 本身
            testTimePoint = 'Timm';
          } else if (visit.visitCode === 'T21D') {
            // T21D 的当日测试时间点可能是 Timm、T1h 等，而不是 T21D 本身
            testTimePoint = 'Timm';
          } else if (visit.visitCode === 'T28D') {
            // T28D 的当日测试时间点可能是 Timm、T1h 等，而不是 T28D 本身
            testTimePoint = 'Timm';
          } else if (visit.visitCode === 'T56D') {
            // T56D 的当日测试时间点可能是 Timm、T1h 等，而不是 T56D 本身
            testTimePoint = 'Timm';
          } else {
            // 其他未明确指定的访视点，使用 Timm 作为默认测试时间点
            // 确保 test_time_point 与 visit_time_point 不同
            testTimePoint = 'Timm';
          }
          
          // 如果 test_time_point 改变，重置 visit_sequence 为 1
          if (lastTestTimePoint !== testTimePoint) {
            sequenceCounter = 1;
            lastTestTimePoint = testTimePoint;
          }
          
          // 确定访视时间点（日期级别）
          // 如果 visitCode 是 Timm 或 T1h，它们的 visit_time_point 应该是 T0（因为它们都在T0这一天）
          let visitTimePoint: string;
          if (visit.visitCode === 'Timm' || visit.visitCode === 'T1h') {
            visitTimePoint = '基线访视(T0)';  // 它们都属于T0这一天
          } else {
            visitTimePoint = `${visit.visitName}(${visit.visitCode})`;
          }
          
          // 获取检测环节数组
          const processSteps = generateProcessSteps(visit.visitCode, groupName, visitIndex);
          
          // 为每个检测环节创建一行数据
          processSteps.forEach((processStep) => {
            const visitPlanItem = {
              group_name: groupName,
              visit_code: visit.visitCode,  // ✅ 明确的访视编码字段，确保与equipment_plan中的编码一致
              visit_time_point: visitTimePoint,  // ✅ 日期级别的访视时间点
              test_time_point: testTimePoint,  // ✅ 时间段级别的当日测试时间点
              visit_sequence: String(sequenceCounter++),  // ✅ 按照检测环节的顺序从1开始排列
              visit_type: '现场访视',
              allowed_window_deviation: visit.windowDays > 0 ? `±${visit.windowDays}天` : '±0天',
              day_offset: visit.dayOffset,
              is_interim_delivery: false,
              process_steps: processStep,  // ✅ 单个检测环节名称
            };
            
            visitPlanItems.push(visitPlanItem);
          });
          
          // 调试日志：确认 test_time_point 的值
          if (visit.visitCode === 'T0' || visit.visitCode === 'Timm' || visit.visitCode === 'T1h') {
            console.log(`[Mock数据生成] visitCode: ${visit.visitCode}, groupName: ${groupName}, test_time_point: ${testTimePoint}, processSteps: ${processSteps.length}`);
          }
        });
      });
      
      return visitPlanItems;
    })(),
    
    equipment_plan: realData.equipments.map((equipment) => ({
      test_indicator: equipment.testIndicator,
      test_equipment: equipment.equipmentName,
      test_location: equipment.testLocation,
      test_point: '按照标准流程测量',
      measurement_frequency: '3',
      parameters: '按照设备标准参数',
      visit_time_point: equipment.visitPoints.join(', '),
    })),
    
    evaluation_plan: realData.evaluations.map((evaluation) => ({
      evaluator_category: evaluation.evaluatorCategory,
      evaluation_category: evaluation.evaluationCategory,
      evaluation_indicator: evaluation.evaluationIndicator,
      visit_time_point: evaluation.visitPoints.join(', '),
    })),
    
    consumables_plan: [
      {
        consumable_name: '医用棉签',
        quantity: '2000支',
        special_requirements: '医用级别，无菌独立包装',
        visit_points: '所有访视点',
        usage_scenario: '皮肤清洁、样本采集',
        usage_requirements: '一次性使用，用后即弃',
      },
      {
        consumable_name: '一次性手套',
        quantity: '500双',
        special_requirements: '医用乳胶手套，无粉',
        visit_points: '所有访视点',
        usage_scenario: '操作人员防护',
        usage_requirements: '每次操作更换',
      },
      {
        consumable_name: '酒精消毒棉片',
        quantity: '1000片',
        special_requirements: '75%医用酒精，独立包装',
        visit_points: '所有访视点',
        usage_scenario: '设备消毒、测试部位消毒',
        usage_requirements: '每次测试前使用',
      },
    ],
    
    auxiliary_measurement_plan: [
      {
        operation_name: '面部清洁',
        operation_location: '全面部',
        operation_method: '使用指定卸妆液和洁面乳，温水清洗，一次性面巾擦干',
        visit_time_point: '所有访视点测试前',
      },
      {
        operation_name: '环境适应',
        operation_location: '测试室',
        operation_method: '受试者在恒温恒湿环境中静坐休息30分钟',
        visit_time_point: '所有访视点测试前',
      },
    ],
    
    special_requirements: {
      personnel_qualification: '需要持证皮肤科医生；仪器操作人员需经过专业培训并获得操作证书',
      client_equipment: '客户提供VISIA设备及原装耗材',
      other_requirements: '测试前24小时内避免使用其他功效型化妆品；测试前2小时避免洗脸',
    },
    
    timeline: {
      recruitment_start: realData.timeline.recruitmentStart,
      test_start: realData.timeline.testStart,
      test_end: realData.timeline.testEnd,
      report_deadline: realData.timeline.reportDeadline,
    },
  };
}

/**
 * 计算交付日期（测试结束后2周）
 */
function calculateDeliveryDate(endDate: string): string {
  const date = new Date(endDate);
  date.setDate(date.getDate() + 14);
  return date.toISOString().split('T')[0];
}
