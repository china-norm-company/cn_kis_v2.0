export interface UserInfo {
  id: string
  name: string
  subjectNo: string
  enrollDate: string
  projectName: string
  subjectId?: number
  enrollmentId?: number
  planId?: number
  protocolId?: number
  account_type?: 'internal' | 'subject' | 'external' | 'system'
  roles?: string[]
  primary_role?: string
}

export interface LoginCredentials {
  phone?: string
  code?: string
}

export interface AuthProvider {
  loginWithSms?(credentials: LoginCredentials): Promise<UserInfo | null>
  loginWithWechat?(): Promise<UserInfo | null>
  getLocalUserInfo(): UserInfo | null | Promise<UserInfo | null>
  isLoggedIn(): boolean | Promise<boolean>
  logout(): void | Promise<void>
}
