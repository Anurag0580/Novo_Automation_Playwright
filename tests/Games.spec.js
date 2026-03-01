import { test, expect } from "@playwright/test";
import {
  createFBTracker,
  categorizeFandBItems,
  addFandBItemNoModifiers,
} from "./helpers/direct-fnb-helpers.js";
import { completePayment } from "./helpers/booking-helpers.js";
import {
  captureLandingBannerFileName,
  verifyBannerMatchesLanding,
  continueToFnbAndGetConcessionsResponse,
  getBookingDetailsPanel,
  continueToCheckoutAndGetOnlyConcessionData,
  getOnlyConcessionAmounts,
  getCheckoutPanel,
  verifyTicketAndFnbInCheckout,
  verifyTotalInCheckout,
  verifyConcessionItemsInCheckout,
} from "./helpers/games-flow-helpers.js";

const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

function getLowestPrice(game) {
  const allPrices = game.event_cinema.flatMap(cinema =>
    cinema.ho_codes.map(hc => hc.price_in_cents / 100)
  );
  return Math.min(...allPrices);
}

function getPriceForDuration(game, cinemaIndex, duration) {
  const cinema = game.event_cinema[cinemaIndex];
  const ho = cinema?.ho_codes?.find((h) => h.quantity === duration);
  return ho ? ho.price_in_cents / 100 : getLowestPrice(game);
}

export async function loginAndCaptureTokenGames(page) {
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

  await page.waitForURL(/\/games\/fnb/, { timeout: 30000 });

  await page.waitForTimeout(3000);

  if (!authToken) {
    authToken = await page.evaluate(() =>
      localStorage.getItem("authorization_token"),
    );
  }

  page.off("request", tokenListener);

  if (!authToken) {
    throw new Error("❌ Games auth token not captured");
  }

  await page.evaluate(
    ([token]) => {
      localStorage.setItem("auth_token", token.replace("Bearer ", ""));
      localStorage.setItem("access_token", token.replace("Bearer ", ""));
      localStorage.setItem("authorization_token", token);
    },
    [authToken],
  );

  return authToken;
}

test.describe("Games Booking Flow – UI, Pricing and Checkout API Validation", () => {
  let gamesData;
  let gamesTemplateData;

  async function clickBookNow(page, gameName) {
    const card = page.locator("div").filter({
      hasText: new RegExp(`^${gameName}${gameName}Book Now$`),
    });
    await card.getByRole("button").click();
    await page.waitForLoadState("networkidle");
  }

  test.beforeEach(async ({ page, request }) => {
    // Fetch API data before navigating
    const getGamesApi = await request.get(
      `${BACKEND_URL}/api/booking/get-games?country_id=1&channel=web`,
    );
    const gamesTemplateApi = await request.get(
      `${BACKEND_URL}/api/booking/game-templates?key=/games&country_id=1&channel=web`,
    );

    expect(getGamesApi.ok()).toBeTruthy();
    expect(gamesTemplateApi.ok()).toBeTruthy();

    gamesData = (await getGamesApi.json()).data; // array of games
    gamesTemplateData = (await gamesTemplateApi.json()).data; // page template object

    await page.goto(`${BASE_URL}/home`);
    await page.waitForLoadState('domcontentloaded');
    const bowlingAndBilliards = page
      .getByRole("navigation")
      .getByRole("link", { name: gamesTemplateData.page_name });
    await bowlingAndBilliards.click();
    await page.goto(`${BASE_URL}/games/pick`);
  });

  test("TC_GAMES_01 – Validate Games Landing Page URL, Title and Description", async ({ page }) => {
    // ── URL check ──────────────────────────────────────────────────────────
    await expect(page).toHaveURL(/games\/pick/);

    // ── Page heading from template API ────────────────────────────────────
    await expect(
      page.getByRole("heading", { name: gamesTemplateData.page_name }),
    ).toBeVisible();

    // ── Page description from template API ───────────────────────────────
    await expect(page.getByText(gamesTemplateData.page_desc)).toBeVisible();
  });

  test("TC_GAMES_02 – Validate Dynamic Game Card Rendering with Correct Banner and Title", async ({ page }) => {
    for (const game of gamesData) {
      // Game name visible on card
      await expect(
        page.getByRole("heading", { name: game.name }),
      ).toBeVisible();

      // Banner image rendered with correct src
      const bannerImg = page.getByRole("img", { name: game.name });
      await expect(bannerImg).toBeVisible();

      // Get the actual rendered src from UI
      const srcValue = await bannerImg.getAttribute("src");
      expect(srcValue).toBeTruthy(); // safety check

      // Extract filename from API banner URL
      const apiFilename = new URL(game.banner).pathname.split("/").pop();

      // Extract filename from UI CDN URL
      const uiFilename = new URL(srcValue).pathname.split("/").pop();

      // Compare only filenames
      expect(uiFilename).toBe(apiFilename);

      console.log(
        `✅ Verified game card for: ${game.name} with banner filename: ${apiFilename}`,
      );
    }
  });

test("TC_GAMES_03 – Validate Bowling End-to-End Booking with API Data Verification", async ({ page }) => {
  const game = gamesData.find(g => g.name === "Bowling");
  const basePrice = getLowestPrice(game);
  const expectedCinemaName =
    game.event_cinema.find((c) => c.cinema_name === "Mall of Qatar")?.cinema_name ||
    game.event_cinema[0]?.cinema_name;

  const landingBannerFileName = await captureLandingBannerFileName(page, game.name, BASE_URL);

  await clickBookNow(page, game.name);

  // -----------------------------
  // 1️⃣ Choose Location visible
  // -----------------------------
  await expect(page.getByText("Choose Location").first()).toBeVisible();

  // Verify all cinemas dynamically
  for (const cinema of game.event_cinema) {
    await expect(
      page.getByRole("button", { name: cinema.cinema_name })
    ).toBeVisible();
  }

  // -----------------------------
  // 2️⃣ Title from API
  // -----------------------------
  if (game.json?.title) {
    await expect(page.getByText(game.json.title)).toBeVisible();
  }

  // -----------------------------
  // 3️⃣ Base Price visible
  // -----------------------------
  await expect(
    page.getByText(`QAR ${basePrice}`)
  ).toBeVisible();

  // -----------------------------
  // 4️⃣ Note from API
  // -----------------------------
  if (game.json?.note) {
    await expect(
      page.getByText(game.json.note.substring(0, 20))
    ).toBeVisible();
  }

  const bowlingCard = page.locator("div").filter({
    has: page.getByRole("heading", { name: game.name })
  }).first();

  const baseQtyContainer = bowlingCard.locator("div").filter({
    hasText: new RegExp(`^1\\s*QAR\\s*${basePrice}`)
  }).first();
  await expect(baseQtyContainer).toBeVisible();

  const minusBtn = baseQtyContainer.getByRole("button").first();
  const plusBtn = baseQtyContainer.getByRole("button").nth(1);
  const qtyText = baseQtyContainer.getByText("1", { exact: true }).first();

  await expect(qtyText).toBeVisible();
  await expect(plusBtn).toBeVisible();
  await expect(plusBtn).toBeEnabled();

  const initialQty = Number((await qtyText.textContent()).trim());
  await plusBtn.click();
  const updatedQty = initialQty + 1;
  const qtySectionByTitle = bowlingCard.locator("div").filter({
    has: page.getByText(game.json.title)
  }).first();
  await expect(qtySectionByTitle.getByText(String(updatedQty), { exact: true })).toBeVisible();
  const expectedPrice = basePrice * updatedQty;
  await expect(bowlingCard.getByText(`QAR ${expectedPrice}`)).toBeVisible();

  let optionalTotal = 0;
  let optionalCount = 0;
  let firstOptionalName = null;
  let firstOptionalPrice = 0;
  for (const item of game.optional_items || []) {
    await expect(page.getByText(item.name)).toBeVisible();
    await expect(page.getByText("(Optional)")).toBeVisible();

    const optionalPrice = Math.min(
      ...item.event_cinema.flatMap(c =>
        c.ho_codes.map(h => h.price_in_cents / 100)
      )
    );

    const optionalSection = bowlingCard.locator("div").filter({
      has: page.getByText(item.name)
    }).first();
    const optionalContainer = optionalSection.locator("div").filter({
      has: page.getByRole("button"),
      hasText: /^0/
    }).first();
    await expect(optionalContainer.getByText("0", { exact: true })).toBeVisible();
    const optionalPlus = optionalContainer.getByRole("button").nth(1);
    await optionalPlus.click();
    optionalCount += 1;
    optionalTotal += optionalPrice;
    if (!firstOptionalName) {
      firstOptionalName = item.name;
      firstOptionalPrice = optionalPrice;
    }
    await expect(bowlingCard.getByText(`QAR ${optionalPrice}`)).toBeVisible();
  }

  // -----------------------------
  // 7️⃣ T&C Validation
  // -----------------------------
  if (game.json?.tnc) {
    await expect(
      page.getByText(game.json.tnc.split("|")[0]).first()
    ).toBeVisible();
  }

  // -----------------------------
  // 8️⃣ Checkbox visible
  // -----------------------------
  await page.getByRole("checkbox", {name: /I agree to Novo/}).first().check();

  //clicking on continue button
  const concessionsResponse = await continueToFnbAndGetConcessionsResponse(
    page,
    loginAndCaptureTokenGames,
  );
  const concessionsData = await concessionsResponse.json();

  const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);
  const normalItem = itemsWithNoModifiers[0];
  expect(normalItem).toBeTruthy();

  const fbTracker = createFBTracker();
  await addFandBItemNoModifiers(page, normalItem, fbTracker);

  const addedItemName = normalItem.item.concession_item_name || normalItem.itemName;
  await expect(page.getByText(new RegExp(addedItemName, "i")).first()).toBeVisible();

  // -----------------------------
  // 9️⃣ Sidepanel verification
  // -----------------------------
  const bookingDetailsPanel = await getBookingDetailsPanel(page, game.name, expectedCinemaName);
  await verifyBannerMatchesLanding(page, landingBannerFileName, BASE_URL);

  if (expectedCinemaName) {
    const gameTitleInBooking = page
      .locator("div")
      .filter({ hasText: new RegExp(`^Booking Details${game.name}${expectedCinemaName}$`) })
      .locator("span")
      .first();
    await expect(gameTitleInBooking).toBeVisible();

    await expect(page.getByText(expectedCinemaName).nth(1)).toBeVisible();
  }

  const gameDetailsHeader = page.locator("div").filter({ hasText: /^Game Details$/ }).first();
  await expect(gameDetailsHeader).toBeVisible();
  await gameDetailsHeader.click();

  await expect(page.getByText("No. of Games :").first()).toContainText(`No. of Games : ${updatedQty}`);
  await expect(page.getByText(`QAR ${expectedPrice}`, { exact: true }).first()).toBeVisible();

  if (firstOptionalName) {
    await expect(bookingDetailsPanel.getByText(`${firstOptionalName}: ${optionalCount}`)).toBeVisible();
    await expect(bookingDetailsPanel.getByText(`QAR ${firstOptionalPrice}`, { exact: true })).toBeVisible();
  }

  const expectedTicketAmount = Math.round(expectedPrice + optionalTotal);
  await expect(page.getByText("Ticket").first()).toBeVisible();
  await expect(page.getByText("+ QAR").first()).toHaveText(`+ QAR ${expectedTicketAmount}`);

  await expect(page.getByText("Food & Beverages").nth(3)).toBeVisible();
  await page
    .locator(".flex.flex-row.justify-between.gap-\\[10px\\].text-footerText.lg\\:pt-4")
    .first()
    .click();

  await expect(bookingDetailsPanel.getByText(addedItemName).first()).toBeVisible();
  await expect(
    bookingDetailsPanel.locator("div:visible").filter({
      hasText: new RegExp(`^QAR\\s*${fbTracker.totalPrice.toFixed(2).replace(".", "\\.")}$`),
    }).first(),
  ).toBeVisible();

  const expectedFnbAmount = Math.round(fbTracker.totalPrice);
  await expect(page.getByText("F&B").nth(1)).toBeVisible();
  await expect(page.getByText("+ QAR").nth(1)).toHaveText(`+ QAR ${expectedFnbAmount}`);

  const expectedTotalAmount = expectedTicketAmount + expectedFnbAmount;
  await expect(page.getByText("Total Price").first()).toBeVisible();
  await expect(page.getByText(`QAR ${expectedTotalAmount}`).first()).toHaveText(`QAR ${expectedTotalAmount}`);

  // -----------------------------
  // 🔟 Continue to checkout + map sidepanel with only-concession API
  // -----------------------------
  const onlyConcessionData = await continueToCheckoutAndGetOnlyConcessionData(
    page,
    bookingDetailsPanel,
  );

  const reservationId = onlyConcessionData?.data?.reservationId;
  console.log(`✅ Captured reservationId: ${reservationId}`);

  const { apiTicketAmount, apiFnbAmount, apiTotalAmount } = getOnlyConcessionAmounts(onlyConcessionData);
  const checkoutPanel = await getCheckoutPanel(page);
  await verifyBannerMatchesLanding(page, landingBannerFileName, BASE_URL);
  await verifyTicketAndFnbInCheckout(checkoutPanel, apiTicketAmount, apiFnbAmount);

  await verifyConcessionItemsInCheckout(
    checkoutPanel,
    onlyConcessionData?.data?.concessionItemData,
    game.name,
    true,
  );
  await verifyTotalInCheckout(checkoutPanel, apiTotalAmount);
  console.log(`✅ Verified checkout panel amounts match only-concession API: Ticket QAR ${Math.round(apiTicketAmount)}, F&B QAR ${Math.round(apiFnbAmount)}, Total QAR ${Math.round(apiTotalAmount)}`);

  await completePayment(page);
});

test("TC_GAMES_04 – Validate Bowling Second Cinema Booking Without Optional Items and Without F&B", async ({ page }) => {
  const game = gamesData.find((g) => g.name === "Bowling");
  const selectedCinemaData = game.event_cinema[1] || game.event_cinema[0];
  const expectedCinemaName = selectedCinemaData?.cinema_name;
  const selectedBasePrice = Math.min(
    ...selectedCinemaData.ho_codes.map((h) => h.price_in_cents / 100),
  );

  const landingBannerFileName = await captureLandingBannerFileName(page, game.name, BASE_URL);

  await clickBookNow(page, game.name);

  await expect(page.getByText("Choose Location").first()).toBeVisible();
  for (const cinema of game.event_cinema) {
    await expect(page.getByRole("button", { name: cinema.cinema_name })).toBeVisible();
  }

  if (expectedCinemaName) {
    await page.getByRole("button", { name: expectedCinemaName }).click();
    await page.waitForTimeout(500);
  }

  if (game.json?.title) {
    await expect(page.getByText(game.json.title)).toBeVisible();
  }

  await expect(page.getByText(`QAR ${selectedBasePrice}`)).toBeVisible();

  const bowlingCard = page.locator("div:visible").filter({
    has: page.getByRole("heading", { name: game.name }),
  }).first();

  let baseQtyContainer = bowlingCard.locator("div:visible").filter({
    hasText: new RegExp(`^1\\s*QAR\\s*${selectedBasePrice}`),
  }).first();

  if ((await baseQtyContainer.count()) === 0) {
    baseQtyContainer = bowlingCard.locator("div:visible").filter({
      hasText: /^1\s*QAR\s*/,
      has: bowlingCard.locator("button:visible"),
    }).first();
  }
  await expect(baseQtyContainer).toBeVisible();

  const updatedQty = 1;

  const qtySectionByTitle = bowlingCard.locator("div").filter({
    has: page.getByText(game.json.title),
  }).first();
  await expect(qtySectionByTitle.getByText(String(updatedQty), { exact: true }).first()).toBeVisible();

  const expectedPrice = selectedBasePrice;
  await expect(bowlingCard.getByText(`QAR ${expectedPrice}`)).toBeVisible();

  if (game.json?.tnc) {
    await expect(page.getByText(game.json.tnc.split("|")[0]).first()).toBeVisible();
  }

  await page.getByRole("checkbox", { name: /I agree to Novo/ }).first().check();

  await continueToFnbAndGetConcessionsResponse(page, loginAndCaptureTokenGames);

  const bookingDetailsPanel = await getBookingDetailsPanel(page, game.name, expectedCinemaName);
  await verifyBannerMatchesLanding(page, landingBannerFileName, BASE_URL);

  const gameDetailsHeader = page.locator("div").filter({ hasText: /^Game Details$/ }).first();
  await expect(gameDetailsHeader).toBeVisible();
  await gameDetailsHeader.click();

  await expect(page.getByText("No. of Games :").first()).toContainText(`No. of Games : ${updatedQty}`);
  await expect(page.getByText(`QAR ${expectedPrice}`, { exact: true }).first()).toBeVisible();

  const expectedTicketAmount = Math.round(expectedPrice);
  await expect(page.getByText("Ticket").first()).toBeVisible();
  await expect(page.getByText("+ QAR").first()).toHaveText(`+ QAR ${expectedTicketAmount}`);

  const onlyConcessionData = await continueToCheckoutAndGetOnlyConcessionData(
    page,
    bookingDetailsPanel,
  );
  const { apiTicketAmount, apiFnbAmount, apiTotalAmount } = getOnlyConcessionAmounts(onlyConcessionData);
  const checkoutPanel = await getCheckoutPanel(page);
  await verifyBannerMatchesLanding(page, landingBannerFileName, BASE_URL);
  await verifyTicketAndFnbInCheckout(checkoutPanel, apiTicketAmount, apiFnbAmount);
  await verifyConcessionItemsInCheckout(
    checkoutPanel,
    onlyConcessionData?.data?.concessionItemData,
    game.name,
    false,
  );
  await verifyTotalInCheckout(checkoutPanel, apiTotalAmount);

  await completePayment(page);
});

test("TC_GAMES_05 – Validate Billiard End-to-End Booking with Duration Update, F&B Addition and Checkout API Verification", async ({ page }) => {
  const game = gamesData.find((g) => g.name === "Billiard");
  const updatedQty = 2;
  const basePrice = getLowestPrice(game);
  const expectedCinemaName =
    game.event_cinema.find((c) => c.cinema_name === "Mall of Qatar")?.cinema_name ||
    game.event_cinema[0]?.cinema_name;
  const cinemaIndex = game.event_cinema.findIndex((c) => c.cinema_name === expectedCinemaName);
  const priceAtUpdatedQty = getPriceForDuration(game, cinemaIndex >= 0 ? cinemaIndex : 0, updatedQty);

  const landingBannerFileName = await captureLandingBannerFileName(page, game.name, BASE_URL);

  await clickBookNow(page, game.name);

  await expect(page.getByText("Choose Location").nth(1)).toBeVisible();
  for (const cinema of game.event_cinema) {
    await expect(page.getByRole("button", { name: cinema.cinema_name })).toBeVisible();
  }

  if (game.json?.title) {
    await expect(page.getByText(game.json.title)).toBeVisible();
  }

  await expect(page.getByText(`QAR ${basePrice}`)).toBeVisible();

  const billiardCard = page.locator("div").filter({
    has: page.getByRole("heading", { name: game.name }),
  }).first();

  const baseQtyContainer = billiardCard.locator("div").filter({
    hasText: new RegExp(`^1\\s*QAR\\s*${basePrice}`),
  }).first();
  await expect(baseQtyContainer).toBeVisible();

  const plusBtn = baseQtyContainer.getByRole("button").nth(1);
  const qtyText = baseQtyContainer.getByText("1", { exact: true }).first();
  await expect(qtyText).toBeVisible();
  await expect(plusBtn).toBeVisible();
  await expect(plusBtn).toBeEnabled();

  await plusBtn.click();
  await page.waitForTimeout(300);
  const qtySectionByTitle = billiardCard.locator("div").filter({
    has: page.getByText(game.json.title),
  }).first();
  await expect(qtySectionByTitle.getByText(String(updatedQty), { exact: true })).toBeVisible();
  await expect(billiardCard.getByText(`QAR ${priceAtUpdatedQty}`)).toBeVisible();

  const expectedPrice = priceAtUpdatedQty;

  if (game.json?.tnc) {
    await expect(page.getByText(game.json.tnc.split("|")[0]).nth(1)).toBeVisible();
  }

  await page.getByRole("checkbox", { name: /I agree to Novo/ }).first().check();

  const concessionsResponse = await continueToFnbAndGetConcessionsResponse(
    page,
    loginAndCaptureTokenGames,
  );
  const concessionsData = await concessionsResponse.json();

  const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);
  const normalItem = itemsWithNoModifiers[0];
  expect(normalItem).toBeTruthy();

  const fbTracker = createFBTracker();
  await addFandBItemNoModifiers(page, normalItem, fbTracker);

  const addedItemName = normalItem.item.concession_item_name || normalItem.itemName;
  await expect(page.getByText(new RegExp(addedItemName, "i")).first()).toBeVisible();

  const bookingDetailsPanel = await getBookingDetailsPanel(page, game.name, expectedCinemaName);
  await verifyBannerMatchesLanding(page, landingBannerFileName, BASE_URL);

  const gameDetailsHeader = page.locator("div").filter({ hasText: /^Game Details$/ }).first();
  await expect(gameDetailsHeader).toBeVisible();
  await gameDetailsHeader.click();

  await expect(page.getByText(/Duration|No\. of Games/).first()).toContainText(String(updatedQty));
  await expect(page.getByText(`QAR ${expectedPrice}`, { exact: true }).first()).toBeVisible();

  const expectedTicketAmount = Math.round(expectedPrice);
  await expect(page.getByText("Ticket").first()).toBeVisible();
  await expect(page.getByText("+ QAR").first()).toHaveText(`+ QAR ${expectedTicketAmount}`);

  await expect(page.getByText("Food & Beverages").nth(3)).toBeVisible();
  await page
    .locator(".flex.flex-row.justify-between.gap-\\[10px\\].text-footerText.lg\\:pt-4")
    .first()
    .click();

  await expect(bookingDetailsPanel.getByText(addedItemName).first()).toBeVisible();
  await expect(
    bookingDetailsPanel.locator("div:visible").filter({
      hasText: new RegExp(`^QAR\\s*${fbTracker.totalPrice.toFixed(2).replace(".", "\\.")}$`),
    }).first(),
  ).toBeVisible();

  const expectedFnbAmount = Math.round(fbTracker.totalPrice);
  await expect(page.getByText("F&B").nth(1)).toBeVisible();
  await expect(page.getByText("+ QAR").nth(1)).toHaveText(`+ QAR ${expectedFnbAmount}`);

  const expectedTotalAmount = expectedTicketAmount + expectedFnbAmount;
  await expect(page.getByText("Total Price").first()).toBeVisible();
  await expect(page.getByText(`QAR ${expectedTotalAmount}`).first()).toHaveText(`QAR ${expectedTotalAmount}`);

  const onlyConcessionData = await continueToCheckoutAndGetOnlyConcessionData(
    page,
    bookingDetailsPanel,
  );

  const { apiTicketAmount, apiFnbAmount, apiTotalAmount } = getOnlyConcessionAmounts(onlyConcessionData);
  const checkoutPanel = await getCheckoutPanel(page);
  await verifyBannerMatchesLanding(page, landingBannerFileName, BASE_URL);
  await verifyTicketAndFnbInCheckout(checkoutPanel, apiTicketAmount, apiFnbAmount);
  await verifyConcessionItemsInCheckout(
    checkoutPanel,
    onlyConcessionData?.data?.concessionItemData,
    game.name,
    true,
  );
  await verifyTotalInCheckout(checkoutPanel, apiTotalAmount);

  await completePayment(page);
});

test("TC_GAMES_06 – Validate Billiard Direct Checkout with Base Pricing (No F&B)", async ({ page }) => {
  const game = gamesData.find((g) => g.name === "Billiard");
  test.skip(!game || !game.event_cinema || game.event_cinema.length < 2, "Billiard second cinema is not available");

  const selectedCinemaIndex = 1;
  const selectedCinemaData = game.event_cinema[selectedCinemaIndex];
  const expectedCinemaName = selectedCinemaData?.cinema_name;
  const updatedQty = 1;
  const selectedPrice = getPriceForDuration(game, selectedCinemaIndex, updatedQty);

  const landingBannerFileName = await captureLandingBannerFileName(page, game.name, BASE_URL);

  await clickBookNow(page, game.name);

  await expect(page.getByText("Choose Location").nth(1)).toBeVisible();
  for (const cinema of game.event_cinema) {
    await expect(page.getByRole("button", { name: cinema.cinema_name })).toBeVisible();
  }

  if (expectedCinemaName) {
    await page.getByRole("button", { name: expectedCinemaName }).click();
    await page.waitForTimeout(500);
  }

  if (game.json?.title) {
    await expect(page.getByText(game.json.title)).toBeVisible();
  }

  await expect(page.getByText(`QAR ${selectedPrice}`)).toBeVisible();

  const billiardCard = page.locator("div:visible").filter({
    has: page.getByRole("heading", { name: game.name }),
  }).first();

  let baseQtyContainer = billiardCard.locator("div:visible").filter({
    hasText: new RegExp(`^1\\s*QAR\\s*${selectedPrice}`),
  }).first();

  if ((await baseQtyContainer.count()) === 0) {
    baseQtyContainer = billiardCard.locator("div:visible").filter({
      hasText: /^1\s*QAR\s*/,
      has: billiardCard.locator("button:visible"),
    }).first();
  }
  await expect(baseQtyContainer).toBeVisible();

  await expect(baseQtyContainer.getByText(String(updatedQty), { exact: true }).first()).toBeVisible();
  await expect(billiardCard.getByText(`QAR ${selectedPrice}`)).toBeVisible();

  if (game.json?.tnc) {
    await expect(page.getByText(game.json.tnc.split("|")[0]).nth(1)).toBeVisible();
  }

  await page.getByRole("checkbox", { name: /I agree to Novo/ }).first().check();

  await continueToFnbAndGetConcessionsResponse(page, loginAndCaptureTokenGames);

  const bookingDetailsPanel = await getBookingDetailsPanel(page, game.name, expectedCinemaName);
  await verifyBannerMatchesLanding(page, landingBannerFileName, BASE_URL);

  const gameDetailsHeader = page.locator("div").filter({ hasText: /^Game Details$/ }).first();
  await expect(gameDetailsHeader).toBeVisible();
  await gameDetailsHeader.click();

  await expect(page.getByText(/Duration|No\. of Games/).first()).toContainText(String(updatedQty));
  await expect(page.getByText(`QAR ${selectedPrice}`, { exact: true }).first()).toBeVisible();

  const expectedTicketAmount = Math.round(selectedPrice);
  await expect(page.getByText("Ticket").first()).toBeVisible();
  await expect(page.getByText("+ QAR").first()).toHaveText(`+ QAR ${expectedTicketAmount}`);

  const onlyConcessionData = await continueToCheckoutAndGetOnlyConcessionData(
    page,
    bookingDetailsPanel,
  );
  const { apiTicketAmount, apiFnbAmount, apiTotalAmount } = getOnlyConcessionAmounts(onlyConcessionData);
  const checkoutPanel = await getCheckoutPanel(page);
  await verifyBannerMatchesLanding(page, landingBannerFileName, BASE_URL);
  await verifyTicketAndFnbInCheckout(checkoutPanel, apiTicketAmount, apiFnbAmount);
  await verifyTotalInCheckout(checkoutPanel, apiTotalAmount);

  await completePayment(page);
});

});

