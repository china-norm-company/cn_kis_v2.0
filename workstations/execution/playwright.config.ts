/**
 * 实验室执行工作台 - Playwright E2E 测试配置
 *
 * 核心特性：
 * - 基于角色的多场景测试（CRC主管 / CRC协调员 / 排程员）
 * - 基于 Vite dev server 运行前端
 * - 拦截 API 请求，注入模拟数据
 * - slowMo 便于可视化观察
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 60_000,

  use: {
    baseURL: 'http://localhost:3007',
    headless: process.env.CI === 'true',
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO ?? 200),
    },
    screenshot: 'on',
    video: 'on-first-retry',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: '实验室执行工作台 E2E Desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.mobile.spec.ts',
    },
    {
      name: '实验室执行工作台 E2E Mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/*.mobile.spec.ts',
    },
  ],

  webServer: {
    command: 'pnpm dev',
    port: 3007,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
