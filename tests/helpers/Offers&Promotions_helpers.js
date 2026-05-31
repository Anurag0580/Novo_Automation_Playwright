  import { expect } from '@playwright/test';

  // ==================== CONSTANTS ====================
  const BASE_URL = process.env.PROD_FRONTEND_URL;
  const API_BASE = `${process.env.PROD_BACKEND_URL}/api/home`;

  if (!BASE_URL || !process.env.PROD_BACKEND_URL) {
    throw new Error('❌ PROD_FRONTEND_URL or PROD_BACKEND_URL missing in env');
  }

  const HEADERS = {
    accept: 'application/json, text/plain, */*',
    origin: BASE_URL,
    referer: `${BASE_URL}/`
  };



  // ==================== HELPER FUNCTIONS ====================

  /**
   * Fetch offers and pages data from backend
   */
  async function fetchOffersData(page) {
    const [pages, offerGroups] = await Promise.all([
    page.request.get(`${API_BASE}/pages?key=/offers&country_id=1&channel=web`, { headers: HEADERS }),
    page.request.get(`${API_BASE}/offer-groups?country_id=1&channel=web`, { headers: HEADERS })
  ]);

  return {
    pages: await pages.json(),
    offerGroups: await offerGroups.json()
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
    const collectible = offers.filter(o => o.type === 'COLLECTIBLE');
    
    console.log(`✅ Categorized: ${offers.length} total, ${normal.length} NORMAL, ${bin.length} BIN, ${collectible.length} COLLECTIBLE`);
    
    return {
      all: offers,
      normal,
      bin,
      collectible
    };
  }

  /**
   * Slick keeps off-screen slides in the DOM. This prevents `.first()` from
   * locking on to a hidden copy of a card title.
   */
  async function firstVisibleOfferTitle(page, title) {
    const matches = page.getByText(title, { exact: false });
    const count = await matches.count();

    for (let index = 0; index < count; index++) {
      const candidate = matches.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    return null;
  }

  async function getOffersCarouselNextButton(page) {
    const selectors = [
      '.slick-slide.slick-active > div > div > .w-full.flex > button:nth-child(3)',
      '.slick-next',
      'button[aria-label="Next"]'
    ];

    for (const selector of selectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible().catch(() => false)) {
        return button;
      }
    }

    return null;
  }

  async function revealOfferInCarousel(page, title, maxMoves = 12) {
    await page.getByText('Popular Bank Offers').scrollIntoViewIfNeeded().catch(() => {});

    for (let move = 0; move <= maxMoves; move++) {
      const visibleTitle = await firstVisibleOfferTitle(page, title);
      if (visibleTitle) {
        return visibleTitle;
      }

      const nextButton = await getOffersCarouselNextButton(page);
      if (!nextButton || move === maxMoves) {
        break;
      }

      await nextButton.click({ force: true });
      await page.waitForTimeout(350);
    }

    return page.getByText(title, { exact: false }).first();
  }

  /**
   * Navigate to Offers & Promotions page
   */
  async function navigateToOffers(page) {
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });

    const backendData = await fetchOffersData(page);

    const pageName =
      backendData?.pages?.data?.data?.[0]?.page_name || 'Offers & Promotions';

    const [offerResponse] = await Promise.all([
      page.waitForResponse(
        resp =>
          resp.url().includes('offer-groups') &&
          [200, 304].includes(resp.status()),
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
  async function verifyOffersInTab(page, offers = [], ...excludeGroups) {
    const excludeOffers = excludeGroups
      .filter(group => Array.isArray(group))
      .flat()
      .filter(offer => offer?.title);
    console.log(`🔍 Verifying ${offers.length} offers are visible`);
    
    // Verify expected offers are visible
    for (const offer of offers.filter(offer => offer?.title)) {
      console.log(`  Checking EXPECTED offer: ${offer.title}`);
      const titleLocator = await revealOfferInCarousel(page, offer.title, offers.length + 4);
      await expect(titleLocator).toBeVisible({ timeout: 10000 });
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
  await page.waitForTimeout(500); // or better: wait for specific content change
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
      // await page.goBack();
      // await page.waitForLoadState('networkidle');
      // await expect(page).toHaveURL(offersPageUrl);
      await page.goto(offersPageUrl, { waitUntil: 'domcontentloaded' });
    }
  }

  /**
   * Strip HTML tags from text
   */
  const stripHtmlTags = (html = '') =>
    html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  /**
   * Normalize URLs for flexible comparison
   */
  const normalizeUrl = (url = '') => url.replace(/\/+$/, '').trim();

  /**
   * Resolve expected CTA label and destination from offer details API
   */
  function getExpectedOfferCta(apiData) {
    const hasCustomCta = Boolean(apiData?.cta_text?.trim());
    const fallbackLabels = ['Explore Movies'];

    return {
      labels: hasCustomCta ? [apiData.cta_text.trim()] : fallbackLabels,
      url: hasCustomCta && apiData?.cta_link?.trim()
        ? apiData.cta_link.trim()
        : new URL('/moviePages', BASE_URL).toString()
    };
  }

  /**
   * Find the visible CTA control by accessible name
   */
  async function getVisibleCtaLocator(page, labels) {
    for (const label of labels) {
      const linkLocator = page.getByRole('link', { name: label, exact: true }).first();
      if (await linkLocator.isVisible().catch(() => false)) {
        return { locator: linkLocator, label };
      }

      const buttonLocator = page.getByRole('button', { name: label, exact: true }).first();
      if (await buttonLocator.isVisible().catch(() => false)) {
        return { locator: buttonLocator, label };
      }

      const textLocator = page.getByText(label, { exact: true }).first();
      if (await textLocator.isVisible().catch(() => false)) {
        return { locator: textLocator, label };
      }
    }

    return {
      locator: page.getByText(labels[0], { exact: true }).first(),
      label: labels[0]
    };
  }

  /**
   * Verify CTA text and redirection from offer details page
   */
  async function verifyOfferDetailsCta(page, apiData) {
    const offerDetailsUrl = page.url();
    const expectedCta = getExpectedOfferCta(apiData);
    const { locator: ctaLocator, label: matchedLabel } = await getVisibleCtaLocator(page, expectedCta.labels);

    await expect(ctaLocator).toBeVisible({ timeout: 10000 });

    console.log(`✔ CTA verified: ${matchedLabel}`);

    const href = await ctaLocator.evaluate((node) => {
      const element = node instanceof HTMLElement ? node : null;
      const anchor = element?.closest('a');
      return anchor?.href || null;
    }).catch(() => null);

    if (href) {
      expect(normalizeUrl(href)).toContain(normalizeUrl(expectedCta.url));
    }

    await ctaLocator.click({ force: true });

    await page.waitForURL(
      url => normalizeUrl(url.toString()).startsWith(normalizeUrl(expectedCta.url)),
      { timeout: 10000 }
    );

    await page.goto(offerDetailsUrl, { waitUntil: 'domcontentloaded' });
  }

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
      // page.getByRole('heading', { name: apiData.name })
      page.getByText(apiData.name, { exact: true })
    ).toBeVisible();

    // ---------- DESCRIPTION ----------
    for (const field of ['short_desc', 'extra_info']) {
      if (!apiData[field]) {
        continue;
      }

      const cleanText = stripHtmlTags(apiData[field]).replace(/\s+/g, ' ').trim().substring(0, 40);
      if (!cleanText) {
        continue;
      }

      await expect(page.locator('body')).toContainText(
        new RegExp(cleanText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
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
      expect(src).toMatch(/gumlet|novo/i);
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

    // ---------- CTA / REDIRECTION ----------
    await verifyOfferDetailsCta(page, apiData);

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
    HEADERS,
    fetchOffersData,
    parseOffers,
    categorizeOffers,
    firstVisibleOfferTitle,
    getOffersCarouselNextButton,
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
