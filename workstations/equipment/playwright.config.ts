/**
 * 设备管理工作台（器衡）— Playwright E2E 测试配置
 *
 * 设计理念：
 * - headed 模式运行：每一步操作可视化，就像坐在设备管理员旁边看他工作
 * - slowMo 200ms：足以观察每步操作，又不至于太慢
 * - 串行执行：场景之间有逻辑顺序（早晨开工 → 校准 → 维护 → 使用 → 规划）
 * - 全量截图：每步操作留下视觉证据
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
    baseURL: 'http://localhost:3010',
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
      name: '器衡·设备管理工作台 E2E Desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.mobile.spec.ts',
    },
    {
      name: '器衡·设备管理工作台 E2E Mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/*.mobile.spec.ts',
    },
  ],

  webServer: {
    command: 'pnpm dev',
    port: 3010,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
