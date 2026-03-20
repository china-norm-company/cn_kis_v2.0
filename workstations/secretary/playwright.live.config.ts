import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    // UI 类测试连本地 dev server；API 类测试在 spec 内用 API_BASE 直连生产
    baseURL: process.env.LOCAL_BASE_URL || 'http://localhost:3201',
    headless: false,
    screenshot: 'on',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: '秘书台 Live Headed',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/06-chat-headed-live.spec.ts',
    },
    {
      name: '子衿主授权 Live Headed',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/08-zijin-primary-auth-headed.spec.ts',
    },
    {
      name: '架构重构验收 Headed',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/09-arch-restructure-headed.spec.ts',
    },
  ],
  // 自动启动本地 dev server（套件 1/2/4/5 需要）
  webServer: {
    command: 'pnpm --filter @cn-kis/secretary exec vite --host --port 3201',
    url: 'http://localhost:3201',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
