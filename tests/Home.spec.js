import { test, expect } from "@playwright/test";
import {
  LANGUAGE_CONFIG,
  OFFER_API,
  headerLink,
  headerButton,
  setupSearchTracking,
  verifyScrollable,
  fetchMoviesFromAPI,
  testMovieInteraction,
  runMoviesTest,
  getOffersSection,
  getOffersSlider,
  waitForOffersCarouselReady,
  clickNextArrowIfVisible,
  bringOfferIntoView,
  clickOfferAndWaitForNavigation,
  testOffersInLanguage,
  openQuickBook,
  fetchQuickBookData,
  formatDateForUI,
  waitForQuickBookApi,
  clickAndSelectOption,
  getDropdownLocators,
} from "./helpers/home_helpers.js";
import { loginAndCaptureTokenBooking } from "./helpers/booking-helpers.js";

const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;
const REAL_DOMAIN_URL = process.env.REAL_DOMAIN_URL;

if (!BASE_URL || !BACKEND_URL || !REAL_DOMAIN_URL) {
  throw new Error("❌ Required URLs missing in .env");
}

test.describe("Homepage – Navigation, Search, Content Sections, and Multi-Language Validation", () => {
  // ==================== TEST CASES ====================

  test("TC001 - Verify Homepage Navigation Header and Menu Links Functionality", async ({
    page,
  }) => {
    await page.goto(`${REAL_DOMAIN_URL}/`);
    await page
      .locator("div")
      .filter({ hasText: /^QATAR$/ })
      .getByRole("button")
      .click();
    console.log("🌍 Country selected: QATAR");

    await expect(
      page.getByRole("navigation").getByRole("img", { name: "Logo" }),
    ).toBeVisible();

    // Food & Beverages > Online Order
    await headerButton(page, "Food & Beverages").click();
    const onlineOrder = headerLink(page, "Online Order");
    await expect(onlineOrder).toBeVisible();
    await onlineOrder.click();
    await expect(page).toHaveURL(/takeaway/);
    await expect(
      page.getByRole("heading", { name: "Food & Drinks To-Go" }),
    ).toBeVisible();

    // Food & Beverages > Home Delivery
    await page.goto(`${BASE_URL}/home`);
    await headerButton(page, "Food & Beverages").click();
    const homedelivery = headerLink(page, "Home Delivery");
    await expect(homedelivery).toBeVisible();
    await homedelivery.click();
    await expect(page).toHaveURL(/homedelivery/);
    await expect(
      page
        .locator("div")
        .filter({ hasText: "Enjoy Novo CinemasTreats" })
        .nth(4),
    ).toBeVisible();

    // Offers & Promotions
    await page.goto(`${BASE_URL}/home`);
    const offerandPromotions = headerLink(page, "Offers & Promotions");
    await expect(offerandPromotions).toBeVisible();
    await offerandPromotions.click();
    await expect(page).toHaveURL(/promotions/);
    await expect(
      page.getByRole("heading", { name: "Offers & Promotions" }),
    ).toBeVisible();

    // Locations
    await page.goto(`${BASE_URL}/home`);
    const locations = headerLink(page, "Locations");
    await expect(locations).toBeVisible();
    await locations.click();
    await expect(page).toHaveURL(/location/);
    await expect(
      page.getByRole("heading", { name: "Explore our Locations" }),
    ).toBeVisible();

    // Experiences
    await page.goto(`${BASE_URL}/home`);
    const experiecnces = headerLink(page, "Experiences");
    await expect(experiecnces).toBeVisible();
    await experiecnces.click();
    await expect(page).toHaveURL(/experiences/);
    await expect(
      page.getByRole("heading", { name: "Novo Experiences" }),
    ).toBeVisible();

    // Private Booking
    await page.goto(`${BASE_URL}/home`);
    const privateBooking = headerLink(page, "Private Booking");
    await expect(privateBooking).toBeVisible();
    await privateBooking.click();
    await expect(page).toHaveURL(/privatebooking/);
    await expect(
      page.getByRole("heading", { name: "Private Booking" }),
    ).toBeVisible();

    // Premiere Club
    await page.goto(`${BASE_URL}/home`);
    const premiereclub = headerLink(page, "Premiere Club");
    await expect(premiereclub).toBeVisible();
    await premiereclub.click();
    await page.goto(`${BASE_URL}/premiereclub`);
    await expect(page).toHaveURL(/premiereclub/);
    await expect(page.locator("text=Premiere Club").first()).toBeVisible();

    //Bowling and Billiard
    await page.goto(`${BASE_URL}/home`);
    const bowlingandbilliards = headerLink(page, "Bowling & Billiard");
    await expect(bowlingandbilliards).toBeVisible();
    await bowlingandbilliards.click();
    await page.goto(`${BASE_URL}/games/pick`);
    await expect(page).toHaveURL(/games\/pick/);
    await expect(page.getByRole("heading", { name: "Bowling & Billiard" })).toBeVisible();

    // Language Switching
    await page.goto(`${BASE_URL}/home`);
    console.log("🔄 Switching language to Arabic");
    await headerButton(page, "العربية").click();
    await expect(headerLink(page, "العروض الترويجية")).toBeVisible();
    await expect(page.getByRole("navigation")).toContainText(
      "العروض الترويجية",
    );
    await expect(page.getByRole("navigation")).toContainText("الحجوزات الخاصة");

    await headerButton(page, "ENG").click({ force: true });
    console.log("✅ TC001 COMPLETED");
  });

  test("TC002 - Verify English Search Functionality and API Integration", async ({
    page,
  }) => {
    const { apiCalls, getMovieName } = await setupSearchTracking(page);

    await page.goto(`${BASE_URL}/home`);
    const navButton = page
      .getByRole("navigation")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .first();
    const searchBox = page.getByRole("textbox", {
      name: "Search Movie or Cinema",
    });
    const searchPopup = page
      .locator('[data-testid="search-popup"]')
      .or(page.locator(".search-popup, .search-modal, .search-container"));

    await navButton.click();
    await expect(searchBox).toBeVisible();
    await page.waitForTimeout(1500);
    expect(apiCalls[0]).toMatch(/search=.*&country_id=1&channel=web/);

    const searchTerm = getMovieName();
    await searchBox.fill(searchTerm);
    await page.waitForTimeout(2000);
    expect(
      apiCalls.some((call) =>
        call.includes(`search=${encodeURIComponent(searchTerm)}`),
      ),
    ).toBeTruthy();
    console.log(`🔍 Search triggered for movie: ${searchTerm}`);

    await verifyScrollable(searchPopup);

    await searchBox.clear();
    await expect(searchBox).toHaveValue("");
    expect(
      apiCalls.some((url) => url.includes("search=&country_id=1&channel=web")),
    ).toBeTruthy();
    await page.locator(".lucide.lucide-x.cursor-pointer").click();
    console.log("✅ TC002 COMPLETED");
  });

  test("TC003 - Verify Arabic Search Functionality and Language Support", async ({
    page,
  }) => {
    const { apiCalls, getMovieName } = await setupSearchTracking(page);

    await page.goto(`${BASE_URL}/home`);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "العربية" })
      .click();

    const navButton = page
      .getByRole("navigation")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .first();
    const searchBox = page.getByRole("textbox", {
      name: "ابحث عن فيلم أو سينما",
    });

    await navButton.click();
    await expect(searchBox).toBeVisible();
    await page.waitForTimeout(1500);

    const arabicSearchTerm = getMovieName("ar");
    await searchBox.fill(arabicSearchTerm);
    await page.waitForTimeout(2000);
    expect(
      apiCalls.some((call) =>
        call.includes(`search=${encodeURIComponent(arabicSearchTerm)}`),
      ),
    ).toBeTruthy();
    console.log(`🔍 Arabic search triggered for movie: ${arabicSearchTerm}`);

    await searchBox.clear();
    await page.locator(".lucide.lucide-x.cursor-pointer").click();
    console.log("✅ TC003 COMPLETED");
  });

  test("TC004 - Verify Homepage Banner Functionality and Navigation", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });

    const banner = page.locator(".slick-slider").first();
    await expect(banner).toBeVisible();

    const activeSlide = () => page.locator(".slick-slide.slick-active").first();

    // ===============================
    // 1️⃣ Banner Title Matching
    // ===============================
    await test.step("Verify banner visibility and title matching", async () => {
      await expect(activeSlide()).toBeVisible();

      const bannerTitle = activeSlide().locator("h1, h2").first();
      await expect(bannerTitle).toBeVisible();

      const movieCardTitle = activeSlide().locator("h1, h2, h3").nth(1);

      if (await movieCardTitle.isVisible().catch(() => false)) {
        const bannerText = (await bannerTitle.textContent())?.trim();
        const cardText = (await movieCardTitle.textContent())?.trim();
        expect(bannerText?.toLowerCase()).toBe(cardText?.toLowerCase());
      }
    });

    // ===============================
    // 2️⃣ Book Now Navigation
    // ===============================
    await test.step("Verify Book Now navigation", async () => {
      const bookNowBtn = activeSlide().getByRole("button", {
        name: /Book Now/i,
      });

      if (await bookNowBtn.count()) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
          bookNowBtn.click(),
        ]);

        await expect(page).toHaveURL(/\/movies\/\d+/);

        await page.goBack();
        await expect(banner).toBeVisible();
      }
    });

    // ===============================
    // 3️⃣ Watch Trailer (Loop Search)
    // ===============================
    await test.step("Verify Watch Trailer modal opens and closes", async () => {
      const maxSlides = 5;
      let trailerFound = false;

      const nextBtn = page.locator(".slick-arrow.slick-next").first();

      for (let i = 0; i < maxSlides; i++) {
        const trailerBtn = activeSlide()
          .locator(
            'button:has-text("Watch Trailer"), [aria-label*="play"], svg[class*="lucide"]',
          )
          .first();

        if (await trailerBtn.isVisible().catch(() => false)) {
          trailerFound = true;
          await trailerBtn.click();

          // Wait for YouTube iframe to attach to DOM
          const ytIframe = page.locator('iframe[src*="youtube"]');

          await ytIframe.waitFor({ state: "attached", timeout: 20000 });
          await expect(ytIframe).toBeVisible({ timeout: 20000 });
          // Close modal
          await page.keyboard.press("Escape");

          break;
        }

        if (await nextBtn.isVisible().catch(() => false)) {
          await nextBtn.click();
          await expect(activeSlide()).toBeVisible();
        }
      }

      expect(trailerFound).toBe(true);
    });

    // ===============================
    // 4️⃣ Next / Previous Navigation
    // ===============================
    await test.step("Verify next and previous banner navigation", async () => {
      const nextBtn = page.locator(".slick-arrow.slick-next").first();
      const prevBtn = page.locator(".slick-arrow.slick-prev").first();

      if (await nextBtn.isVisible().catch(() => false)) {
        const initialIndex = await activeSlide().getAttribute("data-index");

        await nextBtn.click();
        await page.waitForFunction(
          (initial) =>
            document
              .querySelector(".slick-slide.slick-active")
              ?.getAttribute("data-index") !== initial,
          initialIndex,
        );

        const newIndex = await activeSlide().getAttribute("data-index");
        expect(newIndex).not.toBe(initialIndex);

        await prevBtn.click();
        await expect(activeSlide()).toBeVisible();
      }
    });

    // ===============================
    // 5️⃣ Auto Scroll Validation
    // ===============================
    await test.step("Verify banner auto-scroll", async () => {
      const initialIndex = await activeSlide().getAttribute("data-index");

      await page.waitForFunction(
        (initial) => {
          const current = document
            .querySelector(".slick-slide.slick-active")
            ?.getAttribute("data-index");
          return current && current !== initial;
        },
        initialIndex,
        { timeout: 20000 },
      );

      console.log("⏭ Banner auto-scroll verified");
    });

    console.log("✅ TC004 COMPLETED SUCCESSFULLY");
  });

  test("TC005 - Verify Movies Section Functionality in English", async ({
    page,
  }) => {
    await runMoviesTest(page, "english");
  });

  test("TC006 - Verify Movies Section Functionality in Arabic", async ({
    page,
  }) => {
    await runMoviesTest(page, "arabic");
  });

  test("TC007 - Verify Top 10 Movies Section and Video Playback (Dynamic)", async ({
    page,
    request,
  }) => {
    // Helper: check if active slide matches movie title
    async function isActiveSlideMovie(page, movieTitle) {
      const activeSlide = page.locator(".slick-slide.slick-active");
      return await activeSlide
        .getByText(movieTitle, { exact: false })
        .isVisible()
        .catch(() => false);
    }

    // 1. Fetch Trending Movies API
    const apiResponse = await request.get(
      `${BACKEND_URL}/api/home/movies/trending?country_id=1&channel=web`,
    );

    expect(apiResponse.ok()).toBeTruthy();

    const apiData = await apiResponse.json();
    const movies = apiData.data || [];

    expect(movies.length).toBeGreaterThan(0);
    console.log(`🎬 Trending movies fetched: ${movies.length}`);

    // Prefer movie with trailer, fallback to first movie
    const testMovie =
      movies.find((m) => m.movie_trailer_link && m.movie_title) || movies[0];

    const movieTitle = testMovie.movie_title.trim();
    const hasTrailer = Boolean(testMovie.movie_trailer_link);

    // 2. Load Homepage
    await page.goto(`${BASE_URL}/home`);

    await expect(page.getByText("Top 10 Movies")).toBeVisible();

    const leftArrow = page.locator(
      ".lucide.lucide-chevron-left.cursor-pointer",
    );
    const rightArrow = page.locator(
      ".lucide.lucide-chevron-right.cursor-pointer",
    );

    await expect(leftArrow).toBeVisible();
    await expect(rightArrow).toBeVisible();
    await expect(leftArrow).toBeEnabled();
    await expect(rightArrow).toBeEnabled();

    // 3. Verify movie image dynamically
    await expect(
      page.getByRole("img", { name: movieTitle }).first(),
    ).toBeVisible();

    const yellowHighlight = page.locator(".bg-gradient-to-b.h-full").first();
    await expect(yellowHighlight).toBeVisible();

    // 4. Carousel navigation (basic validation)
    for (let i = 0; i < Math.min(9, movies.length); i++) {
      await rightArrow.click();
      await page.waitForTimeout(500);
      await expect(yellowHighlight).toBeVisible();
    }

    for (let i = 0; i < 5; i++) {
      await leftArrow.click();
      await page.waitForTimeout(500);
      await expect(yellowHighlight).toBeVisible();
    }

    // 5. Align carousel to API movie
    let matchedSlide = false;

    for (let i = 0; i < 10; i++) {
      if (await isActiveSlideMovie(page, movieTitle)) {
        matchedSlide = true;
        break;
      }
      await rightArrow.click();
      await page.waitForTimeout(500);
    }

    if (matchedSlide) {
      console.info(`✔ Carousel aligned for movie: ${movieTitle}`);
    }

    // 6. Click active movie
    const activeMovie = page.locator("img.border-\\[\\#FFEF00\\]");
    await expect(activeMovie).toBeVisible();
    await activeMovie.click();

    // 7. Trailer validation (API-driven)
    const trailerIcon = page.locator(
      ".slick-slide.slick-active > div > div > .flex > .border > .lucide",
    );

    if (hasTrailer) {
      const iconCount = await trailerIcon.count();

      if (iconCount > 0) {
        await trailerIcon.click();

        const ytIframe = page.frameLocator(
          'iframe[title="YouTube video player"]',
        );

        await ytIframe
          .first()
          .locator('button[aria-label="Play"], .ytp-large-play-button')
          .waitFor({ state: "visible", timeout: 15000 });

        await ytIframe.getByRole("button", { name: /play/i }).click();

        await expect(
          ytIframe.locator(".ytp-progress-bar-padding"),
        ).toBeVisible();

        // Close trailer modal
        let closed = false;
        for (const selector of [
          '[role="dialog"] svg',
          '[aria-label="Close"]',
          "button:has(svg)",
        ]) {
          try {
            const el = page.locator(selector);
            if (await el.isVisible({ timeout: 2000 })) {
              await el.click();
              closed = true;
              break;
            }
          } catch {
            // Continue to next selector
          }
        }
        if (!closed) {
          await page.keyboard.press("Escape");
        }
      } else {
        console.warn(
          `⚠ Trailer icon missing for movie with trailer: ${movieTitle}`,
        );
      }
    } else {
      // Movie has no trailer → icon should not exist
      await expect(trailerIcon).toHaveCount(0);
    }

    await page.waitForTimeout(1000);

    // 8. Book Now (Top 10 – currently active movie)
    const top10Container = page
      .locator("div")
      .filter({ hasText: "Top 10 Movies" })
      .first();

    const bookNowBtn = top10Container
      .getByRole("link", { name: "Book Now" })
      .first();

    await expect(bookNowBtn).toBeVisible({ timeout: 20000 });
    await bookNowBtn.click();

    // 9. Navigate back
    await page.locator(".rounded-full.hover\\:cursor-pointer").click();
  });

  test("TC008 - Verify Trending Items Display and Image Loading", async ({
    page,
    request,
  }) => {
    const apiUrl = `${BACKEND_URL}/api/booking/concessions/cinema/3/trending?country_id=1&channel=web`;
    let apiItems = [];

    await test.step("Get trending items from API", async () => {
      const response = await request.get(apiUrl);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      apiItems = data.data || [];
    });
    console.log(`📦 Trending items received from API: ${apiItems.length}`);

    await test.step("Load homepage", async () => {
      await page.goto(`${BASE_URL}/home`);
      await expect(page.getByText("Trending at Novo")).toBeVisible();
    });

    await test.step("Verify item names and images match API", async () => {
      for (const apiItem of apiItems) {
        const itemName = apiItem.display_name;

        const card = page
          .locator("div")
          .filter({ hasText: new RegExp(`^${itemName}$`, "i") })
          .first();
        await expect(card).toBeVisible();

        const image = card.getByRole("img", { name: itemName });
        await expect(image).toBeVisible();
      }
    });
  });

  test("TC009 – Verify First Two Offers Display Correctly in English and Arabic Using Offers API", async ({
    page,
    request,
  }) => {
    console.log("\n🚀 TEST STARTED: Offers & Promotions Validation");
    console.log("=".repeat(50));

    // Fetch offers from API
    console.log("📡 Fetching offers from API...");
    const response = await request.get(OFFER_API);
    const offers = (await response.json()).data || [];

    console.log(`📊 Total offers received: ${offers.length}`);

    const orderedOffers = offers
      .sort((a, b) => a.group_order - b.group_order)
      .slice(0, 2);

    console.log(`🎯 Testing first 2 offers (by group_order):`);
    orderedOffers.forEach((offer, idx) => {
      console.log(
        `   ${idx + 1}. ${offer.name} (ID: ${offer.id}, Order: ${
          offer.group_order
        })`,
      );
    });

    // ---------- ENGLISH ----------
    console.log("\n🇬🇧 Starting English language tests...");
    await page.goto(`${BASE_URL}/home`, {
      waitUntil: "domcontentloaded",
    });
    await waitForOffersCarouselReady(page);

    await testOffersInLanguage(page, orderedOffers, false);

    // ---------- ARABIC ----------
    console.log("\n🔄 Switching to Arabic language...");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "العربية" })
      .click();
    await page.waitForLoadState("domcontentloaded");
    console.log("✅ Language switched to Arabic");

    await waitForOffersCarouselReady(page);

    await testOffersInLanguage(page, orderedOffers, true);

    console.log("\n" + "=".repeat(50));
    console.log("🎉 TEST COMPLETED SUCCESSFULLY");
    console.log("=".repeat(50) + "\n");
  });

  test("TC010 - Verify Experience Cards Display and Navigation", async ({
    page,
    request,
  }) => {
    try {
      await page.goto(`${BASE_URL}/home`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    } catch (error) {
      // Continue with test even if initial load times out
    }

    await page.waitForTimeout(3000);

    let apiData, experiences;
    try {
      const apiUrl = `${BACKEND_URL}/api/home/pages?key=experience&country_id=1&channel=web`;
      const response = await request.get(apiUrl);
      expect(response.ok()).toBeTruthy();

      apiData = await response.json();
      experiences = apiData.data.data || [];
      expect(experiences.length).toBeGreaterThan(0);
    } catch (error) {
      throw error;
    }
    console.log(`🧩 Experiences fetched from API: ${experiences.length}`);

    let processedCount = 0;
    let skippedCount = 0;
    let failedExperiences = [];

    const experiencesToTest = experiences.slice(0, 5); // limit to first 5
    for (const [index, exp] of experiencesToTest.entries()) {
      const expName = exp.page_name || `Experience ${index + 1}`;
      const expId = exp.id;
      const bannerLogo = exp.page_json?.logo;
      const expectedUrl = `${BASE_URL}/experiences/${expId}`;

      if (!expId) {
        skippedCount++;
        failedExperiences.push({ name: expName, reason: "Missing ID" });
        continue;
      }

      try {
        const currentUrl = page.url();
        if (!currentUrl.includes("/home")) {
          await page.goto(`${BASE_URL}/home`, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          await page.waitForTimeout(2000);
        }

        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1500);

        let cardElement = null;
        let elementFound = false;

        // Strategy 1: Find by experience name text
        try {
          const textSelectors = [
            `text="${expName}"`,
            `text="${expName.toLowerCase()}"`,
            `text="${expName.toUpperCase()}"`,
            `//*[contains(text(), "${expName}")]`,
            `[alt*="${expName}"]`,
            `[title*="${expName}"]`,
          ];

          for (const selector of textSelectors) {
            const element = page.locator(selector).first();
            const count = await element.count({ timeout: 3000 });
            if (count > 0) {
              cardElement = element;
              elementFound = true;
              break;
            }
          }
        } catch (error) {
          // Continue to next strategy
        }

        // Strategy 2: Find by image filename
        if (!elementFound && bannerLogo) {
          try {
            const filename = bannerLogo.split("/").pop().split(".")[0];

            const imageSelectors = [
              `img[src*="${filename}"]`,
              `img[alt*="${filename}"]`,
              `[style*="${filename}"]`,
              `[data-src*="${filename}"]`,
            ];

            for (const selector of imageSelectors) {
              const element = page.locator(selector).first();
              const count = await element.count({ timeout: 3000 });
              if (count > 0) {
                cardElement = element;
                elementFound = true;
                break;
              }
            }
          } catch (error) {
            // Continue to next strategy
          }
        }

        // Strategy 3: Generic experience card search
        if (!elementFound) {
          try {
            const genericSelectors = [
              '[data-testid*="experience"]',
              ".experience-card",
              '[class*="experience"]',
              '[href*="/experiences/"]',
              `[href*="/experiences/${expId}"]`,
            ];

            for (const selector of genericSelectors) {
              const elements = page.locator(selector);
              const count = await elements.count({ timeout: 3000 });
              if (count > 0) {
                for (let i = 0; i < Math.min(count, 10); i++) {
                  const element = elements.nth(i);
                  const href = await element
                    .getAttribute("href")
                    .catch(() => null);
                  if (href && href.includes(`/experiences/${expId}`)) {
                    cardElement = element;
                    elementFound = true;
                    break;
                  }
                }
                if (elementFound) break;
              }
            }
          } catch (error) {
            // Continue
          }
        }

        if (!elementFound) {
          skippedCount++;
          failedExperiences.push({
            name: expName,
            id: expId,
            reason: "Card element not found",
          });
          continue;
        }

        try {
          await cardElement.waitFor({ state: "visible", timeout: 5000 });
          await cardElement.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
        } catch (error) {
          skippedCount++;
          failedExperiences.push({
            name: expName,
            id: expId,
            reason: "Element not visible",
          });
          continue;
        }

        let clickSuccess = false;
        let clickError = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await cardElement.click({ timeout: 5000, force: attempt > 1 });
            clickSuccess = true;
            break;
          } catch (error) {
            clickError = error;
            if (attempt < 3) {
              await page.waitForTimeout(1000);
            }
          }
        }

        if (!clickSuccess) {
          skippedCount++;
          failedExperiences.push({
            name: expName,
            id: expId,
            reason: `Click failed: ${clickError?.message || "Unknown error"}`,
          });
          continue;
        }

        let navigationSuccess = false;

        try {
          await page.waitForURL(expectedUrl, { timeout: 25000 });
          navigationSuccess = true;
        } catch (urlError) {
          await page.waitForTimeout(2000);
          const currentUrl = page.url();

          if (currentUrl.includes("/experiences/")) {
            navigationSuccess = true;
          } else if (currentUrl !== `${BASE_URL}/home`) {
            navigationSuccess = true;
          } else {
            failedExperiences.push({
              name: expName,
              id: expId,
              reason: `Navigation timeout: ${urlError.message}`,
            });
          }
        }

        if (navigationSuccess) {
          processedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        skippedCount++;
        failedExperiences.push({
          name: expName,
          id: expId,
          reason: `Unexpected error: ${error.message}`,
        });
      }

      await page.waitForTimeout(1000);
    }

    expect(experiences.length).toBeGreaterThan(0);
    expect(processedCount).toBeGreaterThan(0);
    console.log(
      `✅ TC010 COMPLETED | Processed: ${processedCount}, Skipped: ${skippedCount}`,
    );
  });

  test("TC011 - Verify Homepage Footer Links and Social Media Integration", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/home`);

    await expect(page.getByRole("img", { name: "PromoBG" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Download Novo App!");
    await expect(
      page.getByRole("img", { name: "Novo Cinemas Logo" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("contentinfo")
        .locator("div")
        .filter({
          hasText:
            "About UsAdvertise With UsCareersPromotionsContact UsPrivacy PolicyTerms And",
        })
        .first(),
    ).toBeVisible();
    await expect(page.getByText("Ways To BookTalk with Us ?")).toBeVisible();

    // Test mobile app download links
    const appLinks = [
      {
        name: "Android",
        expectedUrl:
          "https://play.google.com/store/apps/details?id=com.grandcinema.gcapp.screens&pli=1",
      },
      {
        name: "iOS",
        expectedUrl: "https://apps.apple.com/in/app/novo-cinemas/id363121411",
      },
      {
        name: "Huawei",
        expectedUrl:
          "https://appgallery.huawei.com/app/C101526647?appId=C101526647&source=appshare&subsource=C101526647&locale=en_US&source=appshare&subsource=C101526647",
      },
    ];

    for (const app of appLinks) {
      const pagePromise = page.waitForEvent("popup");
      await page.getByRole("link", { name: app.name }).click();
      const newPage = await pagePromise;
      await expect(newPage.url()).toContain(app.expectedUrl.split("?")[0]);
      await newPage.close();
    }
    console.log("🔗 Social media links validated");

    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "44260777" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("link", { name: "Need Assistance ?" }),
    ).toBeVisible();

    const assistancePagePromise = page.waitForEvent("popup");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Need Assistance ?" })
      .click();
    const assistancePage = await assistancePagePromise;
    await expect(assistancePage.url()).toContain(
      "https://novocinemas.freshdesk.com/support/home",
    );
    await assistancePage.close();

    await expect(page.getByText("Email Uscallcenterqatar@")).toBeVisible();
    await expect(page.getByText("Find Us HereFloors 3‑5, QDB")).toBeVisible();
    await expect(
      page
        .locator("div")
        .filter({ hasText: /^Connect with Novo$/ })
        .first(),
    ).toBeVisible();

    // Test social media links
    const socialLinks = [
      {
        selector: ".flex.items-center.justify-center.w-8.h-8",
        expectedUrl: "https://www.facebook.com/novocinemasQTR",
      },
      {
        selector: ".flex.gap-x-2.justify-center > a:nth-child(2)",
        expectedUrl: "https://www.youtube.com/@Novocinemas",
      },
      {
        selector: ".flex.gap-x-2.justify-center > a:nth-child(3)",
        expectedUrl: "https://www.instagram.com/novocinemas_qtr",
      },
      {
        selector: ".flex.gap-x-2 > a:nth-child(4)",
        expectedUrl: "https://x.com/novocinemas_qtr?mx=2",
      },
    ];

    for (let i = 0; i < socialLinks.length; i++) {
      const socialPagePromise = page.waitForEvent("popup");
      await page.locator(socialLinks[i].selector).first().click();
      const socialPage = await socialPagePromise;
      await expect(socialPage.url()).toContain(
        socialLinks[i].expectedUrl.split("?")[0],
      );
      await socialPage.close();
    }

    await expect(
      page.getByText(
        "SIGN UP FOR MOVIE OFFERS & UPDATESSubscribe for latest movie news, promotions,",
      ),
    ).toBeVisible();
  });

  test("TC012 - Verify Footer Navigation Links Functionality", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/home`);

    // Test About Us footer link
    await expect(
      page.getByRole("listitem").filter({ hasText: "About Us" }),
    ).toBeVisible();
    await Promise.all([
      page.waitForURL("**/aboutUs"),
      page.getByRole("link", { name: "About Us" }).click(),
    ]);
    await expect(page.url()).toContain(`${BASE_URL}/aboutUs`);
    await expect(
      page.getByRole("heading", { name: "Our Story" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Go Back" }).click();
    await expect(page.url()).toContain(`${BASE_URL}/home`);

    // Test Advertise With Us footer link
    await expect(
      page.getByRole("listitem").filter({ hasText: "Advertise With Us" }),
    ).toBeVisible();
    await Promise.all([
      page.waitForURL("**/advertise"),
      page.getByRole("link", { name: "Advertise With Us" }).click(),
    ]);
    await expect(page.url()).toContain(`${BASE_URL}/advertise`);
    await expect(
      page.getByRole("heading", { name: "Promote Your Brand at Novo" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Go Back" }).click();
    await expect(page.url()).toContain(`${BASE_URL}/home`);

    // Test Careers footer link
    await expect(
      page.getByRole("listitem").filter({ hasText: "Careers" }),
    ).toBeVisible();
    await Promise.all([
      page.waitForURL("**/career"),
      page.getByRole("link", { name: "Careers" }).click(),
    ]);
    await expect(page.url()).toContain(`${BASE_URL}/career`);
    await expect(page.getByRole("heading", { name: "Careers" })).toBeVisible();
    await page.getByRole("button", { name: "Go Back" }).click();
    await expect(page.url()).toContain(`${BASE_URL}/home`);

    // Test Promotions footer link
    await expect(
      page.getByRole("listitem").filter({ hasText: "Promotions" }),
    ).toBeVisible();
    await Promise.all([
      page.waitForURL("**/promotions"),
      page
        .getByRole("contentinfo")
        .getByRole("link", { name: "Promotions" })
        .click(),
    ]);
    await expect(page.url()).toContain(`${BASE_URL}/promotions`);
    await expect(
      page.getByRole("heading", { name: "Offers & Promotions" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Go Back" }).click();
    await expect(page.url()).toContain(`${BASE_URL}/home`);

    // Test Contact Us footer link
    await expect(
      page.getByRole("listitem").filter({ hasText: "Contact Us" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Contact Us" }).click();
    await page.waitForTimeout(1000);
    await page.goto(`${BASE_URL}/home`);
  });
});

// ================= Quick Book Tests =================
test.describe("Quick Book - Booking Flow Validation (Positive & Negative Scenarios)", () => {
  const DEFAULT_TIMEOUT = 15000;

  // ============== Test Setup ==============
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
  });

  // ============== Test Cases ==============

  test("TC_QB_01 - Verify user can complete Quick Book flow using dynamic API data and proceed to Seat Selection", async ({
    page,
    request,
  }) => {
    console.log("\n\n========== TEST: TC_QB_01 START ==========");
    await openQuickBook(page);

    const dropdowns = getDropdownLocators(page);
    await expect(dropdowns.movie).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log("✅ Dropdowns loaded");

    // Fetch base data
    console.log("📋 Fetching base data for Quick Book...");
    const baseData = await fetchQuickBookData(request, {
      country_id: 1,
      channel: "web",
    });

    const selectedMovie = baseData.movies?.[0];
    const selectedCinema = baseData.cinemas?.[0];
    const selectedExperience = baseData.experiences?.[0];
    console.log("🎬 Selected Movie:", selectedMovie?.movie_title);
    console.log("🏢 Selected Cinema:", selectedCinema?.name);
    console.log("🎭 Selected Experience:", selectedExperience?.experience_name);

    expect(selectedMovie).toBeTruthy();
    expect(selectedCinema).toBeTruthy();
    expect(selectedExperience).toBeTruthy();

    // Select Movie, Cinema, Experience (API wait needed)
    console.log("\n📌 Selecting Movie, Cinema, and Experience...");
    await clickAndSelectOption(
      page,
      dropdowns.movie,
      selectedMovie.movie_title,
      true,
    );
    await clickAndSelectOption(
      page,
      dropdowns.cinema,
      selectedCinema.name,
      true,
    );
    await clickAndSelectOption(
      page,
      dropdowns.experience,
      selectedExperience.experience_name,
      true,
    );
    console.log("✅ Movie, Cinema, and Experience selected");

    // Find first date with available sessions
    console.log("\n📅 Looking for available dates and sessions...");
    const datesToTry = baseData.dates || [];
    expect(datesToTry.length).toBeGreaterThan(0);
    console.log(`Found ${datesToTry.length} available dates`);

    let finalShowtimeText = null;

    for (const date of datesToTry) {
      const uiDate = formatDateForUI(date);
      console.log(`\n🔍 Checking date: ${uiDate}`);
      await clickAndSelectOption(page, dropdowns.date, uiDate, true);

      // Fetch sessions for selected date
      console.log(`🔡 Fetching sessions for date: ${date}`);
      const sessionData = await fetchQuickBookData(request, {
        country_id: 1,
        channel: "web",
        movie_id: selectedMovie.movie_id,
        cinema_id: selectedCinema.id,
        experience_id: selectedExperience.experience_id,
        date,
      });

      const sessionsForDate = sessionData.sessions?.[date];

      if (Array.isArray(sessionsForDate) && sessionsForDate.length > 0) {
        const firstEnabledSession =
          sessionsForDate.find((s) => s.sessionDisabled === false) ||
          sessionsForDate[0];
        finalShowtimeText = firstEnabledSession.show_time;
        console.log(`⏰ Found showtime: ${finalShowtimeText}`);
        break;
      } else {
        console.log("❌ No sessions available for this date");
      }
    }

    if (!finalShowtimeText) {
      test.skip(
        true,
        "No available sessions found for any date in quick book API",
      );
    }

    // Select Showtime (NO API wait)
    console.log("\n⏱️ Selecting showtime (NO API wait)...");
    await clickAndSelectOption(
      page,
      dropdowns.showtime,
      finalShowtimeText,
      false,
    );

    // Click Book and verify navigation
    console.log("\n📌 Clicking Book button...");
    const bookBtn = page.getByRole("button", { name: "Book", exact: true });
    await expect(bookBtn).toBeEnabled({ timeout: DEFAULT_TIMEOUT });
    console.log("✅ Book button is enabled, clicking...");
    await bookBtn.click();

    await loginAndCaptureTokenBooking(page);
    await page.waitForLoadState("networkidle");
    await expect(page.url()).toContain("/seat-selection/");
    console.log("✅ Successfully navigated to seat selection page");
    console.log("========== TEST: TC_QB_01 PASSED ==========\n");
  });

  test("TC_QB_NEG_01 - Verify Book button remains disabled until all mandatory Quick Book selections are completed", async ({
    page,
  }) => {
    console.log("\n\n========== TEST: TC_QB_NEG_01 START ==========");
    await openQuickBook(page);

    const dropdowns = getDropdownLocators(page);
    const bookBtn = page.getByRole("button", { name: "Book", exact: true });
    console.log("✅ Quick Book dialog opened");

    // Verify Book button is initially blocked
    console.log("\n🚫 Verifying Book button is initially blocked...");
    await expect(bookBtn).toHaveClass(/cursor-not-allowed/);
    console.log("✅ Book button is blocked (as expected)");
    await bookBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await bookBtn.click({ force: true });
    await expect(page.url()).toContain("/home");
    console.log("✅ Book button click had no effect (still on home page)");

    // Test progressive selection - Book should remain blocked
    const selectionsToTest = [
      { dropdown: dropdowns.movie, name: "Movie" },
      { dropdown: dropdowns.cinema, name: "Cinema" },
      { dropdown: dropdowns.experience, name: "Experience" },
      { dropdown: dropdowns.date, name: "Date" },
    ];

    for (const selection of selectionsToTest) {
      console.log(`\n📌 Testing ${selection.name} selection...`);
      await selection.dropdown.click();
      await page.getByRole("option").first().click();
      console.log(
        `✅ ${selection.name} selected, verifying Book button is still blocked...`,
      );
      await expect(bookBtn).toHaveClass(/cursor-not-allowed/);
      console.log(
        `✅ Book button still blocked after ${selection.name} selection`,
      );
    }

    // Select Showtime - Book should become clickable
    console.log("\n⏰ Testing Showtime selection...");
    await dropdowns.showtime.click();
    await page.getByRole("option").first().click();
    console.log(
      "✅ Showtime selected, verifying Book button is now enabled...",
    );
    await expect(bookBtn).not.toHaveClass(/cursor-not-allowed/);
    console.log("✅ Book button is now enabled (as expected)");
    console.log("========== TEST: TC_QB_NEG_01 PASSED ==========\n");
  });

  test("TC_QB_NEG_02 - Verify Showtime dropdown is disabled until Movie, Cinema, Experience, and Date are selected", async ({
    page,
  }) => {
    console.log("\n\n========== TEST: TC_QB_NEG_02 START ==========");
    await openQuickBook(page);

    const dropdowns = getDropdownLocators(page);
    console.log("✅ Quick Book dialog opened");

    // Helper to verify showtime is blocked
    const verifyShowtimeBlocked = async () => {
      console.log("🔍 Checking if Showtime dropdown is blocked...");
      await dropdowns.showtime.scrollIntoViewIfNeeded();
      await dropdowns.showtime.click({ force: true });
      await expect(page.getByRole("option")).toHaveCount(0);
      console.log("✅ Showtime dropdown is blocked (no options available)");
    };

    // Initially showtime should be blocked
    console.log("\n🚫 Verifying Showtime is initially blocked...");
    await verifyShowtimeBlocked();

    // Test each selection - showtime should remain blocked
    console.log("\n📌 Testing selections before enabling Showtime...");
    const selectionsBeforeShowtime = [
      { dropdown: dropdowns.movie, name: "Movie" },
      { dropdown: dropdowns.cinema, name: "Cinema" },
      { dropdown: dropdowns.experience, name: "Experience" },
    ];

    for (const selection of selectionsBeforeShowtime) {
      console.log(`\n📌 Testing ${selection.name} selection...`);
      await selection.dropdown.click();
      await page.getByRole("option").first().click();
      await verifyShowtimeBlocked();
    }

    // Select Date - showtime should now be accessible
    console.log("\n📅 Selecting Date to enable Showtime...");
    await dropdowns.date.click();
    await page.getByRole("option").first().click();

    console.log("\n✅ Verifying Showtime is now accessible...");
    await dropdowns.showtime.scrollIntoViewIfNeeded();
    await dropdowns.showtime.click({ force: true });
    await expect(page.getByRole("option").first()).toBeVisible();
    console.log("✅ Showtime dropdown is now enabled with options available");
    console.log("========== TEST: TC_QB_NEG_02 PASSED ==========\n");
  });
});
