import { test, expect } from '@playwright/test';

// ==================== CONSTANTS ====================
const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

const TEST_CARD_NUMBER = '2000001537711200';
if (!BASE_URL || !BACKEND_URL) {
  throw new Error('❌ Frontend or Backend URL is missing in .env file');
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Login and capture authentication token
 */
async function loginAndCaptureToken(page) {
  const EMAIL = process.env.LOGIN_EMAIL;
  const PASSWORD = process.env.LOGIN_PASSWORD;

  if (!EMAIL || !PASSWORD) {
    throw new Error('❌ LOGIN_EMAIL or LOGIN_PASSWORD is missing in .env file');
  }

  let authToken = null;

  const tokenListener = (req) => {
    const headers = req.headers();
    if (headers['authorization']?.startsWith('Bearer')) {
      authToken = headers['authorization'];
    }
  };

  page.on('request', tokenListener);

  await page.getByRole('textbox', { name: 'Enter your email' }).fill(EMAIL);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  if (authToken) {
    await page.evaluate(([token]) => {
      localStorage.setItem('auth_token', token.replace('Bearer ', ''));
      localStorage.setItem('access_token', token.replace('Bearer ', ''));
      localStorage.setItem('authorization_token', token);
    }, [authToken]);

    await page.reload({ waitUntil: 'networkidle' });
  }

  page.off('request', tokenListener);
}


/**
 * Complete payment by filling card details
 */
async function completePayment(page) {
  const creditCardOption = page.locator('div', { hasText: /^Credit Card$/ }).first();
  await expect(creditCardOption).toBeVisible();
  await page.getByRole('button', { name: 'Use a Different Card' }).click();
  
  await page.frameLocator('#cardNumber-iframe').locator('input').fill('4111111111111111');
  await page.frameLocator('#expiryDate-iframe').locator('input').fill('12/28');
  await page.frameLocator('#verificationCode-iframe').locator('input').fill('123');
  
  await page.getByRole('checkbox', { name: 'I agree to the Terms and' }).check();
}

/**
 * Get user details from API response
 */
async function getUserDetailsFromAPI(page) {
  const response = await page.waitForResponse(
    res => res.url().includes(`${BACKEND_URL}/api/user/user-details`)&& res.status() === 200,
    { timeout: 30000 }
  );
  
  const apiResponse = await response.json();
  if (!apiResponse.success || !apiResponse.data) {
    throw new Error('User details API response is invalid');
  }
  
  const userData = apiResponse.data;
  const phoneWithoutCode = userData.user_contact.replace(/^\+\d{1,3}/, '');
  
  return {
    email: userData.user_email,
    fullName: `${userData.user_first_name} ${userData.user_last_name}`,
    userName: userData.user_name,
    phoneNumber: userData.user_contact,
    phoneWithoutCode: phoneWithoutCode,
    userId: userData.user_id
  };
}

/**
 * Navigate to gift card flow page
 */
async function navigateToGiftCardFlow(page) {
  await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation').getByRole('button').filter({ hasText: /^$/ }).nth(2).click();
  await page.getByRole('link', { name: 'Gift Cards' }).click();
  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow`);
  await page.waitForLoadState('networkidle');
}

/**
 * Verify order summary details
 */
async function verifyOrderSummary(page, testData) {
  await expect(page.getByText("Order Summary")).toBeVisible({timeout: 15000});
  
  // Verify Purchased for (Recipient Type)
  await expect(page.getByText('Purchased for')).toBeVisible();
  await expect(page.getByText(testData.recipientType)).toBeVisible();
  console.log(`✅ Verified recipient type: ${testData.recipientType}`);
  
  // Verify Name
  await expect(page.getByText('Name')).toBeVisible();
  await expect(page.getByText(testData.name || testData.userName)).toBeVisible();
  console.log(`✅ Verified name: ${testData.name || testData.userName}`);
  
  // Verify Email
  await expect(page.getByText('Mail ID')).toBeVisible();
  await expect(page.getByText(testData.email, { exact: true })).toBeVisible();
  console.log(`✅ Verified email: ${testData.email}`);
  
  // Verify Phone Number
  await expect(page.getByText('Mobile Number')).toBeVisible();
  await expect(page.getByText(testData.phoneNumber)).toBeVisible();
  console.log(`✅ Verified phone number: ${testData.phoneNumber}`);
  
  // Verify Quantity - using a more specific locator
  await expect(page.getByText('Number of gift cards')).toBeVisible();
  // Find the element containing "Number of gift cards" and check its sibling/nearby text
  const quantitySection = page.locator('text="Number of gift cards"').locator('..');
  await expect(quantitySection.getByText(testData.quantity.toString())).toBeVisible();
  console.log(`✅ Verified quantity: ${testData.quantity}`);

  // Verify Total Cost
  await expect(page.getByText('Total Cost')).toBeVisible();
  await expect(page.getByText(new RegExp(`${testData.currency}\\s*${testData.price}`))).toBeVisible();
  console.log(`✅ Verified total cost: ${testData.currency} ${testData.price}`);
  
  // Verify confirmation note
  const expectedNote = `Note: Details of the gift card will be shared on ${testData.email}`;
  await expect(page.getByText(expectedNote)).toBeVisible();
  console.log(`✅ Verified confirmation note`);
}

/**
 * Select gift card by price
 */
async function selectGiftCard(page, price, currency = 'QAR') {
  await expect(page.getByText('Customize your Gift Card')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Price:')).toBeVisible();
  await page.getByRole('button', { name: `${currency} ${price}` }).click();
}

/**
 * Capture gift card API response
 */
async function captureGiftCardAPI(page, apiPath = '/api/gifts-wallets/gift-card/buy') {
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes(`${BACKEND_URL}${apiPath}`) && res.status() === 200),
    page.getByRole('button', { name: 'Next' }).click()
  ]);

  const body = await response.json();
  expect(body.success).toBeTruthy();
  expect(body.data).toHaveProperty('reservationId');
  console.log(`✅ Gift card API success: ${body.data.reservationId}`);
  return body;
}

/**
 * Format purchase date to display format
 */
function formatPurchaseDate(isoDate) {
  const date = new Date(isoDate);
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'long' });
  
  const getSuffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  
  return `${day}${getSuffix(day)} ${month}`;
}


// ==================== EXPORTS ====================
export {
  BASE_URL,
  BACKEND_URL,
  TEST_CARD_NUMBER,
  loginAndCaptureToken,
  completePayment,
  getUserDetailsFromAPI,
  navigateToGiftCardFlow,
  verifyOrderSummary,
  selectGiftCard,
  captureGiftCardAPI,
  formatPurchaseDate,
};
