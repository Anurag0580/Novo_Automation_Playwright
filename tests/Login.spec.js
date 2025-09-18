import { test, expect } from '@playwright/test';

test('Verifying Login Functionality', async ({ page }) => {
  let userApiData = null;

  // Intercept API and capture response
  await page.route('**/api/user/user-details*', async (route) => {
    const response = await route.fetch();
    userApiData = (await response.json()).data;
    await route.fulfill({ response });
  });

  await page.goto('https://qa.novocinemas.com/home');
  
  // Navigate to sign in
  const navButton = page.getByRole('navigation').getByRole('button').filter({ hasText: /^$/ }).nth(1);
  await expect(navButton).toBeVisible();
  await navButton.click();

  // Verify sign in form elements
  const signInElements = [
    page.locator('span').filter({ hasText: /^Sign In$/ }),
    page.locator('div').filter({ hasText: /^Email$/ }).nth(2),
    page.getByRole('textbox', { name: 'Enter your email' }),
    page.getByText('Password', { exact: true }),
    page.getByRole('textbox', { name: 'Enter your password' }),
    page.getByText('Sign in with OTP'),
    page.getByText('Forgot Password?'),
    page.getByRole('button', { name: 'Sign In' }),
    page.getByRole('button', { name: 'Google Google' }),
    page.getByRole('button', { name: 'Facebook Facebook' }),
    page.locator('div').filter({ hasText: /^Don't have an account\?Sign Up$/ }).getByRole('button')
  ];

  // Verify all elements are visible
  for (const element of signInElements) {
    await expect(element).toBeVisible();
  }

  await expect(page.locator('form')).toContainText('Sign In');

  // Fill credentials and test password toggle
  const emailInput = page.getByRole('textbox', { name: 'Enter your email' });
  const passwordInput = page.getByRole('textbox', { name: 'Enter your password' });
  const passwordToggle = page.locator('form').getByRole('img');

  await emailInput.fill('Anurag.Gupta@enpointe.io');
  await passwordInput.fill('Anurag@123');

  // Test password visibility toggle
  await passwordToggle.click();
  await expect(passwordInput).toHaveAttribute('type', 'text');
  await passwordToggle.click();
  await expect(passwordInput).toHaveAttribute('type', 'password');

  // Sign in and wait for API response
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForResponse('**/api/user/user-details*');

  // Verify API data and construct expected button text
  expect(userApiData).toBeTruthy();
  const { user_first_name, loylty_info, tierProgress } = userApiData;
  const memberLevel = loylty_info.LoyaltyMember.MemberLevelName.split(' ')[0].toUpperCase();
  const points = tierProgress.pointsRemaining;
  const formattedPoints = points >= 1000 ? `${(points / 1000).toFixed(1)}k` : points.toString();
  const profileButton = page.getByRole('button', { name: new RegExp(`Hey, ${user_first_name}`, 'i') });
  await expect(profileButton).toBeVisible();
  const buttonText = await profileButton.innerText();

  expect(buttonText).toContain(memberLevel); // EDGE, GOLD, etc.
  expect(buttonText).toMatch(/\d+(\.\d+)?k?\s*Points/); // Flexible points check


  // Verify API data structure (dynamic - works with any user)
  expect(user_first_name).toBeTruthy();
  expect(memberLevel).toBeTruthy();
  expect(typeof points).toBe('number');
  expect(points).toBeGreaterThan(0);
});