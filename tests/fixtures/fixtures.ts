import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Per-machine profile folder (create it with `npm run setup`). Same default as setup-profile.js.
// Cookies (incl. Cloudflare's cf_clearance) and the Google sign-in persist between runs.
const PROFILE_DIR = process.env.CHROME_PROFILE ?? path.join(os.homedir(), 'chrome-test-profile');

// Chrome writes SingletonLock -> "<host>-<pid>" while a profile is open. Fail fast with a clear hint.
function assertProfileFree() {
  let pid: number;
  try {
    pid = Number(fs.readlinkSync(path.join(PROFILE_DIR, 'SingletonLock')).split('-').pop());
  } catch {
    return; // no lock -> profile free (or Windows, which uses a different lock)
  }
  try {
    process.kill(pid, 0); // throws if the process is gone (stale lock)
  } catch {
    return;
  }
  throw new Error(
    `Chrome (pid ${pid}) is already using ${PROFILE_DIR}. Quit it completely (Cmd+Q on Mac), then run the tests again.`,
  );
}

// Overrides the built-in `context` and `page` so every test runs in real Chrome with this profile.
export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use) => {
    assertProfileFree();
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',
      headless: false,
      // --use-mock-keychain: Playwright default; removing it lets Chrome read the real macOS Keychain,
      // so the Google sign-in / cookies saved by normal Chrome in this profile stay valid.
      // --disable-sync: also a Playwright default; it would keep the Google account signed out.
      ignoreDefaultArgs: ['--disable-extensions', '--enable-automation', '--use-mock-keychain', '--disable-sync'],
      args: ['--disable-blink-features=AutomationControlled'],
      chromiumSandbox: true, // removes the "--no-sandbox" warning bar
      permissions: ['notifications'], // no "wants to show notifications" popup
      viewport: null, // use the real window size
    });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use, testInfo) => {
    const page = context.pages()[0] ?? (await context.newPage());

    // Cloudflare challenge can appear on any page (e.g. seat-selection). Before every action/assertion,
    // if it's showing, wait for a human to tick "Verify you are human", then continue the test.
    await page.addLocatorHandler(
      page.getByText(/performing security verification|verify you are human/i).first(),
      async () => {
        const WAIT_MS = 3 * 60_000;
        testInfo.setTimeout(testInfo.timeout + WAIT_MS); // don't let the test time out while you click
        console.log('\n>>> Cloudflare check: click "Verify you are human" in the Chrome window...\n');
        const deadline = Date.now() + WAIT_MS;
        while (Date.now() < deadline) {
          const title = await page.title().catch(() => 'Just a moment'); // throws mid-navigation
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
