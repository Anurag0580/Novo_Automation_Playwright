import { test as base, expect, request } from '@playwright/test';
import { closePosterIfVisible } from '../helpers/home_helpers.js';

function isHomePageUrl(url) {
  try {
    return new URL(url).pathname === '/home';
  } catch {
    return false;
  }
}

async function handleHomePopup(page) {
  if (isHomePageUrl(page.url())) {
    await closePosterIfVisible(page);
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    const originalGoBack = page.goBack.bind(page);
    const originalGoForward = page.goForward.bind(page);
    const originalReload = page.reload.bind(page);
    const originalWaitForURL = page.waitForURL.bind(page);

    page.goto = async (url, options) => {
      const response = await originalGoto(url, {
        waitUntil: 'domcontentloaded',
        ...options,
      });
      await handleHomePopup(page);
      return response;
    };

    page.goBack = async (...args) => {
      const response = await originalGoBack(...args);
      await handleHomePopup(page);
      return response;
    };

    page.goForward = async (...args) => {
      const response = await originalGoForward(...args);
      await handleHomePopup(page);
      return response;
    };

    page.reload = async (...args) => {
      const response = await originalReload(...args);
      await handleHomePopup(page);
      return response;
    };

    page.waitForURL = async (...args) => {
      const result = await originalWaitForURL(...args);
      await handleHomePopup(page);
      return result;
    };

    await use(page);
  },
  autoLogger: [async ({}, use, testInfo) => {
  const match = testInfo.title.match(/^(TC(?:[_-][A-Z0-9]+)*?[_-]?\d+)/i);
  const tcId = match ? match[1] : "N/A";

  console.log("\n==================================================");
  console.log(`🚀 ${tcId} STARTED`);
  console.log(`📝 ${testInfo.title}`);
  console.log("==================================================\n");

  await use();

  console.log("\n==================================================");
  console.log(`✅ ${tcId} COMPLETED`);
  console.log(`📝 ${testInfo.title}`);
  console.log("==================================================\n");
}, { auto: true }],
});

export { expect, request };
