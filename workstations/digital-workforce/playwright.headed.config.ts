import { defineConfig, devices } from '@playwright/test'

/**
 * Headed LLM 打分验收配置
 *
 * 使用方式：
 *   pnpm exec playwright test apps/digital-workforce/e2e/headed/ \
 *     --config=apps/digital-workforce/playwright.headed.config.ts
 *
 * 特点：
 *   - headless: false（Headed 模式，可视化执行）
 *   - screenshot: on（每个测试都截图留证）
 *   - video: on（录制视频供人工复核）
 *   - 真实 Agent 调用，不 mock 响应结果
 *   - 调用后端 /api/v1/digital-workforce/judge-output 进行 LLM 打分
 */
export default defineConfig({
  testDir: './e2e/headed',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 180000,   // Headed 模式留更长超时（等待 AI 响应）
  expect: {
    timeout: 30000,  // AI 响应时间较长
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/headed' }],
    ['json', { outputFile: 'playwright-report/headed/results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3017/digital-workforce/',
    headless: false,
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    viewport: { width: 1440, height: 900 },
  },
  // E2E 测试环境变量（避免在浏览器上下文中处理认证）
  env: {
    BACKEND_API_URL: 'http://127.0.0.1:8000',
    E2E_ADMIN_TOKEN: process.env.E2E_ADMIN_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjo0LCJ1c2VybmFtZSI6InRtcF9hZG1pbl9kdyIsImFjY291bnRfdHlwZSI6ImludGVybmFsIiwicm9sZXMiOlsiYWRtaW4iXSwiZXhwIjoxODA0ODI1MzkyLCJpYXQiOjE3NzMyODkzOTJ9.5NaZETOYC02OPUPR29smrD2Vi1MSgTLO0tBDEbSK97Q',
  },
  webServer: {
    command: 'VITE_DEV_AUTH_BYPASS=1 pnpm --filter @cn-kis/digital-workforce dev',
    url: 'http://127.0.0.1:3017/digital-workforce/',
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: 'headed-agent-acceptance',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
      },
    },
  ],
})
