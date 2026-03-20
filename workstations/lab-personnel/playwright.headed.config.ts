/**
 * 共济·人员台 — Headed 业务全景测试专用配置
 *
 * 运行: pnpm test:headed
 *
 * 特点：
 * - 仅运行 e2e/headed/ 下的 13 个业务场景
 * - 始终 headed 模式 + slowMo 便于人工观察
 * - 加权评分报告器自动输出 100 分制总分
 * - 串行执行（业务场景有逻辑先后关系）
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
    baseURL: 'http://localhost:3013',
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
      name: '共济·人员台 业务全景验收',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    port: 3013,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
