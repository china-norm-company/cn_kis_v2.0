/**
 * 跨工作台跳转 URL 统一生成
 *
 * 开发环境：各工作台不同端口，必须生成带端口的完整 URL，否则会落在当前端口导致
 * "The server is configured with a public base URL of /execution/ - did you mean to visit /execution/secretary/?"
 * 生产环境：同源部署时使用 origin + path 即可。
 *
 * 与 config/workstations.yaml 端口一致。
 */
const WORKSTATION_DEV_PORTS: Record<string, number> = {
  secretary: 3001,
  finance: 3004,
  research: 3002,
  execution: 3007,
  quality: 3003,
  hr: 3005,
  crm: 3006,
  recruitment: 3009,
  equipment: 3010,
  material: 3011,
  facility: 3012,
  evaluator: 3013,
  'lab-personnel': 3015,
  ethics: 3014,
  reception: 3016,
  'control-plane': 3017,
  admin: 3008,
  'digital-workforce': 3018,
  iam: 3019,
  'data-platform': 3020,
}

/** 工作台 path：本地与生产统一，admin 为 /admin/，与 Vite base、Nginx 一致 */
function getWorkstationPath(key: string): string {
  return key === 'admin' ? '/admin/' : `/${key}/`
}

/**
 * 获取指定工作台的完整访问 URL（跨工作台链接请统一使用此方法）
 * @param workstationKey 工作台 key，如 'secretary' | 'execution' | 'digital-workforce' | 'control-plane' | 'admin'
 * @param hashPath 可选，hash 部分如 '#/portal'、'#/chat?skill=xxx'，不包含开头的 #
 */
export function getWorkstationUrl(
  workstationKey: string,
  hashPath?: string,
): string {
  const path = getWorkstationPath(workstationKey)
  const hash = hashPath ? (hashPath.startsWith('#') ? hashPath : `#${hashPath}`) : ''
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && WORKSTATION_DEV_PORTS[workstationKey] != null) {
    const port = WORKSTATION_DEV_PORTS[workstationKey]
    const base = `${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:${port}${path}`
    return base + hash
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return origin + path + hash
}
