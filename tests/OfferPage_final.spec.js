import { test, expect } from '@playwright/test';
import {
  parseOffers,
  categorizeOffers,
  navigateToOffers,
  verifyOffersInTab,
  switchTab,
  verifyLearnMoreNavigation,
  verifyHoverDetails,
  API_BASE,
  HEADERS,
} from './helpers/Offers&Promotions_helpers.js';

const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = `${process.env.PROD_BACKEND_URL}/api/home`;

if (!BASE_URL || !process.env.PROD_BACKEND_URL) {
  throw new Error('❌ PROD_FRONTEND_URL or PROD_BACKEND_URL missing in env');
}

let backendData;
let parsedOffers;

test.beforeAll(async ({ request }) => {
  const pages = await request.get(`${API_BASE}/pages?key=/offers&country_id=1&channel=web`, { headers: HEADERS });
  const offerGroups = await request.get(`${API_BASE}/offer-groups?country_id=1&channel=web`, { headers: HEADERS });

  backendData = {
    pages: await pages.json(),
    offerGroups: await offerGroups.json()
  };

  parsedOffers = categorizeOffers(parseOffers(backendData));
});

// ==================== TEST SUITE ====================
test.describe('Offers & Promotions – UI, Backend Data, Tabs, Carousel, and Navigation Validation', () => {
  
  test('TC_01 – Verify Offers & Promotions Page Loads Successfully with Banner, Heading, Tabs, and Popular Bank Offers Section', async ({ page }) => {
    await navigateToOffers(page);
    
    // Verify banner
    await expect(page.locator('.relative > .absolute.inset-0').first()).toBeVisible();
    
    // Fetch and verify page heading
    const pageName = backendData?.pages?.data?.data?.[0]?.page_name || 
                     backendData?.pages?.data?.page_name || 
                     'Offers & Promotions';
    await expect(page.getByRole('heading', { name: pageName })).toBeVisible();
    
    // Verify tabs exist
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo Offers & Promotions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bank Offers & Promotions' })).toBeVisible();
    
    // Verify Popular Bank Offers section
    await expect(page.getByText('Popular Bank Offers')).toBeVisible();
    await expect(page.locator('.flex.gap-6')).toBeVisible();
    
    console.log('✅ TC01: Page structure verified');
  });

  test('TC_02 – Verify “All” Tab Displays All Available Offers as per Backend Data', async ({ page }) => {
    await navigateToOffers(page);
    const { all } = parsedOffers;
    
    const allTab = page.getByRole('button', { name: 'All' });
    await switchTab(page, allTab);
    await verifyOffersInTab(page, all);
    
    console.log('✅ TC02: All offers tab verified');
  });

  test('TC_03 – Verify “Novo Offers & Promotions” Tab Displays Only Novo Offers as per Backend Data', async ({ page }) => {
    await navigateToOffers(page);
    const { normal, bin } = parsedOffers;
    
    const novoTab = page.getByRole('button', { name: 'Novo Offers & Promotions' });
    await switchTab(page, novoTab);
    await verifyOffersInTab(page, normal, bin);
    
    console.log('✅ TC03: Novo offers tab verified');
  });

  test('TC_04 – Verify “Bank Offers & Promotions” Tab Displays Only Bank Offers as per Backend Data', async ({ page }) => {
    await navigateToOffers(page);
    const { normal, bin } = parsedOffers;
    
    const bankTab = page.getByRole('button', { name: 'Bank Offers & Promotions' });
    await switchTab(page, bankTab);
    await verifyOffersInTab(page, bin, normal);
    
    console.log('✅ TC04: Bank offers tab verified');
  });

  test('TC_05 – Verify Offers Carousel Displays All Offers Through Slider Navigation', async ({ page }) => {
    await navigateToOffers(page);
    const { all } = parsedOffers;
    
    await expect(page.locator('.bg-background.p-5.lg\\:p-10')).toBeVisible();
    
    const rightButton = page.locator('.slick-slide.slick-active > div > div > .w-full.flex > button:nth-child(3)');
    const verifiedOffers = new Set();
const maxSlides = all.length * 2;
let slideCount = 0;

while (verifiedOffers.size < all.length && slideCount < maxSlides) {
  slideCount++;

  for (const offer of all) {
    if (verifiedOffers.has(offer.title)) continue;

    const titleVisible = await page
      .getByRole('heading', { name: offer.title })
      .first()
      .isVisible()
      .catch(() => false);

    if (titleVisible) {
      verifiedOffers.add(offer.title);
      break;
    }
  }

  if (verifiedOffers.size < all.length) {
    await rightButton.click();
  }
}

expect(verifiedOffers.size).toBe(all.length);
    
    // List any missing offers
    if (verifiedOffers.size < all.length) {
      const missing = all.filter(o => !verifiedOffers.has(o.title)).map(o => o.title);
      throw new Error(`Missing offers in slider: ${missing.join(', ')}`);
    }
    
    console.log('✅ TC05: All slider offers verified');
  });

  test('TC_06 – Verify Offer Hover Details Are Displayed Correctly in “All” Tab', async ({ page }) => {
    await navigateToOffers(page);
    const { all } = parsedOffers;
    
    const allTab = page.getByRole('button', { name: 'All' });
    await switchTab(page, allTab);
    
    await verifyHoverDetails(page, all);
    console.log('✅ TC06: Hover details on All tab verified');
  });

  test('TC_07 – Verify Offer Hover Details Are Displayed Correctly in “Novo Offers & Promotions” Tab', async ({ page }) => {
    await navigateToOffers(page);
    const { normal } = parsedOffers;
    
    const novoTab = page.getByRole('button', { name: 'Novo Offers & Promotions' });
    await switchTab(page, novoTab);
    
    await verifyHoverDetails(page, normal);
    console.log('✅ TC07: Hover details on Novo tab verified');
  });

  test('TC_08 – Verify Offer Hover Details Are Displayed Correctly in “Bank Offers & Promotions” Tab', async ({ page }) => {
    await navigateToOffers(page);
    const { bin } = parsedOffers;
    
    const bankTab = page.getByRole('button', { name: 'Bank Offers & Promotions' });
    await switchTab(page, bankTab);
    
    await verifyHoverDetails(page, bin);
    console.log('✅ TC08: Hover details on Bank tab verified');
  });

  test('TC_09 – Verify “Learn More” Navigation from Offers in “All” Tab', async ({ page }) => {
    await navigateToOffers(page);
    const { all } = parsedOffers;
    
    const allTab = page.getByRole('button', { name: 'All' });
    await switchTab(page, allTab);
    
    await verifyLearnMoreNavigation(page, all.slice(0, 2));
    console.log('✅ TC09: Learn More navigation on All tab verified');
  });

  test('TC_10 – Verify “Learn More” Navigation from Offers in “Novo Offers & Promotions” Tab', async ({ page }) => {
    await navigateToOffers(page);
    const { normal } = parsedOffers;
    
    const novoTab = page.getByRole('button', { name: 'Novo Offers & Promotions' });
    await switchTab(page, novoTab);
    
    await verifyLearnMoreNavigation(page, normal.slice(0, 2));
    console.log('✅ TC10: Learn More navigation on Novo tab verified');
  });

  test('TC_11 – Verify “Learn More” Navigation from Offers in “Bank Offers & Promotions” Tab', async ({ page }) => {
    await navigateToOffers(page);
    const { bin } = parsedOffers;
    
    const bankTab = page.getByRole('button', { name: 'Bank Offers & Promotions' });
    await switchTab(page, bankTab);
    
    await verifyLearnMoreNavigation(page, bin.slice(0, 2));
    console.log('✅ TC11: Learn More navigation on Bank tab verified');
  });
});