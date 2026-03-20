/**
 * 共享测试 fixtures：注入 JWT 到 localStorage，使 api-client 能通过后端认证
 */
import { test as base } from '@playwright/test'

const DEV_JWT_TOKEN = process.env.DEV_JWT_TOKEN || 'test-token-crm-headed'
const DEV_USER = {
  id: 2,
  name: '开发测试用户',
  email: 'dev@cnkis.local',
  avatar: '',
}
const DEV_PROFILE = {
  code: 200,
  msg: 'ok',
  data: {
    account: DEV_USER,
    permissions: ['crm.client.read', 'crm.client.write'],
  },
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(({ token, user, profile }) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_profile', JSON.stringify(profile))
      localStorage.setItem('auth_token_ts', String(Date.now()))
    }, { token: DEV_JWT_TOKEN, user: DEV_USER, profile: DEV_PROFILE })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await use(page)
  },
})

export { expect } from '@playwright/test'
