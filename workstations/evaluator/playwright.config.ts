/**
 * 技术评估工作台 - Playwright E2E 测试配置
 *
 * 核心特性：
 * - headed 模式运行（可视化浏览器），方便验证每一步业务目标
 * - 基于 Vite dev server 运行前端
 * - 拦截 API 请求，注入模拟数据
 * - slowMo: 300ms 让每步操作可被观察
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: process.env.CI === 'true',
  retries: process.env.CI === 'true' ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 60_000,

  use: {
    baseURL: 'http://localhost:3013',
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
      name: '技术评估工作台 E2E Desktop',
      use: {
        ...devices['Desktop Chrome'],
        // 优先使用系统已安装的 Chrome，避免下载 Playwright Chromium
        channel: process.env.PW_CHROMIUM ? undefined : 'chrome',
      },
      testIgnore: '**/*.mobile.spec.ts',
    },
    {
      name: '技术评估工作台 E2E Mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/*.mobile.spec.ts',
    },
    {
      name: '技术评估工作台 E2E Mobile Android',
      use: { ...devices['Pixel 5'] },
      testMatch: '**/*.mobile.spec.ts',
    },
  ],

  webServer: {
    command: 'pnpm dev',
    port: 3013,
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 30_000,
  },
})
