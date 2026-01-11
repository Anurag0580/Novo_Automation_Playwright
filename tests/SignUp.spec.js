import { test, expect } from '@playwright/test';
const {
  navigateToSignup,
  generateSignupUser,
  fillSignupForm
} = require('./helpers/signup.helper');


const Email = process.env.LOGIN_EMAIL;
const Password = process.env.LOGIN_PASSWORD;
const Phone = process.env.LOGIN_PHONE;


test.describe('User Registration – Sign Up Flow', () => {

  test.beforeEach(async ({ page }) => {
    // Mock OTP verification API
    await page.route('**/api/verify-otp*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      })
    );
  });

  test('TC_01_Verify user can navigate to Sign-Up page from Home', async ({ page }) => {
    await navigateToSignup(page);
  });

  test('TC_02_Verify successful user registration with valid and unique details', async ({ page }) => {
    const user = generateSignupUser();

    await navigateToSignup(page);
    await fillSignupForm(page, user);

    await page.locator('form').getByRole('button',{name: 'Sign Up'}).click();

    // OTP screen
    await expect(page.getByText(/verify/i)).toBeVisible();

    // Fill OTP inputs (mocked)
    const otpInputs = page.locator('input[name^="otp"]');
    for (let i = 0; i < 4; i++) {
      await otpInputs.nth(i).fill(`${i + 1}`);
    }

    await page.getByRole('button', { name: /verify/i }).click();

    // await expect(page).toHaveURL(/home/);
    // await expect(
    //   page.getByText(`Hey, ${user.firstName}`)
    // ).toBeVisible();
  });

  test('TC_03_Verify validation message is displayed for already registered email', async ({ page }) => {
    await navigateToSignup(page);

    await page.getByRole('textbox', { name: /first name/i }).fill('Test');
    await page.getByRole('textbox', { name: /last name/i }).fill('User');
    await page.getByRole('textbox', { name: 'Enter your email' }).fill(Email);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(Password);
  await page.getByRole('textbox', { name: 'Confirm your password' }).fill(Password);

    //DOB dropdowns
// Year
await page.locator('div').filter({ hasText: /^Year$/ }).nth(1).getByRole('combobox').click();
await page.getByRole('option', { name: (new Date().getFullYear() - 25).toString() }).click();
// Month
await page.locator('div').filter({ hasText: /^Month$/ }).nth(2).getByRole('combobox').click();
await page.getByRole('option', { name: 'January' }).click();
// Day
await page.locator('div').filter({ hasText: /^Day$/ }).nth(2).getByRole('combobox').click();
await page.getByRole('option', { name: '10' }).click();

    await page.getByRole('textbox', { name: 'Enter your Phone Number' }).fill('5465657674');

    // Nationality
    await page.locator('div').filter({ hasText: /^Select your nationality$/ }).nth(1).getByRole('combobox').click();
    await page.getByRole('option', { name: 'Indian' }).click();

    // Gender
    await page.getByRole('radio',{name: 'Male', exact:true}).click();         

    await page.locator('form').getByRole('button',{name: 'Sign Up'}).click();

    await expect(
      page.getByText('The email address is already')
    ).toBeVisible();
  });
});