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
    baseURL: 'http://localhost:3016',
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
      name: '接待台 E2E Desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.mobile.spec.ts',
    },
    {
      name: '接待台 E2E Mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/*.mobile.spec.ts',
    },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 3016,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
