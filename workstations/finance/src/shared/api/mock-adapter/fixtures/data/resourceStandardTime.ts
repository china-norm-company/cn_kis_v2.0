/**
 * 资源标准工时模拟数据
 * 定义不同设备和评估类型的标准工时（单位：分钟）
 */

/**
 * 设备标准工时配置
 * key: 设备名称关键词（用于匹配）
 * value: 单次测量的标准工时（分钟）
 */
export const EQUIPMENT_STANDARD_TIME: Record<string, number> = {
  // 皮肤水分测试设备
  'Corneometer': 15,
  'CM825': 15,
  '皮肤水分': 15,
  
  // 皮肤弹性测试设备
  'Cutometer': 20,
  'MPA580': 20,
  '皮肤弹性': 20,
  
  // 黑色素测试设备
  'Mexameter': 12,
  'MX18': 12,
  '黑色素': 12,
  
  // 面部图像分析设备
  'VISIA': 25,
  'Complexion Analysis': 25,
  '面部图像': 25,
  '图像分析': 25,
  
  // 皮肤粗糙度测试
  'Primos': 18,
  '粗糙度': 18,
  
  // 经皮失水率测试
  'Tewameter': 15,
  'TM300': 15,
  '经皮失水': 15,
  
  // 皮肤pH值测试
  'Skin-pH-Meter': 8,
  'pH': 8,
  
  // 皮肤油脂测试
  'Sebumeter': 10,
  'SM815': 10,
  '皮肤油脂': 10,
  
  // 皮肤颜色测试
  'Chromameter': 12,
  'CR-400': 12,
  '皮肤颜色': 12,
  
  // 皮肤光泽度测试
  'Glossymeter': 10,
  'GL200': 10,
  '光泽度': 10,
  
  // 默认设备工时
  'default': 15,
};

/**
 * 评估类型标准工时配置
 * key: 评估类型关键词（用于匹配）
 * value: 单次评估的标准工时（分钟）
 */
export const EVALUATOR_STANDARD_TIME: Record<string, number> = {
  // 医学评估
  '医学评估': 30,
  '医生评估': 30,
  '临床医生': 30,
  
  // 量表评估
  '量表评估': 20,
  '问卷评估': 20,
  '心理评估': 25,
  
  // 专业评估
  '专业评估': 25,
  '皮肤科医生': 35,
  '美容师': 20,
  
  // 自我评估
  '自我评估': 10,
  '受试者评估': 10,
  
  // 影像学评估
  '影像学评估': 20,
  '照片评估': 15,
  
  // 实验室评估
  '实验室评估': 40,
  '生化指标': 30,
  
  // 默认评估工时
  'default': 20,
};

/**
 * 根据设备名称获取标准工时
 * @param equipmentName 设备名称
 * @returns 标准工时（分钟）
 */
export function getEquipmentStandardTime(equipmentName: string): number {
  if (!equipmentName) return EQUIPMENT_STANDARD_TIME['default'];
  
  // 遍历配置，查找匹配的关键词
  for (const [keyword, time] of Object.entries(EQUIPMENT_STANDARD_TIME)) {
    if (keyword !== 'default' && equipmentName.includes(keyword)) {
      return time;
    }
  }
  
  return EQUIPMENT_STANDARD_TIME['default'];
}

/**
 * 根据评估类型获取标准工时
 * @param evaluatorType 评估类型
 * @returns 标准工时（分钟）
 */
export function getEvaluatorStandardTime(evaluatorType: string): number {
  if (!evaluatorType) return EVALUATOR_STANDARD_TIME['default'];
  
  // 遍历配置，查找匹配的关键词
  for (const [keyword, time] of Object.entries(EVALUATOR_STANDARD_TIME)) {
    if (keyword !== 'default' && evaluatorType.includes(keyword)) {
      return time;
    }
  }
  
  return EVALUATOR_STANDARD_TIME['default'];
}

/**
 * 计算访视点的总资源需求时间
 * @param equipments 设备需求列表
 * @param evaluators 评估需求列表
 * @returns 总工时（分钟）
 */
export function calculateResourceTime(
  equipments: Array<{ equipmentName: string; measurementCount?: string | number }>,
  evaluators: Array<{ evaluationType: string }>
): number {
  let totalTime = 0;
  
  // 计算设备工时：设备标准工时 × 测量次数
  equipments.forEach(eq => {
    const baseTime = getEquipmentStandardTime(eq.equipmentName);
    const count = parseFloat(String(eq.measurementCount || 1));
    totalTime += baseTime * (isNaN(count) ? 1 : count);
  });
  
  // 计算评估工时
  evaluators.forEach(ev => {
    totalTime += getEvaluatorStandardTime(ev.evaluationType);
  });
  
  return Math.round(totalTime);
}

