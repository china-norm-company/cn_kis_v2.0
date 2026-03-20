/**
 * 统一的Mock方案数据源
 * 所有方案都由用户上传时从模板中随机生成
 * 
 * 更新时间: 2025-12-16
 */

import { MockProtocolData } from './mockDataGenerator';

/**
 * 不再预设方案，所有方案由用户上传时动态生成
 */
export const MOCK_PROTOCOLS: MockProtocolData[] = [];

/**
 * 根据ID获取Mock方案
 * 从localStorage读取用户上传的方案
 */
export function getMockProtocolById(id: number): MockProtocolData | undefined {
  const protocols = getMockProtocolsFromLocalStorage();
  return protocols.find(p => p.id === id);
}

/**
 * 根据项目ID获取Mock方案列表
 * 从localStorage读取以包含用户上传的方案
 */
export function getMockProtocolsByProjectId(projectId: number): MockProtocolData[] {
  const protocols = getMockProtocolsFromLocalStorage();
  return protocols.filter(p => p.project_id === projectId);
}

/**
 * 根据状态筛选Mock方案
 * 从localStorage读取以包含用户上传的方案
 */
export function getMockProtocolsByStatus(status: string): MockProtocolData[] {
  const protocols = getMockProtocolsFromLocalStorage();
  return protocols.filter(p => p.status === status);
}

/**
 * 搜索Mock方案（按名称或编号）
 * 从localStorage读取以包含用户上传的方案
 */
export function searchMockProtocols(keyword: string): MockProtocolData[] {
  const protocols = getMockProtocolsFromLocalStorage();
  const lowerKeyword = keyword.toLowerCase();
  return protocols.filter(
    p => 
      p.name.toLowerCase().includes(lowerKeyword) ||
      p.code.toLowerCase().includes(lowerKeyword)
  );
}

/**
 * 更新Mock方案状态
 * 从localStorage读取并更新
 */
export function updateMockProtocolStatus(
  id: number, 
  status: string
): MockProtocolData[] {
  const protocols = getMockProtocolsFromLocalStorage();
  return protocols.map(p => 
    p.id === id ? { ...p, status, update_time: new Date().toISOString() } : p
  );
}

/**
 * 从localStorage读取Mock数据
 * 如果localStorage中没有数据，返回空数组
 */
export function getMockProtocolsFromLocalStorage(): MockProtocolData[] {
  try {
    const data = localStorage.getItem('mock_protocols');
    if (data) {
      const protocols = JSON.parse(data);
      // 确保返回的是数组
      return Array.isArray(protocols) ? protocols : [];
    }
    return [];
  } catch (error) {
    console.error('读取Mock数据失败:', error);
    return [];
  }
}

/**
 * 更新localStorage中的Mock数据
 */
export function updateMockProtocolsInLocalStorage(
  protocols: MockProtocolData[]
): void {
  try {
    localStorage.setItem('mock_protocols', JSON.stringify(protocols));
  } catch (error) {
    console.error('更新Mock数据失败:', error);
  }
}
