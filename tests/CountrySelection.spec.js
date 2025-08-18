import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.novocinemas.com/');
  await expect(page.getByRole('img', { name: 'logo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Please select your Country' })).toBeVisible();
  const qatarDiv = page.locator('div').filter({ hasText: /^QATAR$/ });
  await expect(qatarDiv).toBeVisible();
  await expect(qatarDiv.getByRole('img', { name: 'CountryFlag' })).toBeVisible();
  const uaeDiv = page.locator('div').filter({ hasText: /^UAE$/ });
  await expect(uaeDiv).toBeVisible();
  await expect(uaeDiv.getByRole('img', { name: 'CountryFlag' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'العربية' })).toBeVisible();
  await page.getByRole('button', { name: 'العربية' }).click();
  await page.getByText('قطر').click();
  await expect(page.getByText('قطر')).toBeVisible();
  await expect(page.getByText('الإمارات')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'يرجى اختر الدولة' })).toBeVisible();
  await page.getByRole('button', { name: 'ENG' }).click();
  await page.locator('div').filter({ hasText: /^QATAR$/ }).getByRole('button').click();
  await page.goto('https://www.novocinemas.com/');
  await page.locator('div').filter({ hasText: /^UAE$/ }).getByRole('button').click();
  await page.goto('https://www.novocinemas.com/');
});