import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 配置
 * - 招募工作台：构建后通过 vite preview 提供，baseURL 指向 /recruitment/
 * - headed：使用 --headed 或 HEADED=1 时在真实浏览器中可见
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    headless: process.env.HEADED === '1' ? false : true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  timeout: 20000,
  expect: { timeout: 10000 },
})
