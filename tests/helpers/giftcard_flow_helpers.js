import { test, expect } from '@playwright/test';
import { BASE_URL, BACKEND_URL, COUNTRY_ID, COUNTRY_NAME, CURRENCY } from "./envConfig.js";

// ==================== CONSTANTS ====================
// const TEST_CARD_NUMBER = '2000001537711200'; // For Qatar
const TEST_CARD_NUMBER = '9950082515665964'; // For UAE
const GIFT_CARDS_API_PATH = '/api/gifts-wallets/gift-cards/all';

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
  let userDetails = null;
  const startingUrl = page.url();

  const tokenListener = (req) => {
    const headers = req.headers();
    if (headers['authorization']?.startsWith('Bearer')) {
      authToken = headers['authorization'];
    }
  };

  page.on('request', tokenListener);

  const userDetailsPromise = page
    .waitForResponse(
      response =>
        response.url().includes(`${BACKEND_URL}/api/user/user-details`) &&
        response.status() === 200,
      { timeout: 30000 }
    )
    .catch(() => null);

  await page.getByRole('textbox', { name: 'Enter your email' }).fill(EMAIL);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  const userDetailsResponse = await userDetailsPromise;
  if (userDetailsResponse) {
    const requestHeaders = userDetailsResponse.request().headers();
    if (!authToken && requestHeaders['authorization']?.startsWith('Bearer')) {
      authToken = requestHeaders['authorization'];
    }
    userDetails = await parseUserDetailsResponse(userDetailsResponse);
  }

  if (authToken) {
    await page.evaluate(([token]) => {
      localStorage.setItem('auth_token', token.replace('Bearer ', ''));
      localStorage.setItem('access_token', token.replace('Bearer ', ''));
      localStorage.setItem('authorization_token', token);
    }, [authToken]);
  }

  await Promise.race([
    page.waitForURL(url => url.href !== startingUrl, { timeout: 15000 }).catch(() => null),
    page.waitForLoadState('networkidle').catch(() => null),
  ]);

  page.off('request', tokenListener);
  return { authToken, userDetails };
}


/**
 * Complete payment by filling card details
 */
async function verifyCyberSourceSdkLoaded(page) {
  const cybersourceFrame = page.frameLocator('iframe[id="__buttonlist"]');
  const checkoutButton = cybersourceFrame.getByRole('button', {
    name: /Checkout with card/i,
  });

  await expect(checkoutButton).toBeVisible({ timeout: 15000 });

  const incompatibleMessage = cybersourceFrame.getByText(
    /Browser not compatible\.?/i
  );
  await expect(incompatibleMessage).toHaveCount(0, { timeout: 3000 });

  console.log(
    `✅ CyberSource SDK loaded successfully for ${COUNTRY_NAME}: checkout launcher is visible`
  );
}

async function completePayment(page) {
  if (COUNTRY_ID === 2) {
    await verifyCyberSourceSdkLoaded(page);
    return;
  }

  const creditCardOption = page.locator('div', { hasText: /^Credit Card$/ }).first();
  await expect(creditCardOption).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Use a Different Card' }).click();
  
  await page.frameLocator('iframe[name="cardNumber-input"]').locator('input').fill('4111111111111111');
  await page.frameLocator('iframe[name="expiryDate-input"]').locator('input').fill('12/28');
  await page.frameLocator('iframe[name="verificationCode-input"]').locator('input').fill('123');
  
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

  return parseUserDetailsResponse(response);
}

async function parseUserDetailsResponse(response) {
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
  await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation').getByRole('button').filter({ hasText: /^$/ }).nth(2).click();
  await page.getByRole('link', { name: 'Gift Cards' }).click();
  await expect(page).toHaveURL(`${BASE_URL}/giftCardFlow`);
  await page.waitForLoadState('domcontentloaded');
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
async function fetchAvailableGiftCards(page) {
  const response = await page.request.get(
    `${BACKEND_URL}${GIFT_CARDS_API_PATH}?country_id=${COUNTRY_ID}&channel=web`,
    {
      headers: {
        accept: 'application/json, text/plain, */*',
        referer: `${BASE_URL}/`,
      },
    }
  );

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.success).toBeTruthy();
  expect(Array.isArray(body.data)).toBeTruthy();
  expect(body.data.length).toBeGreaterThan(0);

  return body.data;
}

function centsToDisplayAmount(priceInCents) {
  return String(Math.floor(priceInCents / 100));
}

function pickRandomItem(items) {
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
}

async function selectGiftCard(page, price, currency = CURRENCY, quantity = 1) {
  if (COUNTRY_ID === 2) {
    await expect(
      page.getByRole('heading', { name: /Customize your gift card/i })
    ).toBeVisible({ timeout: 15000 });

    const apiCards = await fetchAvailableGiftCards(page);
    const matchingCard = price
      ? apiCards.find(card => centsToDisplayAmount(card.PriceInCents) === String(price))
      : null;
    const selectedApiCard = matchingCard || pickRandomItem(apiCards);
    const selectedPrice = centsToDisplayAmount(selectedApiCard.PriceInCents);
    const cardHeading = `${selectedPrice} ${CURRENCY}`;

    const card = page
      .locator('.border.border-gray-500')
      .filter({
        has: page.getByRole('heading', { name: cardHeading }),
      })
      .first();

    await expect(card).toBeVisible();
    await expect(card.getByRole('img', { name: 'gift card image' })).toBeVisible();
    await expect(card.getByRole('heading', { name: cardHeading })).toBeVisible();
    await expect(card.getByText('Quantity').first()).toBeVisible();

    const quantityInput = card.getByRole('spinbutton').first();
    await expect(quantityInput).toBeVisible();
    await quantityInput.fill(String(quantity));

    console.log(`âœ… ${COUNTRY_NAME} gift card selected dynamically: ${cardHeading}`);

    return {
      price: selectedPrice,
      currency: CURRENCY,
      quantity,
      actionLocator: card.getByRole('button', { name: 'Pay now' }).first(),
    };
  }

  await expect(page.getByText('Customize your Gift Card')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Price:')).toBeVisible();

  let selectedPrice = String(price);
  if (price) {
    await page.getByRole('button', { name: `${currency} ${price}` }).click();
  } else {
    const priceInput = page.getByRole('spinbutton').first();
    await expect(priceInput).toBeVisible();
    selectedPrice = await priceInput.inputValue();
  }

  const quantityInput = page.getByRole('spinbutton').nth(1);
  await expect(quantityInput).toBeVisible();
  await quantityInput.fill(String(quantity));

  return {
    price: selectedPrice,
    currency,
    quantity,
    actionLocator: page.getByRole('button', { name: 'Next' }).first(),
  };
}

/**
 * Capture gift card API response
 */
async function captureGiftCardAPI(page, apiPath = '/api/gifts-wallets/gift-card/buy', selectedCard = null) {
  const actionLocator =
    selectedCard?.actionLocator ||
    page.getByRole('button', { name: COUNTRY_ID === 2 ? 'Pay now' : 'Next' }).first();

  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes(`${BACKEND_URL}${apiPath}`)),
    actionLocator.click()
  ]);

  const body = await response.json();

  if (response.status() !== 200 || !body.success) {
    const errorMsg = body.message || 'Unknown backend error';
    console.log(`❌ Gift card API error: ${errorMsg}`);
    throw new Error(`Gift card API failed with status ${response.status()}: ${errorMsg}`);
  }

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
  CURRENCY,
  TEST_CARD_NUMBER,
  loginAndCaptureToken,
  verifyCyberSourceSdkLoaded,
  completePayment,
  getUserDetailsFromAPI,
  navigateToGiftCardFlow,
  verifyOrderSummary,
  selectGiftCard,
  captureGiftCardAPI,
  formatPurchaseDate,
  fetchAvailableGiftCards,
};
