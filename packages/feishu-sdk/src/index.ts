/**
 * @cn-kis/feishu-sdk - 飞书认证、JSSDK 封装与权限管理
 *
 * 所有飞书 H5 工作台共享此认证 + 权限逻辑
 */

// 认证
export { FeishuAuth, AuthError, type FeishuAuthConfig, type FeishuUser, type AuthErrorType, type AuthResult } from './auth'
export { createWorkstationFeishuConfig } from './config'
export { useFeishuAuth } from './hooks/useFeishuAuth'
export { FeishuAuthProvider, useFeishuContext } from './provider'
export { LoginFallback } from './components/LoginFallback'

// 权限
export { useAuthProfile, type AuthProfile, type RoleInfo } from './hooks/useAuthProfile'
export { PermissionGuard } from './components/PermissionGuard'

// 网络状态
export { useNetworkStatus, type UseNetworkStatusOptions } from './hooks/useNetworkStatus'

// 跨工作台跳转 URL（开发多端口、生产同源）
export { getWorkstationUrl } from './workstationUrl'
