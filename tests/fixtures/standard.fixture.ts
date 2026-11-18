import { test as base, type BrowserContext, type Page } from '@playwright/test';

/**
 * Standard test fixture with a fresh, isolated, non-persistent browser context for each test.
 * Standard tests start completely logged out and do not share the persistent Chrome profile.
 */
export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({ browser, viewport }, use) => {
    const context = await browser.newContext({
      viewport: viewport,
      permissions: ['notifications'],
    });

    await context.addCookies([
      {
        name: 'language',
        value: 'en',
        domain: '.qa.novocinemas.com',
        path: '/',
        secure: true,
      },
    ]);

    await use(context);
    await context.close();
  },

  page: async ({ context }, use, testInfo) => {
    const page = await context.newPage();

    // Cloudflare challenge detection
    await page.addLocatorHandler(
      page.getByText(/performing security verification|verify you are human/i).first(),
      async () => {
        const WAIT_MS = 3 * 60_000;
        testInfo.setTimeout(testInfo.timeout + WAIT_MS);
        console.log('\n>>> Cloudflare check: click "Verify you are human" in the Chrome window...\n');
        const deadline = Date.now() + WAIT_MS;
        while (Date.now() < deadline) {
          const title = await page.title().catch(() => 'Just a moment');
          if (!/just a moment/i.test(title)) return;
          await page.waitForTimeout(1000);
        }
        throw new Error('Cloudflare check was not completed within 3 minutes.');
      },
      { noWaitAfter: true },
    );

    await use(page);
  },
});

export { expect } from '@playwright/test';
