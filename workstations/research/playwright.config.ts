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
    baseURL: 'http://localhost:3002',
    headless: process.env.CI === 'true',
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO ?? 0),
    },
    navigationTimeout: 15_000,
    actionTimeout: 8_000,
    screenshot: 'on',
    video: 'on-first-retry',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: '研究台 E2E Desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.mobile.spec.ts',
    },
    {
      name: '研究台 E2E Mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/*.mobile.spec.ts',
    },
  ],

  webServer: {
    command: 'pnpm dev',
    port: 3002,
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 30_000,
  },
})
