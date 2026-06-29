// @ts-check
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// 🔒 Validate env early
if (!process.env.PROD_FRONTEND_URL || !process.env.PROD_BACKEND_URL) {
  throw new Error('❌ Missing required environment variables. Check .env file');
}

export default defineConfig({
  testDir: './tests',

  timeout: 180000, // 3 minutes per test
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,      //retries for flaky tests, 2 retries in CI, 0 retries locally
  workers: process.env.CI ? 1 : undefined, // Use 1 worker in CI for better stability, otherwise use default

  reporter: [
  ['list'],
  ['html', { open: 'never' }],
  ['json', { outputFile: 'playwright-report/results.json' }],
  ['junit', { outputFile: 'playwright-report/results.xml' }],
  ['allure-playwright', { outputFolder: 'allure-results' }],
],
  outputDir: 'test-results',

  use: {
    baseURL: process.env.PROD_FRONTEND_URL,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  expect: {
    timeout: 10000,
  },

  projects: [
    {
      name: 'chromium',
    },
    // {
    //   name: 'firefox',
    // },
    // {
    //   name: 'webkit',
    // },
  ],
});
