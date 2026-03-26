import { defineConfig, devices } from '@playwright/test'

const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING === '1'

export default defineConfig({
  testDir: './e2e/headed',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:12186',
    headless: process.env.HEADED === '1' ? false : true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'wechat-mini-h5-mobile-headed',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
      },
    },
  ],
  webServer: useExistingServer ? undefined : {
    command: 'pnpm dev:h5 --port 12186',
    port: 12186,
    timeout: 120_000,
    reuseExistingServer: true,
  },
})
