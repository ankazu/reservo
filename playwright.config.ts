import { defineConfig, devices } from '@playwright/test'

const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION === 'true'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    testIdAttribute: 'data-test',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: useProductionServer
      ? 'node .output/server/index.mjs'
      : 'npm run dev -- --host 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
