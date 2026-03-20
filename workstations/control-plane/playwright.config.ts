import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3017',
    headless: process.env.CI === 'true',
    screenshot: 'on',
    video: 'on-first-retry',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: '统一平台 E2E Desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.mobile.spec.ts',
    },
    {
      name: '统一平台 E2E Mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/*.mobile.spec.ts',
    },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 3017,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
