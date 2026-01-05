import {test, expect} from '@playwright/test';
import {
  BASE_URL,
  TEST_CARD_NUMBER,
  loginAndCaptureToken,
  completePayment,
  getUserDetailsFromAPI,
  navigateToGiftCardFlow,
  verifyOrderSummary,
  selectGiftCard,
  captureGiftCardAPI,
  formatPurchaseDate,
  setupTest
} from './helpers/giftcard_flow_helpers.js';

// Tests
test("TC_01 – Verify Gift Card Purchase Flow for Another Recipient (For Someone Else)", async ({page}) => {
  await setupTest(page);

  const testData = {
    recipientType: 'For Someone Else',
    name: 'Test User',
    email: 'Anurag@gmail.com',
    phoneNumber: '5551234',
    countryCode: '+974',
    price: '250',
    quantity: 1,
    currency: 'QAR'
  };

  await navigateToGiftCardFlow(page);
  await expect(page.getByRole('heading', { name: 'Give the Gift of Entertainment' })).toBeVisible();
  await page.getByRole('button', { name: 'Buy a Gift Card' }).click();
  await loginAndCaptureToken(page);
  
  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/buygiftcard`);
  await page.waitForLoadState('networkidle');

  await page.getByRole('textbox', { name: 'Name' }).fill(testData.name);
  await page.getByRole('textbox', { name: 'Email Address' }).fill(testData.email);
  await page.getByRole('textbox', { name: 'Phone Number' }).fill(testData.phoneNumber);
  await page.getByRole('button', { name: 'Select your preferred card' }).click();
  
  await selectGiftCard(page, testData.price, testData.currency);
  await captureGiftCardAPI(page);
  await verifyOrderSummary(page, testData);
  
  await expect(page.getByRole('heading', { name: 'Payment Options'})).toBeVisible();
  await completePayment(page);
});

test("TC_02 – Verify Gift Card Purchase Flow for Logged-In User (For Me) with Pre-Filled User Details", async ({page}) => {
  await setupTest(page);

  const testData = {
    recipientType: 'Myself',
    price: '250',
    quantity: 1,
    currency: 'QAR'
  };

  await navigateToGiftCardFlow(page);
  await page.getByRole('button', { name: 'Buy a Gift Card' }).click();
  await loginAndCaptureToken(page);
  
  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/buygiftcard`);
  await page.waitForLoadState('networkidle');
  
  const userDetails = await getUserDetailsFromAPI(page);
  Object.assign(testData, {
    email: userDetails.email,
    phoneNumber: userDetails.phoneWithoutCode,
    userName: userDetails.userName
  });

  await page.getByRole('button', { name: 'For Me' }).click();

  // Verify pre-filled fields
  const emailInput = page.getByRole('textbox', { name: 'Email Address' });
  const phoneInput = page.getByRole('textbox', { name: 'Phone Number' });
  
  expect(await emailInput.inputValue()).toBe(userDetails.email);
  expect(await phoneInput.inputValue()).toContain(userDetails.phoneWithoutCode);
  console.log(`✅ Fields pre-filled correctly`);

  await page.getByRole('button', { name: 'Select your preferred card' }).click();
  await selectGiftCard(page, testData.price, testData.currency);
  await captureGiftCardAPI(page);
  await verifyOrderSummary(page, testData);
  
  await completePayment(page);
});

test("TC_03 – Verify Gift Card Top-Up Flow Using Existing Gift Card Number", async ({page}) => {
  await setupTest(page);

  await navigateToGiftCardFlow(page);
  await expect(page.getByRole('heading', { name: 'Top Up Your Gift Card' })).toBeVisible();
  await page.getByRole('button', { name: 'Top up' }).click();
  await loginAndCaptureToken(page);
  
  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/topUpCard`);
  await page.waitForLoadState('networkidle');
  
  await page.getByRole('textbox', { name: 'Enter your gift Card Number' }).fill(TEST_CARD_NUMBER);
  
  const apiResponsePromise = page.waitForResponse(
    response => response.url().includes(`/api/gifts-wallets/gift-card/balance/${TEST_CARD_NUMBER}`) 
      && response.status() === 200
  );
  
  await page.getByRole('button', { name: 'TopUP' }).click();
  const apiResponse = await apiResponsePromise;
  const responseData = await apiResponse.json();
  
  expect(responseData.success).toBe(true);
  expect(responseData.data.card_number).toBe(TEST_CARD_NUMBER);
  console.log(`Gift Card Balance: ${responseData.data.balance_amount}`);

  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/topUpCard/${TEST_CARD_NUMBER}`);
  
  await selectGiftCard(page, '250');
  await captureGiftCardAPI(page, '/api/gifts-wallets/gift-card/topup');
  
  await expect(page.getByText("Order Summary")).toBeVisible({timeout: 15000});
  await expect(page.getByText(TEST_CARD_NUMBER)).toBeVisible();
  await completePayment(page);
});

test("TC_04 – Verify Gift Card Balance Check Flow and Top-Up Navigation", async ({page}) => {
  await setupTest(page);
  
  await navigateToGiftCardFlow(page);
  await expect(page.getByRole('heading', { name: 'Check Your Gift Card Balance.' })).toBeVisible();
  await page.getByRole('button', { name: 'Check My Balance' }).click();
  await loginAndCaptureToken(page);
  
  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/checkBalance`);
  await page.waitForLoadState('networkidle');
  
  await page.getByRole('textbox', { name: 'Enter your gift Card Number' }).fill(TEST_CARD_NUMBER);
  await page.getByRole('button', { name: 'Check balance now' }).click();
  
  const apiResponse = await page.waitForResponse(
    response => response.url().includes(`/api/gifts-wallets/gift-card/balance/${TEST_CARD_NUMBER}`) 
      && response.status() === 200
  );
  
  const responseData = await apiResponse.json();
  expect(responseData.success).toBe(true);
  expect(responseData.data.card_number).toBe(TEST_CARD_NUMBER);
  
  const displayedAmount = Math.floor(responseData.data.balance_amount / 100);
  const expectedDate = formatPurchaseDate(responseData.data.purchased_at);
  
  await page.waitForLoadState('networkidle');
  
  await expect(page.getByText('Balance :')).toBeVisible();
  const balanceRegex = new RegExp(`QAR\\s*${displayedAmount}|${displayedAmount}\\s*QAR`, 'i');
  await expect(page.locator(`text=${balanceRegex}`)).toBeVisible();
  await expect(page.getByText(expectedDate)).toBeVisible();
  console.log(`Displayed balance: QAR ${displayedAmount}, Date: ${expectedDate}`);
  
  // Navigate back and check again
  await page.getByRole('button', { name: 'Back' }).first().click();
  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/checkBalance`);
  
  await page.getByRole('textbox', { name: 'Enter your gift Card Number' }).fill(TEST_CARD_NUMBER);
  await page.getByRole('button', { name: 'Check balance now' }).click();
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Add Balance' }).click();
  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow/topUpCard/${TEST_CARD_NUMBER}`);
  
  await selectGiftCard(page, '250');
  await captureGiftCardAPI(page, '/api/gifts-wallets/gift-card/topup');
  
  await expect(page.getByText("Order Summary")).toBeVisible({timeout: 15000});
  await completePayment(page);
});