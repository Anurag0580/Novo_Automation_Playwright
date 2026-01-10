import { test, expect } from '@playwright/test';
const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;
const REAL_DOMAIN_URL = process.env.REAL_DOMAIN_URL;

if (!BASE_URL || !BACKEND_URL || !REAL_DOMAIN_URL) {
  throw new Error('❌ PROD_FRONTEND_URL or PROD_BACKEND_URL or REAL_DOMAIN_URL missing in env');
}

test('TC_01 – Verify Country Selection and Language Toggle on Landing Page', async ({ page }) => {
  await page.goto(`${REAL_DOMAIN_URL}/`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('img', { name: 'logo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Please select your Country' })).toBeVisible();

  const qatarDiv = page.locator('div').filter({ hasText: /^QATAR$/ });
  const uaeDiv = page.locator('div').filter({ hasText: /^UAE$/ });

  await expect(qatarDiv).toBeVisible();
  await expect(uaeDiv).toBeVisible();

  await page.getByRole('button', { name: 'العربية' }).click();

  await expect(page.getByText('قطر')).toBeVisible();
  await expect(page.getByText('الإمارات')).toBeVisible();

  await page.getByRole('button', { name: 'ENG' }).click();

  // Select QATAR
  await qatarDiv.getByRole('button').click();

  // Now go to main site
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // If you want to test UAE again → reload country selector properly
  await page.goto(`${REAL_DOMAIN_URL}/`, { waitUntil: 'domcontentloaded' });
  await uaeDiv.getByRole('button').click();
});
