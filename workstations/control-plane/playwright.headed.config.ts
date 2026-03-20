/**
 * 天工·资源统一智能化管理平台 — Headed 验收配置
 *
 * 忽略飞书认证，使用 VITE_DEV_AUTH_BYPASS=1 本地验收。
 * 运行: pnpm test:headed（需先启动后端且 DEBUG=True 以接受 dev-bypass-token）
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/headed',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,

  use: {
    baseURL: 'http://localhost:3017',
    headless: false,
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO ?? 200),
    },
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: '天工 E2E Desktop (Chrome headed)',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm run dev:e2e',
    port: 3017,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
