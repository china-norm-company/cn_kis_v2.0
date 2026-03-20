import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3017/digital-workforce/',
    headless: process.env.HEADED === '1' ? false : true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'VITE_DEV_AUTH_BYPASS=1 pnpm --filter @cn-kis/digital-workforce dev',
    url: 'http://127.0.0.1:3017/digital-workforce/',
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: 'digital-workforce-acceptance',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
