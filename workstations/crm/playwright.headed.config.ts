/**
 * 进思·客户台 — Headed 业务全景测试专用配置
 *
 * 运行: pnpm test:headed
 *
 * 18 个业务场景，涵盖 P0-P3 全部阶段功能
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/headed',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['./e2e/headed/scoring-reporter.ts'],
  ],
  timeout: 60_000,

  use: {
    baseURL: 'http://localhost:3006/crm',
    headless: false,
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO ?? 300),
    },
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: '进思·客户台 业务全景验收',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'VITE_DEV_AUTH_BYPASS=1 pnpm dev',
    port: 3006,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
