import { test, expect } from "@playwright/test";
import {
  createFBTracker,
  categorizeFandBItems,
  addFandBItemNoModifiers,
  addFandBItemWithModifiers,
  addFandBItemWithAlternates,
  verifyFandBInSidePanel,
  clickCinemaAndNavigateToFandB, // NEW IMPORT
} from "./helpers/direct-fnb-helpers.js";
import {
  applyAndRemoveGiftCardPayment,
  applyPartialGiftCardAndProceedToCreditPayment,
  completePayment,
  completePaymentWithGiftCard,
  applyNovoWalletOnly,
} from "./helpers/booking-helpers.js";

const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

if (!BASE_URL || !BACKEND_URL) {
  throw new Error("❌ Frontend or Backend URL missing in env");
}

async function loginAndCaptureTokenDirectFNB(page) {
  const EMAIL = process.env.LOGIN_EMAIL;
  const PASSWORD = process.env.LOGIN_PASSWORD;

  if (!EMAIL || !PASSWORD) {
    throw new Error("❌ LOGIN_EMAIL or LOGIN_PASSWORD is missing in .env");
  }

  let authToken = null;

  const tokenListener = (req) => {
    const headers = req.headers();
    if (headers.authorization?.startsWith("Bearer")) {
      authToken = headers.authorization;
    }
  };

  page.on("request", tokenListener);

  await page.getByRole("textbox", { name: "Enter your email" }).fill(EMAIL);
  await page
    .getByRole("textbox", { name: "Enter your password" })
    .fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(
    page.getByRole("button", { name: /CLICK HERE to order F&B/i })
  ).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(3000);

  if (!authToken) {
    authToken = await page.evaluate(() =>
      localStorage.getItem("authorization_token")
    );
  }

  page.off("request", tokenListener);

  if (!authToken) {
    throw new Error("❌ Direct F&B auth token not captured");
  }

  await page.evaluate(
    ([token]) => {
      localStorage.setItem("auth_token", token.replace("Bearer ", ""));
      localStorage.setItem("access_token", token.replace("Bearer ", ""));
      localStorage.setItem("authorization_token", token);
    },
    [authToken]
  );

  return authToken;
}

async function fetchCinemaDetails(request, lat, long, countryId = 1) {
  try {
    const response = await request.get(
      `${BACKEND_URL}/api/home/cinemas?lat=${lat}&long=${long}&country_id=${countryId}&channel=web`,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          origin: BASE_URL,
          referer: `${BASE_URL}/`,
        },
      }
    );

    if (!response.ok()) {
      console.error("Cinema details API response not OK:", response.status());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching cinema details:", error);
    return null;
  }
}

async function fetchCinemaTimings(request, countryId = 1) {
  try {
    const response = await request.get(
      `${BACKEND_URL}/api/cinema/cinema-timings?country_id=${countryId}&channel=web`,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          origin: BASE_URL,
          referer: `${BASE_URL}/`,
        },
      }
    );

    if (!response.ok()) {
      console.error("Cinema timings API response not OK:", response.status());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching cinema timings:", error);
    return null;
  }
}

test.describe("Direct F&B Online Ordering – Cinema Validation, Item Variants, and Payment Workflows", () => {
  test("TC_01 – Verify Direct F&B Cinema Listing Using Cinema Details and Timings API Validation", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(120000);

    await page.goto(`${BASE_URL}/home`, { waitUntil: "networkidle" });
    const context = page.context();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 19.1517288,
      longitude: 72.8341961,
    });

    await page.waitForURL(/novocinemas\.com\/home/, { timeout: 15000 });

    await page.getByRole("button", { name: "Food & Beverages" }).click();
    await expect(
      page.getByRole("link", { name: "Online Order" })
    ).toBeVisible();
    await page.getByRole("link", { name: "Online Order" }).click();
    await expect(page).toHaveURL(/takeaway/);
    await expect(
      page.getByRole("heading", { name: "Food & Drinks To-Go" })
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Log in to see your upcoming" })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Log in to see your upcoming" })
      .click();
    await loginAndCaptureTokenDirectFNB(page);

    await expect(
      page.getByRole("button", { name: "CLICK HERE to order F&B" })
    ).toBeVisible();
    await page.getByRole("button", { name: "CLICK HERE to order F&B" }).click();
    await expect(page).toHaveURL(/cinema/);
    await expect(page.getByRole("heading", { name: "Takeaway" })).toBeVisible();

    console.log("\n🎬 Starting API Validation...\n");

    const cinemaDetails = await fetchCinemaDetails(
      request,
      19.1517288,
      72.8341961
    );
    expect(cinemaDetails).not.toBeNull();
    expect(cinemaDetails.success).toBe(true);

    const cinemaTimings = await fetchCinemaTimings(request);
    expect(cinemaTimings).not.toBeNull();
    expect(cinemaTimings.success).toBe(true);

    console.log(
      `✅ Cinema Details API: ${cinemaDetails.data.length} cinemas found`
    );
    console.log(
      `✅ Cinema Timings API: ${cinemaTimings.data.length} timing entries found`
    );

    const cinemaDetailsMap = new Map();
    cinemaDetails.data.forEach((cinema) => {
      cinemaDetailsMap.set(cinema.id, {
        name: cinema.name,
        address: cinema.address,
        vista_id: cinema.vista_id,
      });
    });

    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    console.log(`\n📅 Today is: ${today}\n`);

    const todayTimingsMap = new Map();
    cinemaTimings.data
      .filter((timing) => timing.day === today && timing.is_active === true)
      .forEach((timing) => {
        if (!todayTimingsMap.has(timing.fk_cinema_id)) {
          todayTimingsMap.set(timing.fk_cinema_id, {
            open: timing.open_time,
            close: timing.close_time,
            cinema_name: timing.cinema_name,
          });
        }
      });

    console.log(`📊 Active cinemas today: ${todayTimingsMap.size}`);
    await page.waitForLoadState("domcontentloaded");
    console.log("\n🔍 Validating Cinemas on Page...\n");

    let foundCinemas = 0;
    let matchedCinemas = 0;
    const validationResults = [];

    for (const [cinemaId, timing] of todayTimingsMap.entries()) {
      const cinemaDetail = cinemaDetailsMap.get(cinemaId);

      if (!cinemaDetail) {
        console.log(`⚠️  Cinema ID ${cinemaId}: No details found`);
        continue;
      }

      try {
        const cinemaLocator = page
          .locator("div")
          .filter({
            hasText: new RegExp(cinemaDetail.name, "i"),
          })
          .filter({
            hasText:
              /Open:\s*\d{1,2}:\d{2}(?:am|pm)\s*-\s*\d{1,2}:\d{2}(?:am|pm)/,
          });

        const count = await cinemaLocator.count();

        if (count > 0) {
          foundCinemas++;
          const text = await cinemaLocator.first().textContent();
          const timeMatch = text.match(
            /Open:\s*(\d{1,2}:\d{2}(?:am|pm))\s*-\s*(\d{1,2}:\d{2}(?:am|pm))/
          );

          if (timeMatch) {
            const displayedOpen = timeMatch[1];
            const displayedClose = timeMatch[2];
            const timesMatch =
              displayedOpen === timing.open && displayedClose === timing.close;

            if (timesMatch) {
              matchedCinemas++;
              console.log(`✅ Cinema ID ${cinemaId} - ${cinemaDetail.name}`);
              console.log(`   Timings: ${timing.open} - ${timing.close} ✓`);
            }

            await expect(cinemaLocator.first()).toBeVisible();

            validationResults.push({
              cinemaId,
              name: cinemaDetail.name,
              address: cinemaDetail.address,
              apiOpen: timing.open,
              apiClose: timing.close,
              displayedOpen,
              displayedClose,
              matched: timesMatch,
            });
          }
        }
      } catch (error) {
        console.log(`❌ Cinema ID ${cinemaId}: Error - ${error.message}`);
      }

      console.log("");
    }

    console.log("═══════════════════════════════════════════════════");
    console.log("📈 VALIDATION SUMMARY");
    console.log("═══════════════════════════════════════════════════");
    console.log(`Total cinemas from API: ${cinemaDetailsMap.size}`);
    console.log(`Active cinemas today: ${todayTimingsMap.size}`);
    console.log(`Cinemas found on page: ${foundCinemas}`);
    console.log(`Exact matches: ${matchedCinemas}`);
    console.log(
      `Match rate: ${((matchedCinemas / todayTimingsMap.size) * 100).toFixed(
        1
      )}%`
    );
    console.log("═══════════════════════════════════════════════════\n");

    expect(foundCinemas).toBeGreaterThan(0);
    expect(matchedCinemas).toBeGreaterThan(0);

    await page.screenshot({
      path: "takeaway-cinema-validation.png",
      fullPage: true,
    });

    // Select and navigate to cinema
    console.log("\n🎯 Selecting a cinema for F&B ordering...\n");

    const selectedCinema = validationResults.find((cinema) => cinema.matched);
    if (!selectedCinema) {
      throw new Error("No matched cinema found");
    }

    console.log(`Selected Cinema: ${selectedCinema.name}`);
    console.log(`Cinema ID: ${selectedCinema.cinemaId}\n`);

    const selectedCinemaLocator = page
      .locator("div.relative.cursor-pointer.flex")
      .filter({ hasText: selectedCinema.name })
      .filter({
        hasText: new RegExp(
          `Open:\\s*${selectedCinema.displayedOpen}\\s*-\\s*${selectedCinema.displayedClose}`
        ),
      });

    // USE THE NEW COMBINED FUNCTION
    const concessionsData = await clickCinemaAndNavigateToFandB(
      page,
      selectedCinemaLocator,
      selectedCinema.cinemaId
    );

    console.log("\n📊 F&B API Data Loaded");
    console.log(
      `   Categories available: ${concessionsData.data?.length || 0}`
    );
  });

  test("TC_02 – Verify Direct F&B Order with Item Without Modifiers and Successful Checkout", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(120000);

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const context = page.context();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 19.1517288,
      longitude: 72.8341961,
    });
    await page.getByRole("button", { name: "Food & Beverages" }).click();
    await page.getByRole("link", { name: "Online Order" }).click();
    await page
      .getByRole("button", { name: "Log in to see your upcoming" })
      .click();
    await loginAndCaptureTokenDirectFNB(page);
    await page.getByRole("button", { name: "CLICK HERE to order F&B" }).click();

    const cinemaDetails = await fetchCinemaDetails(
      request,
      19.1517288,
      72.8341961
    );
    const cinemaTimings = await fetchCinemaTimings(request);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const todayTimingsMap = new Map();
    cinemaTimings.data
      .filter((timing) => timing.day === today && timing.is_active === true)
      .forEach((timing) => {
        if (!todayTimingsMap.has(timing.fk_cinema_id)) {
          todayTimingsMap.set(timing.fk_cinema_id, timing);
        }
      });

    const firstActiveCinemaId = Array.from(todayTimingsMap.keys())[0];
    const selectedCinemaName =
      cinemaDetails.data.find((c) => c.id === firstActiveCinemaId)?.name || "";
    const cinemaLocator = page
      .locator("div.relative.cursor-pointer.flex")
      .filter({ hasText: new RegExp(selectedCinemaName, "i") });

    // USE THE NEW COMBINED FUNCTION
    const concessionsData = await clickCinemaAndNavigateToFandB(
      page,
      cinemaLocator.first(),
      firstActiveCinemaId
    );

    const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);
    if (itemsWithNoModifiers.length === 0) {
      throw new Error("No F&B items without modifiers found");
    }

    const fbTracker = createFBTracker();
    const selectedItem = itemsWithNoModifiers[0];

    console.log(
      `\n🎯 Adding F&B Item (No Modifiers): ${selectedItem.itemName}`
    );
    await addFandBItemNoModifiers(page, selectedItem, fbTracker);
    await verifyFandBInSidePanel(page, fbTracker, selectedCinemaName);

    console.log(`\n✅ Successfully added: ${selectedItem.itemName}`);
    console.log(`   Total: QAR ${fbTracker.totalPrice.toFixed(2)}`);

    // ---- Capture only-concession POST API ----
    const onlyConcessionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(`${BACKEND_URL}/api/booking/concessions/only-concession`)
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname.includes("/takeaway/confirm"), {
        timeout: 30000,
      }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    // ---- Read & log API payload ----
    const onlyConcessionRequest = await onlyConcessionRequestPromise;
    const payload = onlyConcessionRequest.postDataJSON();

    console.log("\n📦 ONLY-CONCESSION API PAYLOAD");
    console.log(JSON.stringify(payload, null, 2));

    // Proceed to complete payment
    await completePayment(page);
  });

  test("TC_03 – Verify Direct F&B Order with Item Having Modifiers and Successful Checkout", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(120000);

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const context = page.context();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 19.1517288,
      longitude: 72.8341961,
    });
    await page.getByRole("button", { name: "Food & Beverages" }).click();
    await page.getByRole("link", { name: "Online Order" }).click();
    await page
      .getByRole("button", { name: "Log in to see your upcoming" })
      .click();
    await loginAndCaptureTokenDirectFNB(page);
    await page.getByRole("button", { name: "CLICK HERE to order F&B" }).click();

    const cinemaDetails = await fetchCinemaDetails(
      request,
      19.1517288,
      72.8341961
    );
    const cinemaTimings = await fetchCinemaTimings(request);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const todayTimingsMap = new Map();
    cinemaTimings.data
      .filter((timing) => timing.day === today && timing.is_active === true)
      .forEach((timing) => {
        if (!todayTimingsMap.has(timing.fk_cinema_id)) {
          todayTimingsMap.set(timing.fk_cinema_id, timing);
        }
      });

    const firstActiveCinemaId = Array.from(todayTimingsMap.keys())[0];
    const selectedCinemaName =
      cinemaDetails.data.find((c) => c.id === firstActiveCinemaId)?.name || "";
    const cinemaLocator = page
      .locator("div.relative.cursor-pointer.flex")
      .filter({ hasText: new RegExp(selectedCinemaName, "i") });

    const concessionsData = await clickCinemaAndNavigateToFandB(
      page,
      cinemaLocator.first(),
      firstActiveCinemaId
    );

    const { itemsWithModifiers } = categorizeFandBItems(concessionsData);
    if (itemsWithModifiers.length === 0) {
      throw new Error("No F&B items with modifiers found");
    }

    const fbTracker = createFBTracker();
    const selectedItem = itemsWithModifiers[0];

    console.log(
      `\n🎯 Adding F&B Item (With Modifiers): ${selectedItem.itemName}`
    );
    await addFandBItemWithModifiers(page, selectedItem, fbTracker);
    await verifyFandBInSidePanel(page, fbTracker, selectedCinemaName);

    console.log(`\n✅ Successfully added: ${selectedItem.itemName}`);
    console.log(`   Total: QAR ${fbTracker.totalPrice.toFixed(2)}`);

    // ---- Capture only-concession POST API ----
    const onlyConcessionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(`${BACKEND_URL}/api/booking/concessions/only-concession`)
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname.includes("/takeaway/confirm"), {
        timeout: 30000,
      }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    // ---- Read & log API payload ----
    const onlyConcessionRequest = await onlyConcessionRequestPromise;
    const payload = onlyConcessionRequest.postDataJSON();

    console.log("\n📦 ONLY-CONCESSION API PAYLOAD");
    console.log(JSON.stringify(payload, null, 2));

    // Proceed to complete payment
    await completePayment(page);
  });

  test("TC_04 – Verify Direct F&B Order with Item Having Alternates and Successful Checkout", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(120000);

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const context = page.context();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 19.1517288,
      longitude: 72.8341961,
    });
    await page.getByRole("button", { name: "Food & Beverages" }).click();
    await page.getByRole("link", { name: "Online Order" }).click();
    await page
      .getByRole("button", { name: "Log in to see your upcoming" })
      .click();
    const authToken = await loginAndCaptureTokenDirectFNB(page);
    await page.getByRole("button", { name: "CLICK HERE to order F&B" }).click();

    const cinemaDetails = await fetchCinemaDetails(
      request,
      19.1517288,
      72.8341961
    );
    const cinemaTimings = await fetchCinemaTimings(request);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const todayTimingsMap = new Map();
    cinemaTimings.data
      .filter((timing) => timing.day === today && timing.is_active === true)
      .forEach((timing) => {
        if (!todayTimingsMap.has(timing.fk_cinema_id)) {
          todayTimingsMap.set(timing.fk_cinema_id, timing);
        }
      });

    const firstActiveCinemaId = Array.from(todayTimingsMap.keys())[0];
    const selectedCinemaName =
      cinemaDetails.data.find((c) => c.id === firstActiveCinemaId)?.name || "";
    const cinemaLocator = page
      .locator("div.relative.cursor-pointer.flex")
      .filter({ hasText: new RegExp(selectedCinemaName, "i") });

    const concessionsData = await clickCinemaAndNavigateToFandB(
      page,
      cinemaLocator.first(),
      firstActiveCinemaId
    );

    const { itemsWithAlternates } = categorizeFandBItems(concessionsData);
    if (itemsWithAlternates.length === 0) {
      throw new Error("No F&B items with alternate items found");
    }

    const fbTracker = createFBTracker();
    const selectedItem = itemsWithAlternates[0];

    console.log(
      `\n🎯 Adding F&B Item (With Alternates): ${selectedItem.itemName}`
    );
    await addFandBItemWithAlternates(page, selectedItem, fbTracker);
    await verifyFandBInSidePanel(page, fbTracker, selectedCinemaName);

    console.log(`\n✅ Successfully added: ${fbTracker.items[0].name}`);
    console.log(`   Total: QAR ${fbTracker.totalPrice.toFixed(2)}`);

    // ---- Capture only-concession POST API ----
    const onlyConcessionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(`${BACKEND_URL}/api/booking/concessions/only-concession`)
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname.includes("/takeaway/confirm"), {
        timeout: 30000,
      }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    // ---- Read & log API payload ----
    const onlyConcessionRequest = await onlyConcessionRequestPromise;
    const payload = onlyConcessionRequest.postDataJSON();

    console.log("\n📦 ONLY-CONCESSION API PAYLOAD");
    console.log(JSON.stringify(payload, null, 2));

    // Proceed to complete payment
    await completePayment(page);
  });

  test("TC_05 – Verify Direct F&B Order with Item Without Modifiers Using Gift Card Payment", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(120000);

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const context = page.context();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 19.1517288,
      longitude: 72.8341961,
    });
    await page.getByRole("button", { name: "Food & Beverages" }).click();
    await page.getByRole("link", { name: "Online Order" }).click();
    await page
      .getByRole("button", { name: "Log in to see your upcoming" })
      .click();
    const authToken = await loginAndCaptureTokenDirectFNB(page);
    await page.getByRole("button", { name: "CLICK HERE to order F&B" }).click();

    const cinemaDetails = await fetchCinemaDetails(
      request,
      19.1517288,
      72.8341961
    );
    const cinemaTimings = await fetchCinemaTimings(request);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const todayTimingsMap = new Map();
    cinemaTimings.data
      .filter((timing) => timing.day === today && timing.is_active === true)
      .forEach((timing) => {
        if (!todayTimingsMap.has(timing.fk_cinema_id)) {
          todayTimingsMap.set(timing.fk_cinema_id, timing);
        }
      });

    const firstActiveCinemaId = Array.from(todayTimingsMap.keys())[0];
    const selectedCinemaName =
      cinemaDetails.data.find((c) => c.id === firstActiveCinemaId)?.name || "";
    const cinemaLocator = page
      .locator("div.relative.cursor-pointer.flex")
      .filter({ hasText: new RegExp(selectedCinemaName, "i") });

    // USE THE NEW COMBINED FUNCTION
    const concessionsData = await clickCinemaAndNavigateToFandB(
      page,
      cinemaLocator.first(),
      firstActiveCinemaId
    );

    const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);
    if (itemsWithNoModifiers.length === 0) {
      throw new Error("No F&B items without modifiers found");
    }

    const fbTracker = createFBTracker();
    const selectedItem = itemsWithNoModifiers[0];

    console.log(
      `\n🎯 Adding F&B Item (No Modifiers): ${selectedItem.itemName}`
    );
    await addFandBItemNoModifiers(page, selectedItem, fbTracker);
    await verifyFandBInSidePanel(page, fbTracker, selectedCinemaName);

    console.log(`\n✅ Successfully added: ${selectedItem.itemName}`);
    console.log(`   Total: QAR ${fbTracker.totalPrice.toFixed(2)}`);

    // ---- Capture only-concession POST API ----
    const onlyConcessionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(`${BACKEND_URL}/api/booking/concessions/only-concession`)
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname.includes("/takeaway/confirm"), {
        timeout: 30000,
      }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    // ---- Read & log API payload ----
    const onlyConcessionRequest = await onlyConcessionRequestPromise;
    const payload = onlyConcessionRequest.postDataJSON();

    console.log("\n📦 ONLY-CONCESSION API PAYLOAD");
    console.log(JSON.stringify(payload, null, 2));

    await completePaymentWithGiftCard(
      page,
      request,
      authToken,
      fbTracker.totalPrice
    );
    // ================= SIDE PANEL PRICE DISTRIBUTION VALIDATION =================

    // Values derived from F&B tracker
    const expectedFBAmount = Math.round(fbTracker.totalPrice);
    const expectedDiscount = expectedFBAmount;

    // --- F&B row (+ QAR XX) ---
    await expect(page.getByText("F&B").nth(1)).toBeVisible();

    await expect(page.getByText("+ QAR", { exact: false }).nth(1)).toHaveText(
      `+ QAR ${expectedFBAmount}`
    );

    // --- Gift Card Discount row (- QAR XX) ---
    await expect(page.getByText("Gift Card Discount").nth(1)).toBeVisible();

    await expect(page.getByText("- QAR", { exact: false }).nth(1)).toHaveText(
      `- QAR ${expectedDiscount}`
    );

    // --- Total Price label ---
    await expect(page.getByText("Total Price").nth(1)).toBeVisible();

    // --- Total Price (dynamic & safe) ---
    const expectedTotalPrice = Math.max(expectedFBAmount - expectedDiscount, 0);

    await expect(page.getByText("Total Price").nth(1)).toBeVisible();

    await expect(
      page.getByText(`QAR ${expectedTotalPrice}`, { exact: true }).nth(1)
    ).toBeVisible();

    // ================= CONFIRM BOOKING BUTTON VALIDATION =================

    const confirmBookingBtn = page.getByRole("button", {
      name: "Confirm Booking",
    });

    // Confirm Booking should be visible & enabled ONLY when total price is 0
    if (expectedTotalPrice === 0) {
      await expect(confirmBookingBtn).toBeVisible({ timeout: 10000 });
      await expect(confirmBookingBtn).toBeEnabled();

      console.log(
        "✅ Confirm Booking button is visible & enabled (Total Price = 0)"
      );

      // Optional: actually click Confirm Booking
      // await confirmBookingBtn.click();
      console.log("➡️ Clicked Confirm Booking");
    } else {
      // When price is not zero, button should NOT be clickable
      await expect(confirmBookingBtn).toBeVisible();
      await expect(confirmBookingBtn).toBeDisabled();

      console.log(
        `ℹ️ Confirm Booking disabled as Total Price = QAR ${expectedTotalPrice}`
      );
    }

    console.log("✅ Side panel price distribution verified successfully");
  });

  test("TC_06 – Verify Direct F&B Gift Card Application and Removal for Item Without Modifiers", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(120000);

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const context = page.context();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 19.1517288,
      longitude: 72.8341961,
    });
    await page.getByRole("button", { name: "Food & Beverages" }).click();
    await page.getByRole("link", { name: "Online Order" }).click();
    await page
      .getByRole("button", { name: "Log in to see your upcoming" })
      .click();
    const authToken = await loginAndCaptureTokenDirectFNB(page);
    await page.getByRole("button", { name: "CLICK HERE to order F&B" }).click();

    const cinemaDetails = await fetchCinemaDetails(
      request,
      19.1517288,
      72.8341961
    );
    const cinemaTimings = await fetchCinemaTimings(request);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const todayTimingsMap = new Map();
    cinemaTimings.data
      .filter((timing) => timing.day === today && timing.is_active === true)
      .forEach((timing) => {
        if (!todayTimingsMap.has(timing.fk_cinema_id)) {
          todayTimingsMap.set(timing.fk_cinema_id, timing);
        }
      });

    const firstActiveCinemaId = Array.from(todayTimingsMap.keys())[0];
    const selectedCinemaName =
      cinemaDetails.data.find((c) => c.id === firstActiveCinemaId)?.name || "";
    const cinemaLocator = page
      .locator("div.relative.cursor-pointer.flex")
      .filter({ hasText: new RegExp(selectedCinemaName, "i") });

    // USE THE NEW COMBINED FUNCTION
    const concessionsData = await clickCinemaAndNavigateToFandB(
      page,
      cinemaLocator.first(),
      firstActiveCinemaId
    );

    const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);
    if (itemsWithNoModifiers.length === 0) {
      throw new Error("No F&B items without modifiers found");
    }

    const fbTracker = createFBTracker();
    const selectedItem = itemsWithNoModifiers[0];

    console.log(
      `\n🎯 Adding F&B Item (No Modifiers): ${selectedItem.itemName}`
    );
    await addFandBItemNoModifiers(page, selectedItem, fbTracker);
    await verifyFandBInSidePanel(page, fbTracker, selectedCinemaName);

    console.log(`\n✅ Successfully added: ${selectedItem.itemName}`);
    console.log(`   Total: QAR ${fbTracker.totalPrice.toFixed(2)}`);

    // ---- Capture only-concession POST API ----
    const onlyConcessionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(`${BACKEND_URL}/api/booking/concessions/only-concession`)
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname.includes("/takeaway/confirm"), {
        timeout: 30000,
      }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    // ---- Read & log API payload ----
    const onlyConcessionRequest = await onlyConcessionRequestPromise;
    const payload = onlyConcessionRequest.postDataJSON();

    console.log("\n📦 ONLY-CONCESSION API PAYLOAD");
    console.log(JSON.stringify(payload, null, 2));

    await applyAndRemoveGiftCardPayment(
      page,
      request,
      authToken,
      fbTracker.totalPrice
    );

    console.log("✅ Side panel price distribution verified successfully");
  });

  test("TC_07 – Verify Direct F&B Order with Item Without Modifiers Using Gift Card and Credit Card Payment", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(120000);

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const context = page.context();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 19.1517288,
      longitude: 72.8341961,
    });
    await page.getByRole("button", { name: "Food & Beverages" }).click();
    await page.getByRole("link", { name: "Online Order" }).click();
    await page
      .getByRole("button", { name: "Log in to see your upcoming" })
      .click();
    const authToken = await loginAndCaptureTokenDirectFNB(page);
    await page.getByRole("button", { name: "CLICK HERE to order F&B" }).click();

    const cinemaDetails = await fetchCinemaDetails(
      request,
      19.1517288,
      72.8341961
    );
    const cinemaTimings = await fetchCinemaTimings(request);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const todayTimingsMap = new Map();
    cinemaTimings.data
      .filter((timing) => timing.day === today && timing.is_active === true)
      .forEach((timing) => {
        if (!todayTimingsMap.has(timing.fk_cinema_id)) {
          todayTimingsMap.set(timing.fk_cinema_id, timing);
        }
      });

    const firstActiveCinemaId = Array.from(todayTimingsMap.keys())[0];
    const selectedCinemaName =
      cinemaDetails.data.find((c) => c.id === firstActiveCinemaId)?.name || "";
    const cinemaLocator = page
      .locator("div.relative.cursor-pointer.flex")
      .filter({ hasText: new RegExp(selectedCinemaName, "i") });

    // USE THE NEW COMBINED FUNCTION
    const concessionsData = await clickCinemaAndNavigateToFandB(
      page,
      cinemaLocator.first(),
      firstActiveCinemaId
    );

    const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);
    if (itemsWithNoModifiers.length === 0) {
      throw new Error("No F&B items without modifiers found");
    }

    const fbTracker = createFBTracker();
    const selectedItem = itemsWithNoModifiers[0];

    console.log(
      `\n🎯 Adding F&B Item (No Modifiers): ${selectedItem.itemName}`
    );
    await addFandBItemNoModifiers(page, selectedItem, fbTracker);
    await verifyFandBInSidePanel(page, fbTracker, selectedCinemaName);

    console.log(`\n✅ Successfully added: ${selectedItem.itemName}`);
    console.log(`   Total: QAR ${fbTracker.totalPrice.toFixed(2)}`);

    // ---- Capture only-concession POST API ----
    const onlyConcessionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(`${BACKEND_URL}/api/booking/concessions/only-concession`)
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname.includes("/takeaway/confirm"), {
        timeout: 30000,
      }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    // ---- Read & log API payload ----
    const onlyConcessionRequest = await onlyConcessionRequestPromise;
    const payload = onlyConcessionRequest.postDataJSON();

    console.log("\n📦 ONLY-CONCESSION API PAYLOAD");
    console.log(JSON.stringify(payload, null, 2));

    const { cardNumber, appliedAmountQAR, remainingAmountQAR } =
      await applyPartialGiftCardAndProceedToCreditPayment(
        page,
        request,
        authToken,
        fbTracker.totalPrice
      );

    // ------------------ Side panel validation ------------------
    await expect(page.getByText("Gift Card Discount").nth(1)).toBeVisible();

    await expect(
      page.getByText(`- QAR ${appliedAmountQAR}`, { exact: true }).nth(1)
    ).toBeVisible();

    await expect(
      page.getByText(`QAR ${remainingAmountQAR}`, { exact: true }).nth(1)
    ).toBeVisible();

    console.log(
      `✅ Side panel verified → Gift Card: QAR ${appliedAmountQAR}, Remaining: QAR ${remainingAmountQAR}`
    );

    console.log("✅ Side panel price distribution verified successfully");
  });

  test("TC_08 – Verify Direct F&B Order with Item Without Modifiers Using Novo Wallet Payment", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(120000);

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    const context = page.context();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 19.1517288,
      longitude: 72.8341961,
    });
    await page.getByRole("button", { name: "Food & Beverages" }).click();
    await page.getByRole("link", { name: "Online Order" }).click();
    await page
      .getByRole("button", { name: "Log in to see your upcoming" })
      .click();
    const authToken = await loginAndCaptureTokenDirectFNB(page);
    await page.getByRole("button", { name: "CLICK HERE to order F&B" }).click();

    const cinemaDetails = await fetchCinemaDetails(
      request,
      19.1517288,
      72.8341961
    );
    const cinemaTimings = await fetchCinemaTimings(request);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const todayTimingsMap = new Map();
    cinemaTimings.data
      .filter((timing) => timing.day === today && timing.is_active === true)
      .forEach((timing) => {
        if (!todayTimingsMap.has(timing.fk_cinema_id)) {
          todayTimingsMap.set(timing.fk_cinema_id, timing);
        }
      });

    const firstActiveCinemaId = Array.from(todayTimingsMap.keys())[0];
    const selectedCinemaName =
      cinemaDetails.data.find((c) => c.id === firstActiveCinemaId)?.name || "";
    const cinemaLocator = page
      .locator("div.relative.cursor-pointer.flex")
      .filter({ hasText: new RegExp(selectedCinemaName, "i") });

    // USE THE NEW COMBINED FUNCTION
    const concessionsData = await clickCinemaAndNavigateToFandB(
      page,
      cinemaLocator.first(),
      firstActiveCinemaId
    );

    const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);
    if (itemsWithNoModifiers.length === 0) {
      throw new Error("No F&B items without modifiers found");
    }

    const fbTracker = createFBTracker();
    const selectedItem = itemsWithNoModifiers[0];

    console.log(
      `\n🎯 Adding F&B Item (No Modifiers): ${selectedItem.itemName}`
    );
    await addFandBItemNoModifiers(page, selectedItem, fbTracker);
    await verifyFandBInSidePanel(page, fbTracker, selectedCinemaName);

    console.log(`\n✅ Successfully added: ${selectedItem.itemName}`);
    console.log(`   Total: QAR ${fbTracker.totalPrice.toFixed(2)}`);

    // ---- Capture only-concession POST API ----
    const onlyConcessionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request
          .url()
          .includes(`${BACKEND_URL}/api/booking/concessions/only-concession`)
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname.includes("/takeaway/confirm"), {
        timeout: 30000,
      }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    // ---- Read & log API payload ----
    const onlyConcessionRequest = await onlyConcessionRequestPromise;
    const payload = onlyConcessionRequest.postDataJSON();

    console.log("\n📦 ONLY-CONCESSION API PAYLOAD");
    console.log(JSON.stringify(payload, null, 2));

    const creditCardOption = page
      .locator("div")
      .filter({ hasText: /^Credit Card$/ })
      .first();
    await expect(creditCardOption).toBeVisible();

    await applyNovoWalletOnly(page, request, authToken, fbTracker.totalPrice);
    // ================= SIDE PANEL PRICE DISTRIBUTION VALIDATION =================

    // Values derived from F&B tracker
    const expectedFBAmount = Math.round(fbTracker.totalPrice);
    const expectedDiscount = expectedFBAmount;

    // --- F&B row (+ QAR XX) ---
    await expect(page.getByText("F&B").nth(1)).toBeVisible();

    await expect(page.getByText("+ QAR", { exact: false }).nth(1)).toHaveText(
      `+ QAR ${expectedFBAmount}`
    );

    // --- Wallet Payment row (- QAR XX) ---
    await expect(page.getByText("Wallet Payment").nth(1)).toBeVisible();

    await expect(page.getByText("- QAR", { exact: false }).nth(1)).toHaveText(
      `- QAR ${expectedDiscount}`
    );

    // --- Total Price label ---
    await expect(page.getByText("Total Price").nth(1)).toBeVisible();

    // --- Total Price (dynamic & safe) ---
    const expectedTotalPrice = Math.max(expectedFBAmount - expectedDiscount, 0);

    await expect(page.getByText("Total Price").nth(1)).toBeVisible();

    await expect(
      page.getByText(`QAR ${expectedTotalPrice}`, { exact: true }).nth(1)
    ).toBeVisible();

    // ================= CONFIRM BOOKING BUTTON VALIDATION =================

    const confirmBookingBtn = page.getByRole("button", {
      name: "Confirm Booking",
    });

    // Confirm Booking should be visible & enabled ONLY when total price is 0
    if (expectedTotalPrice === 0) {
      await expect(confirmBookingBtn).toBeVisible({ timeout: 10000 });
      await expect(confirmBookingBtn).toBeEnabled();

      console.log(
        "✅ Confirm Booking button is visible & enabled (Total Price = 0)"
      );

      // Optional: actually click Confirm Booking
      // await confirmBookingBtn.click();
      console.log("➡️ Clicked Confirm Booking");
    } else {
      // When price is not zero, button should NOT be clickable
      await expect(confirmBookingBtn).toBeVisible();
      await expect(confirmBookingBtn).toBeDisabled();

      console.log(
        `ℹ️ Confirm Booking disabled as Total Price = QAR ${expectedTotalPrice}`
      );
    }

    console.log("✅ Side panel price distribution verified successfully");
  });
});
