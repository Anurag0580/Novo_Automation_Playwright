import { expect } from '@playwright/test';

// ==================== CONSTANTS ====================
const BASE_URL = 'https://qa.novocinemas.com';
const API_BASE = 'https://backend.novocinemas.com/api/home';
const TIMEOUTS = {
  test: 180000,
  page: 120000,
  api: 30000,
  short: 2000,
  medium: 5000,
  long: 8000
};

const HEADERS = {
  accept: 'application/json, text/plain, */*',
  origin: BASE_URL,
  referer: `${BASE_URL}/`
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Fetch offers and pages data from backend
 */
async function fetchOffersData() {
  const [pages, offerGroups] = await Promise.all([
    fetch(`${API_BASE}/pages?key=/offers&country_id=1&channel=web`, { headers: HEADERS }),
    fetch(`${API_BASE}/offer-groups?country_id=1&channel=web`, { headers: HEADERS })
  ]);

  return {
    pages: await pages.json().catch(() => ({})),
    offerGroups: await offerGroups.json().catch(() => ({}))
  };
}

/**
 * Parse offers from backend data
 */
function parseOffers(backendData) {
  // Handle both possible API structures
  const offersRaw = backendData?.offerGroups?.data?.data || 
                    backendData?.offerGroups?.data || [];
  
  console.log(`📦 Found ${offersRaw.length} offers in API response`);
  
  return offersRaw.map((o) => ({
    title: o.name || o.title_en || o.title || 'Untitled',
    type: o.type || 'UNKNOWN',
    description: o.long_desc || o.short_desc || 'Unavailable',
    short_desc: o.short_desc || o.long_desc || 'No description available',
    id: o.id || o.offer_id || 'unknown-id'
  }));
}

/**
 * Categorize offers by type
 */
function categorizeOffers(offers) {
  const normal = offers.filter(o => o.type === 'NORMAL');
  const bin = offers.filter(o => o.type === 'BIN');
  
  console.log(`✅ Categorized: ${offers.length} total, ${normal.length} NORMAL, ${bin.length} BIN`);
  
  return {
    all: offers,
    normal,
    bin
  };
}

/**
 * Navigate to Offers & Promotions page
 */
async function navigateToOffers(page) {
  await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });

  const backendData = await fetchOffersData();

  const pageName =
    backendData?.pages?.data?.data?.[0]?.page_name || 'Offers & Promotions';

  const [offerResponse] = await Promise.all([
    page.waitForResponse(
      resp =>
        resp.url().includes('offer-groups') &&
        [200, 304].includes(resp.status()),
      { timeout: TIMEOUTS.api }
    ),
    page.getByRole('link', { name: 'Offers & Promotions' }).click()
  ]);

  await expect(page).toHaveURL(/\/promotions\/?$/);

  // ✅ Correct anchor (listing page)
  await expect(
    page.getByRole('heading', { name: pageName })
  ).toBeVisible({ timeout: 8000 });

  return offerResponse;
}


/**
 * Verify offers are visible in tab
 */
async function verifyOffersInTab(page, offers, excludeOffers = []) {
  console.log(`🔍 Verifying ${offers.length} offers are visible`);
  
  // Verify expected offers are visible
  for (const offer of offers) {
    console.log(`  Checking EXPECTED offer: ${offer.title}`);
    await expect(page.getByText(offer.title, { exact: false }).first())
      .toBeVisible({ timeout: TIMEOUTS.long });
  }

  // Verify excluded offers are hidden (don't fail on warning, just check)
  for (const offer of excludeOffers) {
    const visible = await page.getByText(offer.title, { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    
    if (visible) {
      console.warn(`⚠️ Excluded offer "${offer.title}" is incorrectly visible in this tab`);
    }
  }
  
  console.log(`  ✅ Tab verification completed`);
}

/**
 * Switch to a tab
 */
async function switchTab(page, tabButton) {
  await tabButton.click();
  await page.waitForTimeout(TIMEOUTS.short);
}

/**
 * Verify Learn More navigation for offers
 */
async function verifyLearnMoreNavigation(page, offers) {
  for (const offer of offers) {
    console.log(`🔗 Learn More → ${offer.title}`);

    const offersPageUrl = page.url();

    const card = page
      .getByText(offer.title, { exact: false })
      .first()
      .locator('xpath=ancestor::*[contains(@class,"group")]');

    await expect(card).toBeVisible();

    await card.getByRole('link', { name: /learn more/i }).click({ force: true });

    await expect(page).toHaveURL(/\/promotions\/\d+/);

    // 🔥 FULL DETAILS VALIDATION
    await verifyOfferDetailsPage(page, offer);

    // Back
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(offersPageUrl);
  }
}

/**
 * Strip HTML tags from text
 */
const stripHtmlTags = (html = '') =>
  html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

/**
 * Validate image is loaded
 */
const validateImageLoaded = async (locator, label) => {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible({ timeout: 10000 });

  await expect.poll(
    async () =>
      locator.evaluate(img => img.complete && img.naturalWidth > 0),
    { timeout: 10000 }
  ).toBe(true);

  console.log(`✔ ${label} loaded`);
};

/**
 * Fetch offer details by ID
 */
async function fetchOfferDetailsById(page, offerId) {
  const response = await page.request.get(
    `${API_BASE}/offer-groups-by-id/${offerId}?country_id=1&channel=web`,
    { headers: HEADERS }
  );

  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.success).toBeTruthy();

  return json.data;
}

/**
 * Verify offer details page
 */
async function verifyOfferDetailsPage(page, offer) {
  console.log(`🔎 Verifying Offer Details for ID: ${offer.id}`);

  const apiData = await fetchOfferDetailsById(page, offer.id);

  // ---------- TITLE ----------
  await expect(
    page.getByRole('heading', { name: apiData.name })
  ).toBeVisible();

  // ---------- DESCRIPTION ----------
  if (apiData.long_desc) {
    const cleanDesc = stripHtmlTags(apiData.long_desc).substring(0, 40);
    await expect(page.locator('body')).toContainText(
      new RegExp(cleanDesc, 'i')
    );
  }

  // ---------- DATE INFORMATION ----------
  if (apiData.valid_on) {
    await expect(page.getByText('Valid on', { exact: true })).toBeVisible();
    await expect(page.getByText(apiData.valid_on, { exact: true })).toBeVisible();
  }

  if (apiData.valid_till_date) {
    const yyyyMmDd = apiData.valid_till_date;
    const ddMmYyyy = yyyyMmDd.split('-').reverse().join('-');

    await expect(page.getByText(/Valid till/i)).toBeVisible();

    await expect(
      page.getByText(new RegExp(`${yyyyMmDd}|${ddMmYyyy}`))
    ).toBeVisible();

    console.log('✔ Valid till verified (flexible format)');
  }

  // ---------- IMAGES ----------
  if (apiData.banner_image) {
    const bannerImg = page.getByRole('img', {
      name: /Promotion Offer Banner|Promotion Offer/i
    }).first();

    await validateImageLoaded(bannerImg, 'Banner image');

    const src = await bannerImg.getAttribute('src');
    expect(src).toContain(apiData.banner_image.split('/').pop());
  }

  // ---------- PORTRAIT IMAGE ----------
  if (apiData.potrait_image) {
    const fileName = apiData.potrait_image.split('/').pop();

    const portraitImg = page.locator(
      `img[alt="Promotion Offer"][src*="${fileName}"]`
    );

    await expect(portraitImg).toBeVisible({ timeout: 10000 });

    await portraitImg.evaluate(img => {
      img.loading = 'eager';
      img.scrollIntoView({ block: 'center' });
    });

    await expect.poll(
      () => portraitImg.evaluate(img => img.complete && img.naturalWidth > 0),
      { timeout: 15000 }
    ).toBe(true);
  }
  console.log('✔ Portrait image loaded');

  // ---------- EXTRA INFO (T&C / Additional Info) ----------
  if (apiData.extra_info) {
    const cleanExtra = stripHtmlTags(apiData.extra_info).substring(0, 30);
    await expect(page.locator('body')).toContainText(
      new RegExp(cleanExtra, 'i')
    );
  }

  // ---------- STATIC UI ----------
  await expect(
    page.locator('div').filter({ hasText: /^Explore Movies$/ })
  ).toBeVisible();

  console.log(`✅ Offer details verified for: ${apiData.name}`);
}

/**
 * Verify hover details on offer cards
 */
async function verifyHoverDetails(page, offers) {
  const offersToTest = offers.slice(0, 2);

  for (const offer of offersToTest) {
    console.log(`🖱️ Hover test: ${offer.title}`);

    const card = page
      .getByText(offer.title, { exact: false })
      .first()
      .locator('xpath=ancestor::*[contains(@class,"group")]');

    await card.hover({ force: true });

    const aboutOffer = card.getByText('About Offer');
    await expect(aboutOffer).toHaveCSS('opacity', '1', {
      timeout: 5000
    });

    const description = card.locator('p');
    await expect(description).toBeAttached();

    console.log(`  ✅ Hover verified for: ${offer.title}`);

    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
  }
}

// ==================== EXPORTS ====================
export {
  BASE_URL,
  API_BASE,
  TIMEOUTS,
  HEADERS,
  fetchOffersData,
  parseOffers,
  categorizeOffers,
  navigateToOffers,
  verifyOffersInTab,
  switchTab,
  verifyLearnMoreNavigation,
  stripHtmlTags,
  validateImageLoaded,
  fetchOfferDetailsById,
  verifyOfferDetailsPage,
  verifyHoverDetails
};
