import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3204',
    headless: process.env.CI === 'true',
    screenshot: 'on',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: '财务台 E2E Desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.mobile.spec.ts',
    },
    {
      name: '财务台 E2E Mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/*.mobile.spec.ts',
    },
  ],
  webServer: {
    command: 'pnpm --filter @cn-kis/finance exec vite --host --port 3204',
    port: 3204,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
