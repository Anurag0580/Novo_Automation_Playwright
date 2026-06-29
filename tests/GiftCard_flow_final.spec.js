import { test, expect } from "./fixtures/home-popup.fixture.js";
import { COUNTRY_ID } from "./helpers/envConfig.js";
import {
  BASE_URL,
  BACKEND_URL,
  CURRENCY,
  TEST_CARD_NUMBER,
  loginAndCaptureToken,
  completePayment,
  navigateToGiftCardFlow,
  verifyOrderSummary,
  selectGiftCard,
  captureGiftCardAPI,
  formatPurchaseDate,
} from "./helpers/giftcard_flow_helpers.js";

test.describe("Gift Card Management - Purchase, Balance Check, and Top-Up Validation", () => {
  test("TC_01 - Verify Gift Card Purchase Flow for Another Recipient (For Someone Else)", async ({
    page,
  }) => {
    const testData = {
      recipientType: "For Someone Else",
      name: "Test User",
      email: "Anurag@gmail.com",
      phoneNumber: "5551234",
      countryCode: "+974",
      price: null,
      quantity: 1,
      currency: CURRENCY,
    };

    await navigateToGiftCardFlow(page);
    await expect(
      page.getByRole("heading", { name: "Give the Gift of Entertainment" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Buy a Gift Card" }).click();
    await loginAndCaptureToken(page);

    await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/buygiftcard`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("textbox", { name: "Name" }).fill(testData.name);
    await page
      .getByRole("textbox", { name: "Email Address" })
      .fill(testData.email);
    await page
      .getByRole("textbox", { name: "Phone Number" })
      .fill(testData.phoneNumber);
    await page
      .getByRole("button", { name: "Select your preferred card" })
      .click();

    const selectedCard = await selectGiftCard(
      page,
      testData.price,
      testData.currency,
      testData.quantity
    );
    Object.assign(testData, {
      price: selectedCard.price,
      currency: selectedCard.currency,
      quantity: selectedCard.quantity,
    });

    await captureGiftCardAPI(
      page,
      "/api/gifts-wallets/gift-card/buy",
      selectedCard
    );
    await verifyOrderSummary(page, testData);

    if (COUNTRY_ID !== 2) {
      await expect(
        page.getByRole("heading", { name: "Payment Options" })
      ).toBeVisible();
    }
    await completePayment(page);
  });

  test("TC_02 - Verify Gift Card Purchase Flow for Logged-In User (For Me) with Pre-Filled User Details", async ({
    page,
  }) => {
    const testData = {
      recipientType: "Myself",
      price: null,
      quantity: 1,
      currency: CURRENCY,
    };

    await navigateToGiftCardFlow(page);
    await page.getByRole("button", { name: "Buy a Gift Card" }).click();
    const { userDetails } = await loginAndCaptureToken(page);

    await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/buygiftcard`);
    await page.waitForLoadState("networkidle");

    if (!userDetails) {
      throw new Error(
        "User details response was not captured during login. Start waiting before clicking Sign In."
      );
    }

    Object.assign(testData, {
      email: userDetails.email,
      phoneNumber: userDetails.phoneWithoutCode,
      userName: userDetails.userName,
    });

    await page.getByRole("button", { name: "For Me" }).click();

    const emailInput = page.getByRole("textbox", { name: "Email Address" });
    const phoneInput = page.getByRole("textbox", { name: "Phone Number" });

    await expect
      .poll(async () => await emailInput.inputValue(), {
        timeout: 10000,
        message: "Email field did not auto-populate after selecting 'For Me'",
      })
      .toBe(userDetails.email);
    await expect
      .poll(async () => await phoneInput.inputValue(), {
        timeout: 10000,
        message: "Phone field did not auto-populate after selecting 'For Me'",
      })
      .toContain(userDetails.phoneWithoutCode);
    console.log("Fields pre-filled correctly");

    await page
      .getByRole("button", { name: "Select your preferred card" })
      .click();

    const selectedCard = await selectGiftCard(
      page,
      testData.price,
      testData.currency,
      testData.quantity
    );
    Object.assign(testData, {
      price: selectedCard.price,
      currency: selectedCard.currency,
      quantity: selectedCard.quantity,
    });

    await captureGiftCardAPI(
      page,
      "/api/gifts-wallets/gift-card/buy",
      selectedCard
    );
    await verifyOrderSummary(page, testData);

    await completePayment(page);
  });

  test("TC_03 - Verify Gift Card Top-Up Flow Using Existing Gift Card Number", async ({
    page,
  }) => {
    test.skip(
      COUNTRY_ID === 2,
      "Top-up gift card flow is not available in UAE."
    );

    await navigateToGiftCardFlow(page);
    await expect(
      page.getByRole("heading", { name: "Top Up Your Gift Card" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Top up" }).click();
    await loginAndCaptureToken(page);

    if (new URL(page.url()).pathname === "/giftCardFlow") {
      await page.getByRole("button", { name: "Top up" }).click();
    }

    await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/topUpCard`);
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("textbox", { name: "Enter your gift Card Number" })
      .fill(TEST_CARD_NUMBER);

    const apiResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            `${BACKEND_URL}/api/gifts-wallets/gift-card/balance/${TEST_CARD_NUMBER}`
          ) && response.status() === 200
    );

    await page.getByRole("button", { name: "TopUP" }).click();
    const apiResponse = await apiResponsePromise;
    const responseData = await apiResponse.json();

    expect(responseData.success).toBe(true);
    expect(responseData.data.card_number).toBe(TEST_CARD_NUMBER);
    console.log(`Gift Card Balance: ${responseData.data.balance_amount}`);

    await expect(page).toHaveURL(
      `${BASE_URL}/giftCardFlow/topUpCard/${TEST_CARD_NUMBER}`
    );

    const selectedTopupCard = await selectGiftCard(page, null, CURRENCY, 1);
    await captureGiftCardAPI(
      page,
      "/api/gifts-wallets/gift-card/topup",
      selectedTopupCard
    );

    await expect(page.getByText("Order Summary")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(TEST_CARD_NUMBER)).toBeVisible();
    await completePayment(page);
  });

  test("TC_04 - Verify Gift Card Balance Check Flow and Top-Up Navigation", async ({
    page,
  }) => {
    await navigateToGiftCardFlow(page);
    await expect(
      page.getByRole("heading", { name: "Check Your Gift Card Balance." })
    ).toBeVisible();
    await page.getByRole("button", { name: "Check My Balance" }).click();
    await loginAndCaptureToken(page);

    await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/checkBalance`);
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("textbox", { name: "Enter your gift Card Number" })
      .fill(TEST_CARD_NUMBER);
    await page.getByRole("button", { name: "Check balance now" }).click();

    const apiResponse = await page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            `${BACKEND_URL}/api/gifts-wallets/gift-card/balance/${TEST_CARD_NUMBER}`
          ) && response.status() === 200
    );

    const responseData = await apiResponse.json();
    expect(responseData.success).toBe(true);
    expect(responseData.data.card_number).toBe(TEST_CARD_NUMBER);

    const displayedAmount = Math.floor(responseData.data.balance_amount / 100);
    const expectedDate = formatPurchaseDate(responseData.data.purchased_at);

    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Balance :")).toBeVisible();
    const balanceRegex = new RegExp(
      `${CURRENCY}\\s*${displayedAmount}|${displayedAmount}\\s*${CURRENCY}`,
      "i"
    );
    await expect(page.locator(`text=${balanceRegex}`)).toBeVisible();
    await expect(page.getByText(expectedDate)).toBeVisible();
    console.log(
      `Displayed balance: ${CURRENCY} ${displayedAmount}, Date: ${expectedDate}`
    );

    await page.getByRole("button", { name: "Back" }).first().click();
    await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/checkBalance`);

    await page
      .getByRole("textbox", { name: "Enter your gift Card Number" })
      .fill(TEST_CARD_NUMBER);
    await page.getByRole("button", { name: "Check balance now" }).click();
    await page.waitForLoadState("networkidle");

    if (COUNTRY_ID === 2) {
      await expect(
        page.getByRole("button", { name: "Add Balance" })
      ).toHaveCount(0);
      return;
    }

    await page.getByRole("button", { name: "Add Balance" }).click();
    await expect(page).toHaveURL(
      `${BASE_URL}/giftCardFlow/topUpCard/${TEST_CARD_NUMBER}`
    );

    const selectedBalanceTopupCard = await selectGiftCard(page, null, CURRENCY, 1);
    await captureGiftCardAPI(
      page,
      "/api/gifts-wallets/gift-card/topup",
      selectedBalanceTopupCard
    );

    await expect(page.getByText("Order Summary")).toBeVisible({
      timeout: 15000,
    });
    await completePayment(page);
  });
});
