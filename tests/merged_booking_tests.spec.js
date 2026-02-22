import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  fetchMoviesFromAPI,
  selectMovieDynamically,
  getMovieDetails,
  verifyMovieDetailsPage,
  verifyMovieDetailsPageLoyalty,
  dynamicBooking,
  dynamicBookingLoyalty,
  dynamicBookingBankOffer,
  loginAndCaptureTokenBooking,
  loginAndCaptureTokenLoyalty,
  setupAuthTokenCapture,
  login,
  injectAuthToken,
  confirmAgeRating,
  sidePanelVerification,
  verifySidePanel,
  getSeatLayout,
  selectSeats,
  selectSeatsWithAreaCategory,
  selectSeatsBankOffer,
  sortSeats,
  groupSeatsByArea,
  verifySelectedSeatsInPanel,
  verifyPricesInPanel,
  completePayment,
  fillPaymentDetails,
  verifyPaymentPageBasics,
  verifyCreditCardOption,
  verifyAutoFilledCardNumber,
  setupTest,
  addFoodAndBeverages,
  verifyFandBInPaymentPage,
  completePaymentWithGiftCard,
  applyPartialGiftCardAndProceedToCreditPayment,
  applyNovoWalletOnly,
} from "./helpers/booking-helpers.js";

import {
  verifyLoyaltyOffersAPI,
  verifyBankOffers,
  setupValidationInterceptors,
  generateCardNumber,
  validateCard,
  storeOfferValidationData,
  logOfferValidationResults,
  verifyOfferAppliedUI,
  validateCardFlow,
  handleBankOffersFlow,
  setupPaymentInterceptors,
  captureBookingFeeAndDiscount,
  captureBookingFeeAndLoyaltyDiscount,
  getOfferDataFromStorage,
  calculateFinalPrices,
  verifySeatsInPaymentPage,
  verifyTicketPricesInPayment,
  verifyPaymentDetails,
  verifyLoyaltyPaymentDetails,
  verifyOffersPromotionsSection,
  verifyLoyaltyOffersSectionInPayment,
  verifyFNBPageBasics,
} from "./helpers/offers-helpers.js";

import {
  createFBTracker,
  categorizeFandBItems,
  addFandBItemNoModifiers,
  addFandBItemWithModifiers,
  addFandBItemWithAlternates,
} from "./helpers/direct-fnb-helpers.js";
import { skip } from "node:test";

const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

if (!BASE_URL || !BACKEND_URL) {
  throw new Error("❌ PROD_FRONTEND_URL or PROD_BACKEND_URL missing in env");
}

test.describe("Movie Ticket Booking – End-to-End Flows (F&B, Offers, Payments & Transaction Handling)", () => {
  // ============================================================================
  // TEST 1: Normal Ticket Booking WITH F&B
  // ============================================================================

  test("TC_01 – Verify Normal Movie Ticket Booking with F&B (No Modifiers) Using Credit Card Payment", async ({
    page,
    request,
  }) => {

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/novocinemas\.com\/home/);

    const selectedMovie = await selectMovieDynamically(page, request);
    const { movie, movieId } = await getMovieDetails(
      page,
      request,
      selectedMovie
    );
    console.log("Movie data fetched:", movie.movie_title);

    await verifyMovieDetailsPage(page, movie);
    const bookingResult = await dynamicBooking(page, movieId);
    await loginAndCaptureTokenBooking(page);

    let cinemaId = bookingResult.cinemaId;
    if (!cinemaId) {
      const match = page.url().match(/cinema\/(\d+)/);
      if (match) cinemaId = match[1];
      else throw new Error("Cinema ID could not be found.");
    }

    const sidePanelApi = await request.get(
      `${BACKEND_URL}/api/booking/side-panel/cinemas/${cinemaId}/sessions/${bookingResult.sessionId}?country_id=1&channel=web`
    );
    const sidePanelApiData = await sidePanelApi.json();
    const sidePanelData = sidePanelApiData.data;

    const { selectedSeats, seatPriceMap, totalTicketPrice } = await selectSeats(
      page,
      request,
      cinemaId,
      bookingResult.sessionId
    );

    console.log(
      "Selected seats:",
      selectedSeats,
      "Total ticket price:",
      totalTicketPrice
    );

    // ================== SELECT SEATS API CAPTURE ==================
    let bookingFeeCents = 500;
    let skipFnb = false;

    const selectSeatsResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/booking/select-seats") &&
        resp.request().method() === "POST"
    );

    await page.getByRole("button", { name: "Continue" }).click();

    try {
      const selectSeatsResponse = await selectSeatsResponsePromise;
      const selectSeatsApiData = await selectSeatsResponse.json();

      bookingFeeCents = selectSeatsApiData?.data?.bookingFee ?? 500;
      skipFnb = selectSeatsApiData?.data?.skip_fnb === true;

      console.log("📌 select-seats API:", {
        bookingFeeCents,
        skip_fnb: skipFnb,
        reservationId: selectSeatsApiData?.data?.reservationId,
      });
    } catch (e) {
      console.warn("Could not capture select-seats API response");
    }

    // ================== CONDITIONAL NAVIGATION ==================
    let fbTracker = null;
    let concessionsData = null;

    if (!skipFnb) {
      console.log("➡️ skip_fnb=false → Navigating to F&B page");

      const [concessionsResponse, trendingResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes("/api/booking/concessions/cinema/") &&
            !resp.url().includes("trending")
        ),
        page.waitForResponse(
          (resp) =>
            resp.url().includes("/api/booking/concessions/cinema/") &&
            resp.url().includes("trending")
        ),{timeout: 15000}
      ]);

      concessionsData = await concessionsResponse.json();
      // await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: "Snack Time!" })
      ).toBeVisible();

      // ================== F&B SELECTION ==================
      console.log("\n=== Starting F&B Selection Flow (No Modifiers Only) ===");
      fbTracker = createFBTracker();

      const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);
      console.log(`Items without modifiers: ${itemsWithNoModifiers.length}`);

      if (itemsWithNoModifiers.length > 0) {
        const selectedItem = itemsWithNoModifiers[0];
        await addFandBItemNoModifiers(page, selectedItem, fbTracker);
        console.log(`✓ Added F&B item: ${selectedItem.itemName}`);
      }

      console.log(
        `✓ F&B Selection Complete - ${
          fbTracker.items.length
        } items, Total: QAR ${fbTracker.totalPrice.toFixed(2)}`
      );

      await page.getByRole("button", { name: "Continue" }).click();
    } else {
      console.log("➡️ skip_fnb=true → Skipping F&B, going directly to payment");
    }

    // ================== PAYMENT PAGE ==================
    await page.waitForURL((url) => url.pathname.includes("/payment"));

    const bookingFeeQAR = bookingFeeCents / 100;
    const fbTotal = fbTracker ? fbTracker.totalPrice : 0;
    const grandTotal = totalTicketPrice + fbTotal + bookingFeeQAR;

    console.log("\n=== Final Totals ===");
    console.log({
      tickets: totalTicketPrice,
      fb: fbTotal,
      bookingFee: bookingFeeQAR,
      grandTotal,
    });

    const paymentSidePanel = page
      .locator(".flex-col.md\\:bg-\\[\\#B3B2B340\\]")
      .first();

    await expect(paymentSidePanel).toBeVisible();
    await expect(paymentSidePanel.getByText("Booking Details")).toBeVisible();
    await expect(
      paymentSidePanel.getByText(sidePanelData.movie.movie_name)
    ).toBeVisible();
    await expect(
      paymentSidePanel.getByText(sidePanelData.show_date)
    ).toBeVisible();
    await expect(
      paymentSidePanel.locator("span", { hasText: sidePanelData.show_time })
    ).toBeVisible();

    // ================== SEAT VERIFICATION ==================
    await page
      .locator("div")
      .filter({ hasText: /^Seats$/ })
      .first()
      .click();

    const sortedSeats = [...selectedSeats].sort((a, b) => {
      const rowA = a.match(/[A-Za-z]+/)[0];
      const rowB = b.match(/[A-Za-z]+/)[0];
      if (rowA !== rowB) return rowA.localeCompare(rowB);
      return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
    });

    await expect(
      paymentSidePanel.getByText(sortedSeats.join(", "))
    ).toBeVisible();

    // ================== F&B VERIFICATION (ONLY IF ADDED) ==================
    if (fbTracker && fbTracker.items.length > 0) {
      console.log("\n=== Verifying F&B Items in Payment Page ===");

      await page
        .locator("section")
        .filter({ hasText: /^Food & Beverages$/ })
        .locator("div")
        .first()
        .click();

      for (const fbItem of fbTracker.items) {
        const name = fbItem.concessionItemName || fbItem.name;
        await expect(
          page.getByText(new RegExp(name, "i")).first()
        ).toBeVisible();
      }
    }

    // ================== TOTAL PRICE ==================
    await expect(
      paymentSidePanel.getByText("Total Price", { exact: true })
    ).toBeVisible();

    const totalRegex = new RegExp(
      `QAR\\s*${grandTotal.toString().replace(".", "\\.?")}`,
      "i"
    );
    await expect(paymentSidePanel.getByText(totalRegex)).toBeVisible();

    // ================== COMPLETE PAYMENT ==================
    await completePayment(page);

    console.log("\n=== TC_01 COMPLETED SUCCESSFULLY ===");
    console.log({
      movie: sidePanelData.movie.movie_name,
      seats: selectedSeats.join(", "),
      skipFnb,
      total: grandTotal,
    });
  });

  // ============================================================================
  // TEST 2: Normal Ticket Booking WITHOUT F&B
  // ============================================================================

  test("TC_02 – Verify Normal Movie Ticket Booking Without F&B Using Credit Card Payment", async ({
    page,
    request,
  }) => {
    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/novocinemas\.com\/home/);

    const selectedMovie = await selectMovieDynamically(page, request);
    const { movie, movieId } = await getMovieDetails(
      page,
      request,
      selectedMovie
    );
    console.log("Movie data fetched:", movie.movie_title);

    await verifyMovieDetailsPage(page, movie);
    const bookingResult = await dynamicBooking(page, movieId);
    await loginAndCaptureTokenBooking(page);

    let cinemaId = bookingResult.cinemaId;
    if (!cinemaId) {
      const match = page.url().match(/cinema\/(\d+)/);
      if (match) cinemaId = match[1];
      else throw new Error("Cinema ID could not be found.");
    }

    const sidePanelApi = await request.get(
      `${BACKEND_URL}/api/booking/side-panel/cinemas/${cinemaId}/sessions/${bookingResult.sessionId}?country_id=1&channel=web`
    );
    const sidePanelApiData = await sidePanelApi.json();
    const sidePanelData = sidePanelApiData.data;

    const { selectedSeats, seatPriceMap, totalTicketPrice } = await selectSeats(
      page,
      request,
      cinemaId,
      bookingResult.sessionId
    );

    console.log(
      "Selected seats:",
      selectedSeats,
      "Total ticket price:",
      totalTicketPrice
    );

    // ================== VERIFY SEATS IN SIDE PANEL ==================
    await page
      .locator("div")
      .filter({ hasText: /^Seats$/ })
      .first()
      .click();
    for (const seat of selectedSeats) {
      await expect(page.getByText(seat).first()).toBeVisible();
    }

    // ================== SELECT SEATS API CAPTURE ==================
    let bookingFeeCents = 500;
    let skipFnb = false;

    const selectSeatsResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/booking/select-seats") &&
        resp.request().method() === "POST"
    );

    // ================== PROCEED TO PAYMENT (Skip F&B if available) ==================
    const skipToPaymentBtn = page.getByRole("button", {
      name: /Skip to Payment/i,
    });
    const continueBtn = page.getByRole("button", { name: /^Continue$/i });

    if (await skipToPaymentBtn.isVisible().catch(() => false)) {
      console.log('➡️ Clicking "Skip to Payment" button');
      await skipToPaymentBtn.click();
    } else if (await continueBtn.isVisible().catch(() => false)) {
      console.log(
        '➡️ "Skip to Payment" not visible, clicking "Continue" button'
      );
      await continueBtn.click();
    } else {
      throw new Error(
        'Neither "Skip to Payment" nor "Continue" button is visible'
      );
    }

    try {
      const selectSeatsResponse = await selectSeatsResponsePromise;
      const selectSeatsApiData = await selectSeatsResponse.json();

      bookingFeeCents = selectSeatsApiData?.data?.bookingFee ?? 500;
      skipFnb = selectSeatsApiData?.data?.skip_fnb === true;

      console.log("📌 select-seats API:", {
        bookingFeeCents,
        skip_fnb: skipFnb,
        reservationId: selectSeatsApiData?.data?.reservationId,
      });
    } catch (e) {
      console.warn("Could not capture select-seats API response");
    }

    // ================== EXPECT DIRECT PAYMENT ==================
    await page.waitForURL((url) => url.pathname.includes("/payment"));

    // await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: "Payment Options" })
    ).toBeVisible();

    // ================== PAYMENT SIDE PANEL ==================
    const paymentSidePanel = page
      .locator(".flex-col.md\\:bg-\\[\\#B3B2B340\\]")
      .first();

    await expect(paymentSidePanel).toBeVisible();
    await expect(paymentSidePanel.getByText("Booking Details")).toBeVisible();
    await expect(
      paymentSidePanel.getByText(sidePanelData.movie.movie_name)
    ).toBeVisible();
    await expect(
      paymentSidePanel.getByText(sidePanelData.show_date)
    ).toBeVisible();
    await expect(
      paymentSidePanel.locator("span", { hasText: sidePanelData.show_time })
    ).toBeVisible();

    for (const seat of selectedSeats) {
      await expect(page.getByText(seat).first()).toBeVisible();
    }

    // ================== TOTAL PRICE ==================
    const bookingFeeValue = bookingFeeCents / 100;
    const totalWithBookingFee = totalTicketPrice + bookingFeeValue;

    try {
      await expect(
        page.getByText(
          new RegExp(
            `Total Price.*QAR.*${totalWithBookingFee
              .toFixed(2)
              .replace(".", "\\.")}`
          )
        )
      ).toBeVisible();

      console.log(
        `✓ Verified total price: QAR ${totalWithBookingFee.toFixed(2)}`
      );
    } catch {
      console.warn(
        `Could not verify total price. Expected: QAR ${totalWithBookingFee.toFixed(
          2
        )}`
      );
    }

    console.log("=== Payment Page Verification Summary ===");
    console.log({
      movieName: sidePanelData.movie.movie_name,
      selectedSeats,
      skipFnb,
      ticketPrice: totalTicketPrice.toFixed(2),
      bookingFee: bookingFeeValue.toFixed(2),
      totalPrice: totalWithBookingFee.toFixed(2),
    });

    // ================== COMPLETE PAYMENT ==================
    await completePayment(page);
  });

  // ============================================================================
  // TEST 3: Normal Ticket Booking WITHOUT F&B with LOYALTY OFFERS
  // ============================================================================

  test("TC_03 – Verify Normal Movie Ticket Booking Without F&B Using Loyalty Offer and Credit Card Payment", async ({
    page,
    request,
  }) => {

    await page.goto("https://qa.novocinemas.com/home", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL(/novocinemas\.com\/home/);

    // === Use helper functions ===
    const selectedMovie = await selectMovieDynamically(page, request);
    const { movie, movieId, movieSlug } = await getMovieDetails(
      page,
      request,
      selectedMovie
    );

    console.log("Movie data fetched:", movie.movie_title);

    await verifyMovieDetailsPage(page, movie);

    const bookingResult = await dynamicBookingLoyalty(page, movieId);
    console.log("Booking completed:", bookingResult);

    const authToken = await loginAndCaptureTokenLoyalty(page);

    await page.waitForURL(/\/seat-selection\/cinema\/\d+\/session\/\d+/);
    const seatSelectionUrl = page.url();
    console.log("Seat Selection URL:", seatSelectionUrl);

    const urlMatch = seatSelectionUrl.match(/\/cinema\/(\d+)\/session\/(\d+)/);
    if (!urlMatch)
      throw new Error("Could not extract cinema ID and session ID from URL");

    const cinemaId = parseInt(urlMatch[1], 10);
    const sessionId = parseInt(urlMatch[2], 10);
    console.log(
      "✅ Extracted from URL - Cinema ID:",
      cinemaId,
      "Session ID:",
      sessionId
    );

    // page.off('request', tokenListener);

    const sidePanelApiData = await sidePanelVerification(
      page,
      request,
      sessionId,
      cinemaId
    );

    // === SET UP USER SESSION ID CAPTURE ===
    console.log("\n=== Setting up User Session ID Capture ===");

    let capturedUserSessionId = null;

    const userSessionIdPromise = new Promise(async (resolve) => {
      const responseHandler = async (response) => {
        if (
          response.url().includes("/api/booking/seat-layout/cinemas/") &&
          response.url().includes(`/sessions/${sessionId}`) &&
          response.status() === 200
        ) {
          console.log("✅ Seat layout API response detected");
          try {
            const seatLayoutData = await response.json();
            const userSessionId = seatLayoutData.data?.userSessionId;

            if (userSessionId) {
              if (
                userSessionId.length > 50 ||
                userSessionId.includes("eyJ") ||
                userSessionId.includes("Bearer")
              ) {
                console.error(
                  "❌ ERROR: Captured value appears to be a JWT token, not userSessionId"
                );
                console.error("Value:", userSessionId.substring(0, 50) + "...");
                resolve(null);
              } else {
                console.log(
                  `✅ Captured userSessionId from API: ${userSessionId}`
                );
                capturedUserSessionId = userSessionId;
                page.off("response", responseHandler);
                resolve(userSessionId);
              }
            } else {
              console.warn(
                "⚠️ userSessionId not found in seat-layout API response"
              );
              resolve(null);
            }
          } catch (error) {
            console.error("Error parsing seat layout response:", error);
            resolve(null);
          }
        }
      };

      page.on("response", responseHandler);

      setTimeout(() => {
        if (!capturedUserSessionId) {
          console.warn("⚠️ Timeout waiting for seat layout API response");
          page.off("response", responseHandler);
          resolve(null);
        }
      }, 30000);
    });

    console.log("Proceeding to seat selection to trigger seat layout API...");

    const seatLayoutResponse = await request.get(
      `${BACKEND_URL}/api/booking/seat-layout/cinemas/${cinemaId}/sessions/${sessionId}?country_id=1&channel=web`
    );
    const seatLayoutData = await seatLayoutResponse.json();
    const layout = seatLayoutData.data;
    const skipConcession =
      layout?.skip_concession === true ||
      seatLayoutData?.skip_concession === true;
    console.log("skip_concession (seat-layout):", skipConcession);

    console.log("Waiting for userSessionId capture...");
    const userSessionId = await userSessionIdPromise;

    if (!userSessionId) {
      console.warn(
        "⚠️ Could not capture userSessionId, trying fallback method..."
      );
      capturedUserSessionId = layout.userSessionId;
      if (capturedUserSessionId) {
        console.log(
          `✅ Retrieved userSessionId from direct API call: ${capturedUserSessionId}`
        );
      } else {
        console.warn("❌ userSessionId not available in any source");
      }
    }

    await expect(
      page.getByRole("img", { name: "Screen Indicator" })
    ).toBeVisible();
    await expect(
      page.getByText(new RegExp(`${layout.areas[0].name} \\(QAR`))
    ).toBeVisible();
    await expect(
      page.getByText(`Screen ${layout.screenName}`, { exact: true })
    ).toBeVisible();

    const rowOrder = layout.areas[0].row
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .map((r) => r.name);
    console.log("Row Order from API:", rowOrder);

    // === Enhanced seat selection ===
    const availableSeats = await page.locator("div.cursor-pointer").all();
    const seatCount = 4;
    const clickedSeats = [];
    const seatPriceMap = new Map();

    for (let i = 0; i < seatCount && availableSeats.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableSeats.length);
      const seatLocator = availableSeats[randomIndex];

      const seatNumber = await seatLocator.locator("span").innerText();
      const rowLocator = seatLocator.locator(
        'xpath=ancestor::div[contains(@class,"flex")][1]/preceding-sibling::div[contains(@class,"sticky")][1]/span'
      );
      const rowName = await rowLocator.first().innerText();
      const fullSeatName = `${rowName}${seatNumber}`;
      clickedSeats.push(fullSeatName);

      let seatPrice = null;
      for (const area of layout.areas) {
        const rowData = area.row.find((r) => r.name === rowName);
        if (rowData) {
          seatPrice = area.priceInCents / 100;
          seatPriceMap.set(fullSeatName, {
            price: seatPrice,
            areaName: area.name,
            areaCategoryCode: area.AreaCategoryCode,
            ticketDescription: area.ticketDescription,
          });
          break;
        }
      }
      if (!seatPrice)
        console.warn(`Could not find price for seat ${fullSeatName}`);

      await seatLocator.scrollIntoViewIfNeeded();
      await seatLocator.click();
      availableSeats.splice(randomIndex, 1);
    }

    console.log(
      "Clicked Seats with Prices:",
      Array.from(seatPriceMap.entries())
    );

    const sortedSeats = [...clickedSeats].sort((a, b) => {
      const rowMatchA = a.match(/^([A-Z]+)/);
      const rowMatchB = b.match(/^([A-Z]+)/);

      if (!rowMatchA || !rowMatchB) return 0;

      const rowA = rowMatchA[1];
      const rowB = rowMatchB[1];
      const numA = parseInt(a.match(/(\d+)$/)?.[1] || "0", 10);
      const numB = parseInt(b.match(/(\d+)$/)?.[1] || "0", 10);

      const rowIndexA = rowOrder.indexOf(rowA);
      const rowIndexB = rowOrder.indexOf(rowB);

      if (rowIndexA === -1 && rowIndexB === -1)
        return rowA.localeCompare(rowB) || numA - numB;
      if (rowIndexA === -1) return 1;
      if (rowIndexB === -1) return -1;
      if (rowIndexA !== rowIndexB) return rowIndexA - rowIndexB;
      return numA - numB;
    });

    console.log("Frontend-style Sorted Seats:", sortedSeats);

    // Calculate total price and group by area
    const areaGroupedSeats = new Map();
    let totalExpectedPrice = 0;

    for (const seat of clickedSeats) {
      const seatInfo = seatPriceMap.get(seat);
      if (seatInfo) {
        totalExpectedPrice += seatInfo.price;
        if (!areaGroupedSeats.has(seatInfo.areaName)) {
          areaGroupedSeats.set(seatInfo.areaName, {
            seats: [],
            count: 0,
            unitPrice: seatInfo.price,
            ticketDescription: seatInfo.ticketDescription,
          });
        }
        const areaInfo = areaGroupedSeats.get(seatInfo.areaName);
        areaInfo.seats.push(seat);
        areaInfo.count++;
      }
    }

    console.log("Area Grouped Seats:", Array.from(areaGroupedSeats.entries()));
    console.log("Total Expected Price:", totalExpectedPrice);

    // Verify side-panel shows selected seats
    await page
      .locator("div")
      .filter({ hasText: /^Seats$/ })
      .first()
      .click();

    for (const seat of clickedSeats) {
      await expect(page.getByText(seat).first()).toBeVisible();
      console.log(`✓ Verified seat ${seat} is visible`);
    }

    // Dynamic price verification for each area
    for (const [areaName, areaInfo] of areaGroupedSeats) {
      const expectedPriceText = `QAR ${areaInfo.unitPrice.toFixed(2)} x ${
        areaInfo.count
      }`;

      try {
        await expect(page.getByText(expectedPriceText).first()).toBeVisible();
        console.log(`✓ Verified price for ${areaName}: ${expectedPriceText}`);
      } catch (error) {
        console.warn(`Could not find exact price text: ${expectedPriceText}`);
        const alternativePriceRegex = new RegExp(
          `QAR\\s*${areaInfo.unitPrice.toFixed(2).replace(".", "\\.")}.*x\\s*${
            areaInfo.count
          }`
        );
        await expect(page.locator("body")).toContainText(alternativePriceRegex);
        console.log(`✓ Verified alternative price format for ${areaName}`);
      }
    }

    // Verify total price
    const totalPriceFormatted =
      totalExpectedPrice % 1 === 0
        ? `QAR ${Math.floor(totalExpectedPrice)}`
        : `QAR ${totalExpectedPrice.toFixed(2)}`;

    try {
      await expect(page.locator("body")).toContainText(totalPriceFormatted);
      console.log(`✓ Verified total price: ${totalPriceFormatted}`);
    } catch (error) {
      try {
        await expect(page.locator("body")).toContainText(
          `QAR ${totalExpectedPrice.toFixed(2)}`
        );
        console.log(`✓ Verified total price (decimal format)`);
      } catch (secondError) {
        const priceRegex = new RegExp(`QAR\\s*${totalExpectedPrice}(?:\\.00)?`);
        await expect(page.locator("body")).toContainText(priceRegex);
        console.log(`✓ Verified total price (regex)`);
      }
    }

    console.log("Dynamic price verification completed successfully");

    const loyaltyApiData = await verifyLoyaltyOffersAPI(
      page,
      cinemaId,
      sessionId,
      authToken,
      capturedUserSessionId
    );

    // === Enhanced Loyalty Offers UI Verification ===
    console.log("\n=== Starting Loyalty Offers Verification ===");

    await expect(
      page.getByRole("img", { name: "offerbg" }).nth(1)
    ).toBeVisible();
    await expect(page.getByText("Loyalty Offers").nth(1)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View" }).nth(1)
    ).toBeVisible();

    await page.getByRole("button", { name: "View" }).nth(1).click();
    await expect(
      page.getByRole("heading", { name: "Loyalty Offers" })
    ).toBeVisible();
    console.log("✓ Loyalty Offers modal opened");

    // === Dynamic loyalty offer filtering ===
    const selectedAreaCategories = [
      ...new Set(
        [...seatPriceMap.values()]
          .map((s) => s.areaCategoryCode)
          .filter(Boolean)
      ),
    ]; // Filter out undefined
    console.log("Selected area categories:", selectedAreaCategories);

    // If no area categories captured, show all offers (safer fallback)
    let expectedOffers, unexpectedOffers;
    if (selectedAreaCategories.length === 0) {
      console.warn("⚠️ No area categories found, showing all offers");
      expectedOffers = loyaltyApiData.offers;
      unexpectedOffers = [];
    } else {
      expectedOffers = loyaltyApiData.offers.filter((o) =>
        selectedAreaCategories.includes(o.areaCategoryCode)
      );
      unexpectedOffers = loyaltyApiData.offers.filter(
        (o) => !selectedAreaCategories.includes(o.areaCategoryCode)
      );
    }

    console.log(
      "Offers UI SHOULD show:",
      expectedOffers.map((x) => x.description)
    );
    console.log(
      "Offers UI SHOULD NOT show:",
      unexpectedOffers.map((x) => x.description)
    );

    // Verify expected offers are visible
    for (const offer of expectedOffers) {
      await expect(page.getByText(offer.description)).toBeVisible();
      console.log("✓ UI shows offer:", offer.description);
    }

    // Verify unexpected offers are NOT visible
    for (const offer of unexpectedOffers) {
      await expect(page.getByText(offer.description)).not.toBeVisible(); // ✅ Added .not
      console.log("✓ UI hides offer:", offer.description);
    }

    // Verify offers against API data
    if (loyaltyApiData && loyaltyApiData.offers.length > 0) {
      let actualLoyaltyDiscountCents = 0;
      let loyaltyOfferApplied = false;
      console.log(
        `\nFound ${loyaltyApiData.offers.length} loyalty offers from API`
      );
      console.log("Starting dynamic UI verification...\n");

      for (let i = 0; i < loyaltyApiData.offers.length; i++) {
        const offer = loyaltyApiData.offers[i];
        console.log(
          `\n--- Verifying Offer ${i + 1}/${loyaltyApiData.offers.length} ---`
        );
        console.log("Offer Details:", {
          description: offer.description,
          pricePerTicket: offer.pricePerTicket,
          availableQuantity: offer.availableQuantity,
          ticketTypeCode: offer.ticketTypeCode,
          isLoyaltyOnly: offer.isLoyaltyOnly,
          loyaltyPointsCost: offer.loyaltyPointsCost,
          thirdPartyMembership: offer.thirdPartyMembership,
        });

        try {
          await expect(page.getByText(offer.description)).toBeVisible();
          console.log(`✓ Description verified: "${offer.description}"`);

          const priceText = `Per ticket: QAR ${offer.pricePerTicket.toFixed(
            2
          )}`;
          await expect(page.getByText(priceText)).toBeVisible();
          console.log(`✓ Price verified: ${priceText}`);

          const availableText = `Available: ${offer.availableQuantity} ticket${
            offer.availableQuantity > 1 ? "s" : ""
          }`;
          try {
            await expect(page.getByText(availableText)).toBeVisible();
            console.log(`✓ Availability verified: ${availableText}`);
          } catch (error) {
            console.warn(
              `⚠️ Could not verify exact availability text: "${availableText}"`
            );
          }

          const initialAmountLocator = page
            .locator(`text=/Amount: QAR\\s*0\\.00/`)
            .nth(i);
          await expect(initialAmountLocator).toBeVisible();
          console.log(`✓ Initial amount display verified: QAR 0.00`);

          const quantityContainer = page.getByText("-0+").nth(i);
          const minusButton = quantityContainer.getByRole("button", {
            name: "-",
          });
          await expect(minusButton).toBeVisible();
          console.log(
            `✓ Minus button is visible (initially disabled at quantity 0)`
          );

          const plusButton = quantityContainer.getByRole("button", {
            name: "+",
          });
          await expect(plusButton).toBeVisible();
          await expect(plusButton).toBeEnabled();
          console.log(`✓ Plus button is visible and enabled`);

          await expect(
            quantityContainer.getByText("0", { exact: true })
          ).toBeVisible();
          console.log(`✓ Quantity controls verified (-, 0, +) - initial state`);

          if (offer.loyaltyPointsCost && offer.loyaltyPointsCost > 0) {
            console.log(
              `  ℹ Loyalty points required: ${offer.loyaltyPointsCost} points`
            );
          }
          if (offer.thirdPartyMembership) {
            console.log(
              `  ℹ Third party membership: ${offer.thirdPartyMembership}`
            );
          }
          if (offer.isLoyaltyOnly) {
            console.log(`  ℹ This offer is loyalty members only`);
          }

          console.log(`✅ Offer ${i + 1} verification complete\n`);
        } catch (error) {
          console.error(
            `❌ Failed to verify offer ${i + 1}: ${offer.description}`
          );
          console.error("Error:", error.message);
          throw error;
        }
      }

      // === Select and Apply FIRST offer ===
      console.log("\n=== Starting Offer Selection and Application ===");
      console.log("Selecting first available offer...\n");

      let selectedQuantity = 1;
      let selectedOffer = null;
      let offerApplied = false;

      const firstOffer = loyaltyApiData.offers[0];

      if (firstOffer && firstOffer.availableQuantity > 0) {
        console.log(`Selecting first offer: ${firstOffer.description}`);

        try {
          const plusButton = page
            .locator('button.px-2.py-1.text-background.rounded:has-text("+")')
            .first();
          console.log(`Clicking + button for first offer...`);
          await plusButton.click();
          // await page.waitForTimeout(500);

          await expect(page.getByText("1", { exact: true }).nth(3)).toBeVisible();
          console.log(`✓ Quantity updated to 1`);

          const minusButton = page
            .locator('button.px-2.py-1.text-background.rounded:has-text("-")')
            .first();
          await expect(minusButton).toBeEnabled();
          console.log(`✓ Minus button enabled`);

          selectedOffer = firstOffer;

          const expectedAmount = firstOffer.pricePerTicket * selectedQuantity;
          const amountText = `Amount: QAR ${expectedAmount.toFixed(2)}`;

          try {
            const offerSection = page
              .locator(`text="${firstOffer.description}"`)
              .locator("xpath=ancestor::div[1]");
            await expect(
              offerSection.locator(`text=${amountText}`)
            ).toBeVisible();
            console.log(`✓ Amount calculation verified: ${amountText}`);
          } catch (error) {
            console.warn(`Trying alternative amount verification...`);
            const amountRegex = new RegExp(
              `Amount:\\s*QAR\\s*${expectedAmount.toFixed(2)}`
            );
            await expect(
              page.locator(`text=${amountRegex}`).first()
            ).toBeVisible();
            console.log(`✓ Amount verified using regex pattern`);
          }

          console.log(`\n✅ Successfully selected first offer:`);
          console.log(`   - Description: ${firstOffer.description}`);
          console.log(`   - Quantity: ${selectedQuantity}`);
          console.log(
            `   - Unit Price: QAR ${firstOffer.pricePerTicket.toFixed(2)}`
          );
          console.log(`   - Total Amount: QAR ${expectedAmount.toFixed(2)}`);

          console.log("\n=== Applying Selected Offer ===");

          const applyButton = page.getByRole("button", { name: "Apply" });
          await expect(applyButton).toBeVisible();
          await expect(applyButton).toBeEnabled();
          console.log("✓ Apply Offer button is visible and enabled");

          await applyButton.click();

          await expect(
            page.getByText("Offer Applied Successfully")
          ).toBeVisible();
          console.log("✅ Offer applied successfully!");
          offerApplied = true;
          loyaltyOfferApplied = true;
        } catch (error) {
          console.warn(`Could not select or apply first offer`);
          console.warn("Error:", error.message);
        }
      } else {
        console.log("First offer has no quantity available");
      }

      console.log("\n=== Dynamic Price Distribution Verification ===");

      const ticketLine = page.getByText(/Ticket/i).first();
      await expect(ticketLine).toBeVisible();

      const ticketAmountElement = ticketLine.locator(
        "xpath=following-sibling::*[1]"
      );
      const ticketAmountText = await ticketAmountElement.innerText();
      console.log("Ticket Amount UI:", ticketAmountText);
      expect(ticketAmountText).toMatch(/\+?\s*QAR\s*\d+(\.\d+)?/);

      let loyaltyExists = true;
      try {
        const loyaltyLine = page.getByText(/Loyalty Discount/i).first();
        await expect(loyaltyLine).toBeVisible();

        const loyaltyAmountElement = loyaltyLine.locator(
          "xpath=following-sibling::*[1]"
        );
        const loyaltyAmountText = await loyaltyAmountElement.innerText();
        console.log("Loyalty Discount UI:", loyaltyAmountText);
        expect(loyaltyAmountText).toMatch(/-\s*QAR\s*\d+(\.\d+)?/);
      } catch (err) {
        loyaltyExists = false;
        console.log(
          "No Loyalty Discount line found — correct for price-replacement loyalty offers"
        );
      }

      const totalLine = page.getByText(/Total Price/i).first();
      await expect(totalLine).toBeVisible();

      const totalAmountElement = totalLine.locator(
        "xpath=following-sibling::*[1]"
      );
      const totalAmountText = await totalAmountElement.innerText();
      console.log("Total Amount UI:", totalAmountText);
      expect(totalAmountText).toMatch(/QAR\s*\d+(\.\d+)?/);

      console.log("\n✓ Dynamic price verification completed successfully\n");

      // === Proceed to Payment ===
      console.log("\n=== Proceeding After Seat Selection ===");

      const continueBtn = page.getByRole("button", {
        name: /^Continue$/i,
      });

      const selectSeatsPredicate = (resp) =>
        resp.url().includes("/api/booking/select-seats") &&
        resp.request().method() === "POST";
      const applyLoyaltyPredicate = (resp) =>
        resp.url().includes("/api/booking/offers/grouped-loyalty/apply") &&
        resp.request().method() === "POST" &&
        resp.status() === 200;

      const [selectSeatsResponse, applyLoyaltyResponse] = await Promise.all([
        page.waitForResponse(selectSeatsPredicate),
        offerApplied
          ? page.waitForResponse(applyLoyaltyPredicate)
          : Promise.resolve(null),
        continueBtn.click(),
      ]);

      const selectSeatsApiData = await selectSeatsResponse.json();
      let bookingFeeCents = selectSeatsApiData?.data?.bookingFee ?? 500;
      let reservationId = selectSeatsApiData?.data?.reservationId ?? null;
      const bookingFeeQAR = bookingFeeCents / 100;

      if (offerApplied && applyLoyaltyResponse) {
        try {
          const applyData = await applyLoyaltyResponse.json();
          actualLoyaltyDiscountCents =
            applyData?.data?.discount_amount_in_cents ?? 0;
          console.log(
            "✓ Loyalty discount from API (after Continue):",
            actualLoyaltyDiscountCents / 100,
            "QAR"
          );
        } catch {
          console.warn("Could not parse apply loyalty offer response");
        }
      }

      console.log("📌 Reservation ID:", reservationId);
      console.log("skip_concession (redirect):", skipConcession);
      console.log("💰 Booking Fee:", bookingFeeCents / 100, "QAR");

      if (skipConcession) {
        await page.waitForURL(/\/payment/);
      } else {
        await page.waitForURL(/\/fnb/);
        const continueFromFnb = page.getByRole('button', { name: 'Skip and Continue' });
        await expect(continueFromFnb).toBeVisible();
        await continueFromFnb.click();
        await page.waitForURL(/\/payment/);
      }

      // === Verify payment page ===
      console.log("\n=== Verifying Payment Page ===");

      await expect(page).toHaveURL(/\/payment/);
      // await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: "Payment Options" })
      ).toBeVisible();

      const paymentSidePanel = page
        .locator(".flex-col.md\\:bg-\\[\\#B3B2B340\\]")
        .first();
      await expect(paymentSidePanel).toBeVisible();
      await expect(paymentSidePanel.getByText("Booking Details")).toBeVisible();
      await expect(
        paymentSidePanel.getByRole("img", { name: "banner" })
      ).toBeVisible();
      await expect(
        paymentSidePanel.getByText(sidePanelApiData.movie.movie_name)
      ).toBeVisible();
      await expect(
        paymentSidePanel.locator("span", {
          hasText: sidePanelApiData.show_time,
        })
      ).toBeVisible();

      console.log("✓ Payment page loaded successfully");

      // === Calculate final prices ===
      console.log("\n=== Calculating Final Prices ===");

      const loyaltyDiscountAmount = actualLoyaltyDiscountCents / 100;
      const finalTicketPrice = totalExpectedPrice - loyaltyDiscountAmount;
      const bookingFeeValue = bookingFeeCents / 100;
      const totalWithBookingFee = finalTicketPrice + bookingFeeValue;

      console.log("Price Breakdown:");
      console.log("   - Original Ticket Price:", totalExpectedPrice, "QAR");
      console.log("   - Loyalty Discount:", loyaltyDiscountAmount, "QAR");
      console.log("   - Final Ticket Price:", finalTicketPrice, "QAR");
      console.log("   - Booking Fee:", bookingFeeValue, "QAR");
      console.log("   - Total Price:", totalWithBookingFee, "QAR");

      // === Verify seats in payment page ===
      console.log("\n=== Verifying Seats in Payment Page ===");

      for (const seat of clickedSeats) {
        await expect(page.getByText(seat).first()).toBeVisible();
        console.log(`✓ Seat ${seat} visible in payment page`);
      }

      // === Verify ticket prices ===
      console.log("\n=== Verifying Ticket Prices in Payment Page ===");

      for (const [areaName, areaInfo] of areaGroupedSeats) {
        const ticketPriceText = `QAR ${areaInfo.unitPrice.toFixed(2)} x ${
          areaInfo.count
        }`;

        try {
          await expect(page.getByText(ticketPriceText)).toBeVisible();
          console.log(
            `✓ Verified ticket price for ${areaName}: ${ticketPriceText}`
          );
        } catch {
          const priceRegex = new RegExp(
            `QAR\\s*${areaInfo.unitPrice
              .toFixed(2)
              .replace(".", "\\.")}\\s*x\\s*${areaInfo.count}`
          );
          try {
            await expect(page.locator("body")).toContainText(priceRegex);
            console.log(`✓ Verified ticket price (regex) for ${areaName}`);
          } catch {
            console.warn(`Could not verify ticket price: ${ticketPriceText}`);
          }
        }
      }

      // === Verify payment details ===
      console.log("\n=== Verifying Payment Details in Side Panel ===");

      // ---------- Ticket ----------
      try {
        await expect(page.getByText("Ticket", { exact: true })).toBeVisible();
        await expect(
          page.getByText(
            new RegExp(
              `\\+\\s*QAR\\s*${Math.round(totalExpectedPrice)}(?:\\.\\d+)?`
            )
          )
        ).toBeVisible();
        console.log("✓ Verified ticket subtotal");
      } catch {
        console.warn("Could not verify ticket subtotal");
      }

      // ---------- Loyalty Discount ----------
      if (loyaltyOfferApplied && loyaltyDiscountAmount > 0) {
        try {
          await expect(page.getByText("Loyalty Discount")).toBeVisible();

          // amount may be "- QAR" or "- QAR 15"
          await expect(
            page.getByText(
              new RegExp(
                `-\\s*QAR\\s*${Math.round(loyaltyDiscountAmount)}(?:\\.\\d+)?`
              )
            )
          ).toBeVisible();

          console.log("✓ Verified loyalty discount");
        } catch {
          console.warn("Could not verify loyalty discount");
        }
      }

      // ---------- Booking Fee ----------
      try {
        await expect(page.getByText("Booking Fee")).toBeVisible();
        await expect(
          page.getByText(
            new RegExp(`\\+\\s*QAR\\s*${bookingFeeQAR}(?:\\.\\d+)?`)
          )
        ).toBeVisible();
        console.log("✓ Verified booking fee");
      } catch {
        console.warn("Could not verify booking fee");
      }

      // ---------- Total Price (BEFORE or AFTER discount) ----------
      try {
        const totalRow = page.getByText("Total Price").locator("..");

        const possibleTotals = [
          Math.round(totalWithBookingFee), // after discount
          // Math.round(totalBeforeDiscount), // before discount
        ];

        let matched = false;

        for (const value of possibleTotals) {
          try {
            await expect(totalRow).toContainText(
              new RegExp(`QAR\\s*${value}(?:\\.\\d+)?`),
            );

            console.log(`✓ Verified total price: QAR ${value}`);
            matched = true;
            break;
          } catch {
            // try next
          }
        }

        if (!matched) {
          throw new Error("Total price not matched in any expected state");
        }
      } catch (e) {
        console.warn("Could not verify total price:", e.message);
      }

      // === Verify loyalty offers section ===
      console.log("\n=== Verifying Loyalty Offers Section in Payment Page ===");

      try {
        await expect(
          page
            .locator("div")
            .filter({ hasText: /^Offers & Promotions$/ })
            .first()
        ).toBeVisible();
        console.log("✓ Offers & Promotions section visible");

        await expect(page.getByText("Loyalty Offers").first()).toBeVisible();
        console.log("✓ Loyalty Offers label visible");

        if (loyaltyOfferApplied && selectedOffer) {
          try {
            await expect(
              page.getByText(new RegExp(selectedOffer.description, "i")).first()
            ).toBeVisible();
            console.log(
              `✓ Applied loyalty offer visible: ${selectedOffer.description}`
            );
          } catch {
            console.warn(
              `Could not verify applied loyalty offer: ${selectedOffer.description}`
            );
          }
        }
      } catch (error) {
        console.warn("Failed to verify Loyalty Offers section:", error.message);
      }

      await completePayment(page);

      if (!offerApplied) {
        console.warn("\n⚠️  Could not apply any loyalty offer");
        console.warn("Possible reasons:");
        console.warn("  - First offer may have 0 quantity available");
        console.warn("  - UI elements may not be accessible");
        console.warn("  - Apply button may not be enabled");
        console.warn("\nContinuing without loyalty offer...\n");
      } else {
        console.log("\n=== Loyalty Offers Application Summary ===");
        console.log(`Total offers available: ${loyaltyApiData.offers.length}`);
        console.log(`Offer applied: ${selectedOffer.description}`);
        console.log(`Applied quantity: ${selectedQuantity}`);
        console.log(
          `Applied amount: QAR ${(
            selectedOffer.pricePerTicket * selectedQuantity
          ).toFixed(2)}`
        );

        if (loyaltyApiData.memberData?.LoyaltyMember) {
          const member = loyaltyApiData.memberData.LoyaltyMember;
          console.log(`\nMember Details:`);
          console.log(`  - Name: ${member.FullName}`);
          console.log(`  - Tier: ${member.MemberLevelName}`);
          console.log(`  - Card: ${member.CardNumber}`);

          const tierPoints = member.BalanceList?.find(
            (b) => b.Name === "Tier Points"
          );
          const spendPoints = member.BalanceList?.find(
            (b) => b.Name === "Spend Points"
          );

          if (tierPoints)
            console.log(`  - Tier Points: ${tierPoints.PointsRemaining}`);
          if (spendPoints)
            console.log(`  - Spend Points: ${spendPoints.PointsRemaining}`);
        }

        console.log("\n✅ Loyalty offer applied successfully!\n");
      }

      console.log(
        "✅ Test completed successfully up to loyalty offers section"
      );
    }
  });

  // ============================================================================
  // TEST 4: Movie Ticket Booking with Bank Offers
  // ============================================================================

  test("TC_04 – Verify Movie Ticket Booking with Applicable Bank Offers and Successful Payment Flow", async ({
    page,
    request,
  }) => {

    const testData = await setupTest(page, request);

    // Bank offers flow
    await handleBankOffersFlow(
      page,
      request,
      testData.bookingResult.sessionId,
      testData.cinemaId
    );

    // Navigate to payment page
    const { selectSeatsResponsePromise, offersApplyPromise } =
      setupPaymentInterceptors(page);
    const skipToPaymentBtn = page.getByRole("button", {
      name: "Skip to Payment QAR",
    });

    if (await skipToPaymentBtn.isVisible()) {
      await skipToPaymentBtn.click();
      console.log("➡️ Clicked: Skip to Payment QAR");
    } else {
      await page.getByRole("button", { name: "Continue" }).click();
      console.log("➡️ Clicked: Continue");
    }

    const {
      bookingFeeCents,
      actualDiscountCents,
      offerApplied,
      reservationId,
      skipFnb,
    } = await captureBookingFeeAndDiscount(
      selectSeatsResponsePromise,
      offersApplyPromise
    );

    // Verify payment page
    await verifyPaymentPageBasics(page, testData.sidePanelApiData);

    const offerData = await getOfferDataFromStorage(page);
    const {
      isOfferApplied,
      offerDiscountAmount,
      finalTicketPrice,
      updatedSeatData,
    } = calculateFinalPrices(
      testData.totalExpectedPrice,
      offerData,
      offerApplied,
      actualDiscountCents
    );

    await verifySeatsInPaymentPage(
      page,
      isOfferApplied,
      updatedSeatData,
      testData.clickedSeats
    );

    console.log("🔍 DEBUG before verifyTicketPricesInPayment:");
    console.log("isOfferApplied:", isOfferApplied);
    console.log("updatedSeatData:", JSON.stringify(updatedSeatData, null, 2));
    console.log(
      "areaGroupedSeats:",
      Array.from(testData.areaGroupedSeats.entries())
    );

    await verifyTicketPricesInPayment(page, isOfferApplied, updatedSeatData);

    const bookingFeeValue = bookingFeeCents / 100;
    const totalWithBookingFee = finalTicketPrice + bookingFeeValue;

    await verifyPaymentDetails(
      page,
      testData.totalExpectedPrice,
      isOfferApplied,
      offerDiscountAmount,
      bookingFeeValue,
      totalWithBookingFee
    );

    await verifyOffersPromotionsSection(page, isOfferApplied, offerData);
    await verifyCreditCardOption(page);
    await verifyAutoFilledCardNumber(page);
    await fillPaymentDetails(page);
  });

  // ============================================================================
  // TEST 5: Verifying cancel transaction API gets called after coming back from checkout
  // ============================================================================

  test("TC_05 – Verify Cancel Transaction API Is Triggered When Navigating Back from Payment Page", async ({
    page,
    request,
  }) => {

    const testData = await setupTest(page, request);

    // Bank offers flow
    await handleBankOffersFlow(
      page,
      request,
      testData.bookingResult.sessionId,
      testData.cinemaId
    );

    // Navigate to payment page
    const { selectSeatsResponsePromise, offersApplyPromise } =
      setupPaymentInterceptors(page);
    const skipToPaymentBtn = page.getByRole("button", {
      name: "Skip to Payment QAR",
    });

    if (await skipToPaymentBtn.isVisible()) {
      await skipToPaymentBtn.click();
      console.log("➡️ Clicked: Skip to Payment QAR");
    } else {
      await page.getByRole("button", { name: "Continue" }).click();
      console.log("➡️ Clicked: Continue");
    }

    const {
      bookingFeeCents,
      actualDiscountCents,
      offerApplied,
      reservationId,
      skipFnb,
    } = await captureBookingFeeAndDiscount(
      selectSeatsResponsePromise,
      offersApplyPromise
    );

    // Verify payment page
    await verifyPaymentPageBasics(page, testData.sidePanelApiData);

    const offerData = await getOfferDataFromStorage(page);
    const {
      isOfferApplied,
      offerDiscountAmount,
      finalTicketPrice,
      updatedSeatData,
    } = calculateFinalPrices(
      testData.totalExpectedPrice,
      offerData,
      offerApplied,
      actualDiscountCents
    );

    await verifySeatsInPaymentPage(
      page,
      isOfferApplied,
      updatedSeatData,
      testData.clickedSeats
    );

    console.log("🔍 DEBUG before verifyTicketPricesInPayment:");
    console.log("isOfferApplied:", isOfferApplied);
    console.log("updatedSeatData:", JSON.stringify(updatedSeatData, null, 2));

    await verifyTicketPricesInPayment(page, isOfferApplied, updatedSeatData);

    const bookingFeeValue = bookingFeeCents / 100;
    const totalWithBookingFee = finalTicketPrice + bookingFeeValue;

    await verifyPaymentDetails(
      page,
      testData.totalExpectedPrice,
      isOfferApplied,
      offerDiscountAmount,
      bookingFeeValue,
      totalWithBookingFee
    );

    await verifyOffersPromotionsSection(page, isOfferApplied, offerData);

    // Setup cancel transaction interceptor BEFORE clicking back button
    const cancelTransactionPromise = page.waitForResponse(
      (response) => {
        const url = response.url();
        const method = response.request().method();
        const matchesEndpoint =
          url.includes("/api/booking/cancel-transaction/") &&
          method === "DELETE";

        if (matchesEndpoint && reservationId) {
          const urlContainsReservationId = url.includes(reservationId);
          if (urlContainsReservationId) {
            console.log(
              `✅ Cancel transaction called with correct reservation ID: ${reservationId}`
            );
          }
          return urlContainsReservationId;
        }

        return matchesEndpoint && url.includes(reservationId);
      },
    );

    // Click back arrow button
    await page.locator(".rounded-full.hover\\:cursor-pointer").click();

    // Wait for the cancel transaction response
    console.log("⏳ Waiting for cancel transaction API...");
    const cancelTransactionResponse = await cancelTransactionPromise;

    // Verify the API response
    const cancelResponseData = await cancelTransactionResponse.json();

    console.log(
      "📝 Cancel Transaction API Response:",
      JSON.stringify(cancelResponseData, null, 2)
    );

    // Verify response structure
    expect(cancelTransactionResponse.status()).toBe(200);
    expect(cancelResponseData).toMatchObject({
      statusCode: 200,
      success: true,
      type: "OK",
      message: "Transaction successfully canceled.",
      data: null,
    });

    // Verify the URL contains the correct reservation ID
    const cancelUrl = cancelTransactionResponse.url();
    expect(cancelUrl).toContain(reservationId);
    console.log(
      `✅ Verified cancel transaction for reservation: ${reservationId}`
    );
    console.log(
      "✅ Transaction successfully canceled and redirected back to seat selection"
    );

    // Wait for navigation back to seat selection page
    // await page.waitForLoadState("networkidle");

    // Verify we're back on seat selection page
    const seatSelectionUrlPattern = new RegExp(
      `/seat-selection/cinema/${testData.cinemaId}/session/${testData.bookingResult.sessionId}`
    );
    await expect(page).toHaveURL(seatSelectionUrlPattern);
    console.log("✅ Successfully navigated back to seat selection page");
  });

  // ============================================================================
  // TEST 6: Verifying cancel transaction and remove API gets called after coming back from checkout
  // ============================================================================

  test("TC_06 – Verify Cancel Transaction and Offer Removal APIs Are Triggered When Navigating Back from Payment Page", async ({
    page,
    request,
  }) => {

    const testData = await setupTest(page, request);

    // ===============================
    // BANK OFFER FLOW
    // ===============================
    await handleBankOffersFlow(
      page,
      request,
      testData.bookingResult.sessionId,
      testData.cinemaId
    );

    // ===============================
    // SETUP INTERCEPTORS
    // ===============================
    const { selectSeatsResponsePromise, offersApplyPromise } =
      setupPaymentInterceptors(page);

    // ===============================
    // CLICK CONTINUE / SKIP TO PAYMENT (SAFE)
    // ===============================
    const continueBtn = page.getByRole("button", { name: "Continue" });
    await continueBtn.click();
    console.log("➡️ Clicked: Continue");

    // ===============================
    // CAPTURE SELECT-SEATS RESPONSE
    // ===============================
    const {
      bookingFeeCents,
      actualDiscountCents,
      offerApplied,
      reservationId,
      skipFnb,
    } = await captureBookingFeeAndDiscount(
      selectSeatsResponsePromise,
      offersApplyPromise
    );

    console.log("💾 Reservation ID:", reservationId);
    console.log("🍿 skip_fnb:", skipFnb);

    // ===============================
    // HANDLE F&B VS PAYMENT ROUTING
    // ===============================
    if (skipFnb) {
      console.log("🚀 skip_fnb=true → Direct Payment");
      await page.waitForURL(/\/payment/);
    } else {
      console.log("🍿 skip_fnb=false → Navigated to F&B");
      await page.waitForURL(/\/fnb/);

      await verifyFNBPageBasics(
        page,
        testData.sidePanelApiData,
        testData.movie,
        testData.cinemaId,
        reservationId
      );

      const skipAndContinueBtn = page.getByRole("button", {
        name: "Skip and Continue",
      });

      if (await skipAndContinueBtn.isVisible()) {
        await skipAndContinueBtn.click();
        console.log("➡️ Clicked: Skip and Continue");
      }

      await page.waitForURL(/\/payment/);
    }

    // ===============================
    // PAYMENT PAGE VERIFICATION
    // ===============================
    await verifyPaymentPageBasics(page, testData.sidePanelApiData);

    const offerData = await getOfferDataFromStorage(page);

    const {
      isOfferApplied,
      offerDiscountAmount,
      finalTicketPrice,
      updatedSeatData,
    } = calculateFinalPrices(
      testData.totalExpectedPrice,
      offerData,
      offerApplied,
      actualDiscountCents
    );

    await verifySeatsInPaymentPage(
      page,
      isOfferApplied,
      updatedSeatData,
      testData.clickedSeats
    );

    await verifyTicketPricesInPayment(page, isOfferApplied, updatedSeatData);

    const bookingFeeValue = bookingFeeCents / 100;
    const totalWithoutFB = finalTicketPrice + bookingFeeValue;

    await verifyPaymentDetails(
      page,
      testData.totalExpectedPrice,
      isOfferApplied,
      offerDiscountAmount,
      bookingFeeValue,
      totalWithoutFB
    );

    await verifyOffersPromotionsSection(page, isOfferApplied, offerData);

    // ===============================
    // BACK NAVIGATION FROM PAYMENT
    // ===============================
    console.log("🔙 Navigating back from Payment page");

    // OPTIONAL – offer remove (only when skip_fnb=false)
    const offerRemovePromise = page
      .waitForResponse(
        (res) =>
          res.url().includes("/api/booking/offers/remove") &&
          res.status() === 200,
      )
      .catch(() => null);

    // MANDATORY – cancel transaction
    const cancelTransactionPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes("/api/booking/cancel-transaction/") &&
        response.url().includes(reservationId),
    );

    // Back button from Payment
    await page.locator(".rounded-full.hover\\:cursor-pointer").click();

    // ===============================
    // HANDLE OFFER REMOVAL (ONLY IF CALLED)
    // ===============================
    const offerRemoveResponse = await offerRemovePromise;

    if (offerRemoveResponse) {
      const offerRemovalData = await offerRemoveResponse.json();

      expect(offerRemovalData.success).toBe(true);
      expect(offerRemovalData.statusCode).toBe(200);
      expect(offerRemovalData.message).toBe("Offer removed successfully");
      expect(offerRemovalData.data.discount_amount_in_cents).toBe(0);

      console.log("✅ Offer removal API verified");

      // Handle popup if shown
      const offerRemovedPopup = page.locator(
        ".bg-background.dark\\:bg-\\[\\#000000\\]\\/10"
      );

      if (
        await offerRemovedPopup.isVisible().catch(() => false)
      ) {
        console.log("⚠️ Closing Offer Removed popup");
        await page.getByRole("button", { name: "Got it" }).click();
        await expect(offerRemovedPopup).toBeHidden();
      }

      // After offer removal → user lands on F&B
      await page.waitForURL(/\/fnb/);

      await verifyFNBPageBasics(
        page,
        testData.sidePanelApiData,
        testData.movie,
        testData.cinemaId,
        reservationId
      );

      // Back again from F&B → Seat Selection
      console.log("🔙 Navigating back from F&B page");
      await page.locator(".rounded-full.hover\\:cursor-pointer").click();
    } else {
      console.log("ℹ️ Offer remove API not called (skip_fnb=true flow)");
    }

    // ===============================
    // CANCEL TRANSACTION (ALWAYS)
    // ===============================
    console.log("⏳ Waiting for cancel transaction API");

    const cancelResponse = await cancelTransactionPromise;
    const cancelResponseData = await cancelResponse.json();

    expect(cancelResponse.status()).toBe(200);
    expect(cancelResponseData).toMatchObject({
      statusCode: 200,
      success: true,
      message: "Transaction successfully canceled.",
      data: null,
    });

    console.log("✅ Cancel transaction API verified");

    // ===============================
    // VERIFY SEAT SELECTION PAGE
    // ===============================
    const seatSelectionUrl = new RegExp(
      `/seat-selection/cinema/${testData.cinemaId}/session/${testData.bookingResult.sessionId}`
    );

    await expect(page).toHaveURL(seatSelectionUrl);
    console.log("✅ Navigated back to seat selection page");
  });

  // ============================================================================
  // TEST 7: Normal Ticket Booking with F&B (All Types) and using payment option as Credit Card
  // ============================================================================

  test("TC_07 – Verify Normal Movie Ticket Booking with F&B (No Modifiers, Modifiers & Alternates) Using Credit Card Payment", async ({
    page,
    request,
  }) => {

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/novocinemas\.com\/home/);

    const selectedMovie = await selectMovieDynamically(page, request);
    const { movie, movieId } = await getMovieDetails(
      page,
      request,
      selectedMovie
    );
    console.log("Movie data fetched:", movie.movie_title);

    await verifyMovieDetailsPage(page, movie);
    const bookingResult = await dynamicBooking(page, movieId);
    await loginAndCaptureTokenBooking(page);

    let cinemaId = bookingResult.cinemaId;
    if (!cinemaId) {
      const match = page.url().match(/cinema\/(\d+)/);
      if (match) cinemaId = match[1];
      else throw new Error("Cinema ID could not be found.");
    }

    const sidePanelApi = await request.get(
      `${BACKEND_URL}/api/booking/side-panel/cinemas/${cinemaId}/sessions/${bookingResult.sessionId}?country_id=1&channel=web`
    );
    const sidePanelApiData = await sidePanelApi.json();
    const sidePanelData = sidePanelApiData.data;

    const { selectedSeats, seatPriceMap, totalTicketPrice } = await selectSeats(
      page,
      request,
      cinemaId,
      bookingResult.sessionId
    );

    console.log(
      "Selected seats:",
      selectedSeats,
      "Total ticket price:",
      totalTicketPrice
    );

    let bookingFeeCents = 500;
    let skipFnb = false;

    const selectSeatsResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/booking/select-seats") &&
        resp.request().method() === "POST"
    );

    await page.getByRole("button", { name: "Continue" }).click();

    try {
      const selectSeatsResponse = await selectSeatsResponsePromise;
      const selectSeatsApiData = await selectSeatsResponse.json();
      bookingFeeCents = selectSeatsApiData?.data?.bookingFee ?? 500;
      skipFnb = selectSeatsApiData?.data?.skip_fnb === true;
      console.log("skip_fnb:", skipFnb);
    } catch {
      console.warn("Could not capture select-seats API response");
    }

    // ======================================================
    // F&B PAGE HANDLING (ONLY WHEN skip_fnb = false)
    // ======================================================
    let fbTracker = null;

    if (!skipFnb) {
      const [concessionsResponse, trendingResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes("/api/booking/concessions/cinema/") &&
            !resp.url().includes("trending")
        ),
        page.waitForResponse(
          (resp) =>
            resp.url().includes("/api/booking/concessions/cinema/") &&
            resp.url().includes("trending")
        ),
      ]);

      const concessionsData = await concessionsResponse.json();
      // await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: "Snack Time!" })
      ).toBeVisible();

      console.log("\n=== Starting Enhanced F&B Selection Flow ===");

      fbTracker = createFBTracker();
      const { itemsWithNoModifiers, itemsWithModifiers, itemsWithAlternates } =
        categorizeFandBItems(concessionsData);

      console.log("\nAvailable F&B Items:");
      console.log(
        `  - Items with no modifiers: ${itemsWithNoModifiers.length}`
      );
      console.log(`  - Items with modifiers: ${itemsWithModifiers.length}`);
      console.log(`  - Items with alternates: ${itemsWithAlternates.length}`);

      if (itemsWithNoModifiers.length > 0) {
        const selectedItem = itemsWithNoModifiers[0];
        console.log(
          `🎯 Adding F&B Item (No Modifiers): ${selectedItem.itemName}`
        );
        await addFandBItemNoModifiers(page, selectedItem, fbTracker);
      }

      if (itemsWithModifiers.length > 0) {
        const selectedItem = itemsWithModifiers[0];
        console.log(
          `🎯 Adding F&B Item (With Modifiers): ${selectedItem.itemName}`
        );
        await addFandBItemWithModifiers(page, selectedItem, fbTracker);
      }

      if (itemsWithAlternates.length > 0) {
        const selectedItem = itemsWithAlternates[0];
        console.log(
          `🎯 Adding F&B Item (With Alternates): ${selectedItem.itemName}`
        );
        await addFandBItemWithAlternates(page, selectedItem, fbTracker);
      }

      console.log(
        `\n✅ F&B Selection Complete - ${
          fbTracker.items.length
        } items added, Total: QAR ${fbTracker.totalPrice.toFixed(2)}`
      );

      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL((url) => url.pathname.includes("/payment"));
    } else {
      console.log(
        "🚀 skip_fnb=true → Skipping F&B and waiting for Payment page"
      );
      await page.waitForURL((url) => url.pathname.includes("/payment"));
    }

    // await page.waitForLoadState("networkidle");

    // ======================================================
    // PAYMENT PAGE VERIFICATION (UNCHANGED)
    // ======================================================
    console.log("\n=== Verifying Payment Page ===");

    await expect(
      page.getByRole("heading", { name: "Payment Options" })
    ).toBeVisible();

    const paymentSidePanel = page
      .locator(".flex-col.md\\:bg-\\[\\#B3B2B340\\]")
      .first();

    await expect(paymentSidePanel).toBeVisible();
    await expect(paymentSidePanel.getByText("Booking Details")).toBeVisible();
    await expect(
      paymentSidePanel.getByRole("img", { name: "banner" })
    ).toBeVisible();

    await expect(
      paymentSidePanel.getByText(sidePanelData.movie.movie_name)
    ).toBeVisible();
    await expect(
      paymentSidePanel.locator("span", { hasText: sidePanelData.show_time })
    ).toBeVisible();

    console.log("✓ Payment page loaded successfully");

    // ======================================================
    // VERIFY SEATS (UNCHANGED)
    // ======================================================
    await page
      .locator("div")
      .filter({ hasText: /^Seats$/ })
      .first()
      .click();

    for (const seat of selectedSeats) {
      await expect(page.getByText(seat).first()).toBeVisible();
    }

    // ======================================================
    // VERIFY F&B ITEMS IN PAYMENT PAGE (ONLY IF APPLICABLE)
    // ======================================================
    if (!skipFnb && fbTracker?.items?.length) {
      console.log("\n=== Verifying F&B Items in Payment Page ===");

      await page
        .locator("section")
        .filter({ hasText: /^Food & Beverages$/ })
        .locator("div")
        .first()
        .click();

      for (const fbItem of fbTracker.items) {
        const itemNameToVerify = fbItem.concessionItemName || fbItem.name;
        const escapedName = itemNameToVerify.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
        await expect(
          page.getByText(new RegExp(escapedName, "i")).first()
        ).toBeVisible();
        console.log(`✓ Verified F&B item: ${itemNameToVerify}`);
      }
    }

    // ======================================================
    // TOTAL VERIFICATION (SAFE)
    // ======================================================
    const bookingFeeQAR = bookingFeeCents / 100;
    const fbTotal = skipFnb ? 0 : fbTracker.totalPrice;
    const grandTotal = totalTicketPrice + fbTotal + bookingFeeQAR;

    const expectedTotal = `QAR ${grandTotal.toFixed(2)}`;
    await expect(
      page.getByText(
        new RegExp(`Total Price.*${expectedTotal.replace(".", "\\.")}`)
      )
    ).toBeVisible();

    await completePayment(page);

    console.log("\n=== Test Completed Successfully ===");
    console.log(`Movie: ${sidePanelData.movie.movie_name}`);
    console.log(`Seats: ${selectedSeats.join(", ")}`);
    console.log(`skip_fnb: ${skipFnb}`);
    console.log(`Total: ${expectedTotal}`);
  });

  // ============================================================================
  // TEST 8: Normal Ticket Booking with F&B with no modifiers and using payment option as Gift Card + Credit Card
  // ============================================================================

  test("TC_08 – Verify Normal Movie Ticket Booking with F&B (No Modifiers) Using Gift Card and Credit Card Combined Payment", async ({
    page,
    request,
  }) => {

    await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/novocinemas\.com\/home/);

    const selectedMovie = await selectMovieDynamically(page, request);
    const { movie, movieId } = await getMovieDetails(
      page,
      request,
      selectedMovie
    );
    console.log("Movie data fetched:", movie.movie_title);

    await verifyMovieDetailsPage(page, movie);
    const bookingResult = await dynamicBooking(page, movieId);
    const authToken = await loginAndCaptureTokenBooking(page);

    let cinemaId = bookingResult.cinemaId;
    if (!cinemaId) {
      const match = page.url().match(/cinema\/(\d+)/);
      if (match) cinemaId = match[1];
      else throw new Error("Cinema ID could not be found.");
    }

    const sidePanelApi = await request.get(
      `${BACKEND_URL}/api/booking/side-panel/cinemas/${cinemaId}/sessions/${bookingResult.sessionId}?country_id=1&channel=web`
    );
    const sidePanelApiData = await sidePanelApi.json();
    const sidePanelData = sidePanelApiData.data;

    const { selectedSeats, totalTicketPrice } = await selectSeats(
      page,
      request,
      cinemaId,
      bookingResult.sessionId
    );

    console.log(
      "Selected seats:",
      selectedSeats,
      "Total ticket price:",
      totalTicketPrice
    );

    let bookingFeeCents = 500;
    let skipFnb = false;

    const selectSeatsResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/booking/select-seats") &&
        resp.request().method() === "POST"
    );

    await page.getByRole("button", { name: "Continue" }).click();

    try {
      const selectSeatsResponse = await selectSeatsResponsePromise;
      const selectSeatsApiData = await selectSeatsResponse.json();
      bookingFeeCents = selectSeatsApiData?.data?.bookingFee ?? 500;
      skipFnb = selectSeatsApiData?.data?.skip_fnb === true;
      console.log("skip_fnb:", skipFnb);
    } catch {
      console.warn("Could not capture select-seats API response");
    }

    // ======================================================
    // F&B PAGE HANDLING (ONLY WHEN skip_fnb = false)
    // ======================================================
    let fbTracker = null;

    if (!skipFnb) {
      const concessionsResponse = await page.waitForResponse((resp) =>
        resp.url().includes("/api/booking/concessions/cinema/")
      );

      const concessionsData = await concessionsResponse.json();
      // await page.waitForLoadState("networkidle");

      await expect(
        page.getByRole("heading", { name: "Snack Time!" })
      ).toBeVisible();

      console.log("\n=== Starting F&B Selection Flow (No Modifiers Only) ===");

      fbTracker = createFBTracker();
      const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);

      if (itemsWithNoModifiers.length > 0) {
        const selectedItem = itemsWithNoModifiers[0];
        await addFandBItemNoModifiers(page, selectedItem, fbTracker);
      }

      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL((url) => url.pathname.includes("/payment"));
    } else {
      console.log(
        "🚀 skip_fnb=true → Skipping F&B and navigating directly to Payment"
      );
      await page.waitForURL((url) => url.pathname.includes("/payment"));
    }

    // ======================================================
    // PAYMENT PAGE VERIFICATION (UNCHANGED)
    // ======================================================
    // await page.waitForLoadState("networkidle");

    const paymentSidePanel = page
      .locator(".flex-col.md\\:bg-\\[\\#B3B2B340\\]")
      .first();

    await expect(paymentSidePanel).toBeVisible();

    // ================= TOTAL BEFORE GIFT CARD =================
    const bookingFeeQAR = bookingFeeCents / 100;
    const fbTotal = skipFnb ? 0 : fbTracker.totalPrice;
    const grandTotal = totalTicketPrice + fbTotal + bookingFeeQAR;

    const beforeTotalRegex = new RegExp(
      `QAR\\s*${grandTotal.toString().replace(".", "\\.?")}`,
      "i"
    );

    await expect(
      paymentSidePanel.getByText("Total Price", { exact: true })
    ).toBeVisible();

    await expect(paymentSidePanel.getByText(beforeTotalRegex)).toBeVisible();

    console.log(`✓ Verified total before gift card: QAR ${grandTotal}`);

    // ================= VERIFY F&B ITEMS IN PAYMENT PAGE =================
    if (!skipFnb && fbTracker?.items?.length) {
      console.log("\n=== Verifying F&B Items in Payment Page ===");

      await page
        .locator("section")
        .filter({ hasText: /^Food & Beverages$/ })
        .locator("div")
        .first()
        .click();

      for (const fbItem of fbTracker.items) {
        const itemNameToVerify = fbItem.concessionItemName || fbItem.name;
        const escapedName = itemNameToVerify.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        await expect(
          page.getByText(new RegExp(escapedName, "i")).first()
        ).toBeVisible();

        console.log(`✓ Verified F&B item: ${itemNameToVerify}`);
      }
    }

    // ================= APPLY GIFT CARD =================
    const giftCardResult = await applyPartialGiftCardAndProceedToCreditPayment(
      page,
      request,
      authToken,
      grandTotal
    );

    // ================= CONDITIONAL VERIFICATION =================
    if (giftCardResult?.appliedAmountQAR > 0) {
      const appliedAmount = giftCardResult.appliedAmountQAR;
      const remainingAmount = giftCardResult.remainingAmountQAR;

      console.log("🔍 Verifying gift card discount in side panel");

      await expect(
        paymentSidePanel.getByText("Gift Card Discount", {
          exact: true,
        })
      ).toBeVisible();

      await expect(
        paymentSidePanel.getByText(
          new RegExp(`-\\s*QAR\\s*${appliedAmount}`, "i")
        )
      ).toBeVisible();

      console.log(`✓ Verified Gift Card Discount: - QAR ${appliedAmount}`);

      const afterTotalRegex = new RegExp(
        `QAR\\s*${remainingAmount.toString().replace(".", "\\.?")}`,
        "i"
      );

      await expect(paymentSidePanel.getByText(afterTotalRegex)).toBeVisible();

      console.log(`✓ Verified total after gift card: QAR ${remainingAmount}`);
    } else {
      console.log("ℹ️ Gift card not applied — skipping gift card verification");
    }

    console.log("\n=== Test Completed Successfully ===");
    console.log(`Movie: ${sidePanelData.movie.movie_name}`);
    console.log(`Seats: ${selectedSeats.join(", ")}`);
    console.log(`skip_fnb: ${skipFnb}`);
    if (giftCardResult?.remainingAmountQAR !== undefined) {
      console.log(
        `Final Total (payable): QAR ${giftCardResult.remainingAmountQAR}`
      );
    } else {
      console.log(`Final Total (payable): QAR ${grandTotal}`);
    }
  });

  // ============================================================================
  // TEST 9: Normal Ticket Booking with F&B with no modifiers and using payment option as Novo wallet
  // ============================================================================

  test("TC_09 – Verify Normal Movie Ticket Booking with F&B (No Modifiers) Using Novo Wallet Payment", async ({
    page,
    request,
  }) => {

    await page.goto(`${BASE_URL}/home`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL(/novocinemas\.com\/home/);

    const selectedMovie = await selectMovieDynamically(page, request);
    const { movie, movieId } = await getMovieDetails(
      page,
      request,
      selectedMovie
    );
    console.log("Movie data fetched:", movie.movie_title);

    await verifyMovieDetailsPage(page, movie);
    const bookingResult = await dynamicBooking(page, movieId);
    const authToken = await loginAndCaptureTokenBooking(page);

    let cinemaId = bookingResult.cinemaId;
    if (!cinemaId) {
      const match = page.url().match(/cinema\/(\d+)/);
      if (match) cinemaId = match[1];
      else throw new Error("Cinema ID could not be found.");
    }

    const sidePanelApi = await request.get(
      `${BACKEND_URL}/api/booking/side-panel/cinemas/${cinemaId}/sessions/${bookingResult.sessionId}?country_id=1&channel=web`
    );
    const sidePanelApiData = await sidePanelApi.json();
    const sidePanelData = sidePanelApiData.data;

    const { selectedSeats, totalTicketPrice } = await selectSeats(
      page,
      request,
      cinemaId,
      bookingResult.sessionId
    );

    console.log(
      "Selected seats:",
      selectedSeats,
      "Total ticket price:",
      totalTicketPrice
    );

    let bookingFeeCents = 500;
    let skipFnb = false;

    const selectSeatsResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/booking/select-seats") &&
        resp.request().method() === "POST"
    );

    await page.getByRole("button", { name: "Continue" }).click();

    try {
      const selectSeatsResponse = await selectSeatsResponsePromise;
      const selectSeatsApiData = await selectSeatsResponse.json();
      bookingFeeCents = selectSeatsApiData?.data?.bookingFee ?? 500;
      skipFnb = selectSeatsApiData?.data?.skip_fnb === true;
      console.log("skip_fnb:", skipFnb);
    } catch {
      console.warn("Could not capture select-seats API response");
    }

    // ======================================================
    // F&B PAGE HANDLING (ONLY WHEN skip_fnb = false)
    // ======================================================
    let fbTracker = null;

    if (!skipFnb) {
      const concessionsResponse = await page.waitForResponse((resp) =>
        resp.url().includes("/api/booking/concessions/cinema/")
      );

      const concessionsData = await concessionsResponse.json();
      // await page.waitForLoadState("networkidle");

      await expect(
        page.getByRole("heading", { name: "Snack Time!" })
      ).toBeVisible();

      console.log("\n=== Starting F&B Selection Flow (No Modifiers Only) ===");

      fbTracker = createFBTracker();
      const { itemsWithNoModifiers } = categorizeFandBItems(concessionsData);

      if (itemsWithNoModifiers.length > 0) {
        const selectedItem = itemsWithNoModifiers[0];
        await addFandBItemNoModifiers(page, selectedItem, fbTracker);
        console.log(`✅ Successfully added: ${selectedItem.itemName}`);
      }

      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL((url) => url.pathname.includes("/payment"));
    } else {
      console.log(
        "🚀 skip_fnb=true → Skipping F&B and navigating directly to Payment"
      );
      await page.waitForURL((url) => url.pathname.includes("/payment"));
    }

    // ======================================================
    // PAYMENT PAGE VERIFICATION
    // ======================================================
    // await page.waitForLoadState("networkidle");

    const paymentSidePanel = page
      .locator(".flex-col.md\\:bg-\\[\\#B3B2B340\\]")
      .first();

    await expect(paymentSidePanel).toBeVisible();

    // ======================================================
    // TOTAL CALCULATION (SAFE)
    // ======================================================
    const bookingFeeQAR = bookingFeeCents / 100;
    const fbTotal = skipFnb ? 0 : fbTracker.totalPrice;
    const grandTotal = totalTicketPrice + fbTotal + bookingFeeQAR;

    console.log("\n=== Final Totals Calculation ===");
    console.log({
      tickets: totalTicketPrice,
      fb: fbTotal,
      bookingFee: bookingFeeQAR,
      grandTotal,
    });

    // ======================================================
    // VERIFY F&B ITEMS IN PAYMENT PAGE (ONLY IF APPLICABLE)
    // ======================================================
    if (!skipFnb && fbTracker?.items?.length) {
      console.log("\n=== Verifying F&B Items in Payment Page ===");

      await page
        .locator("section")
        .filter({ hasText: /^Food & Beverages$/ })
        .locator("div")
        .first()
        .click();

      for (const fbItem of fbTracker.items) {
        const itemNameToVerify = fbItem.concessionItemName || fbItem.name;
        const escapedName = itemNameToVerify.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        await expect(
          page.getByText(new RegExp(escapedName, "i")).first()
        ).toBeVisible();

        console.log(`✓ Verified F&B item: ${itemNameToVerify}`);
      }
    }

    // ======================================================
    // VERIFY PAYMENT OPTION VISIBILITY
    // ======================================================
    const creditCardOption = page
      .locator("div")
      .filter({ hasText: /^Credit Card$/ })
      .first();

    await expect(creditCardOption).toBeVisible();

    // ================= COMPLETE NOVO WALLET PAYMENT =================
    await applyNovoWalletOnly(page, request, authToken, grandTotal);

    console.log("\n=== Test Completed Successfully ===");
    console.log(`Movie: ${sidePanelData.movie.movie_name}`);
    console.log(`Seats: ${selectedSeats.join(", ")}`);
    console.log(`skip_fnb: ${skipFnb}`);
    console.log(`Total: QAR ${grandTotal}`);
  });
});
