// @ts-check
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// 🔒 Validate env early
if (!process.env.PROD_FRONTEND_URL) {
  throw new Error('❌ Missing required PROD_FRONTEND_URL in .env file');
}
if (!process.env.mx_token) {
  throw new Error('❌ Missing required mx_token in .env file');
}

process.env.PROD_NEW_BACKEND_URL =
  process.env.PROD_NEW_BACKEND_URL || 'https://web-api.novocinemas.com/api/v3/external';
process.env.PROD_LEGACY_BACKEND_URL =
  process.env.PROD_LEGACY_BACKEND_URL || 'https://backend.novocinemas.com/api';
process.env.PROD_BACKEND_URL =
  process.env.PROD_BACKEND_URL || 'https://backend.novocinemas.com';

export default defineConfig({
  testDir: './tests',

  timeout: 180000,
fullyParallel: false,
forbidOnly: !!process.env.CI,
retries: process.env.CI ? 2 : 0,
workers: 1,

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
