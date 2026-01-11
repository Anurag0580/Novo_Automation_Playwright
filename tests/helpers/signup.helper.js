import {expect} from '@playwright/test';

const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

const Email = process.env.LOGIN_EMAIL;
const Password = process.env.LOGIN_PASSWORD;
const Phone = process.env.LOGIN_PHONE;

/**
 * Navigate to Sign Up page from Home
 */
async function navigateToSignup(page) {
  await page.goto(`${BASE_URL}/home`, {
    waitUntil: 'domcontentloaded'
  });

  await page.getByRole('navigation').getByRole('button').nth(1).click();
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(
    page.getByRole('heading', { name: 'Sign Up', exact: true })
  ).toBeVisible();
}

/**
 * Generate dynamic user data for signup
 */
function generateSignupUser() {
  const timestamp = Date.now();

  return {
    firstName: 'Test',
    lastName: 'User',
    email: `testuser_${timestamp}@temp.com`,
    password: 'TempUser@123',
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    gender: Math.random() > 0.5 ? 'Male' : 'Female',
    dob: {
      year: (new Date().getFullYear() - 25).toString(),
      month: 'January',
      day: '10'
    }
  };
}

/**
 * Fill signup form with provided user data
 */
async function fillSignupForm(page, user) {
  await page.getByRole('textbox', { name: /first name/i }).fill(user.firstName);
  await page.getByRole('textbox', { name: /last name/i }).fill(user.lastName);
  await page.getByRole('textbox', { name: 'Enter your email' }).fill(user.email);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(user.password);
  await page.getByRole('textbox', { name: 'Confirm your password' }).fill(user.password);

  //DOB dropdowns
// Year
await page.locator('div').filter({ hasText: /^Year$/ }).nth(1).getByRole('combobox').click();
await page.getByRole('option', { name: user.dob.year }).click();

// Month
await page.locator('div').filter({ hasText: /^Month$/ }).nth(2).getByRole('combobox').click();
await page.getByRole('option', { name: user.dob.month }).click();

// Day
await page.locator('div').filter({ hasText: /^Day$/ }).nth(2).getByRole('combobox').click();
await page.getByRole('option', { name: user.dob.day }).click();

  await page.getByRole('textbox', { name: /phone/i }).fill(user.phone);

  // Nationality
  await page.locator('div').filter({ hasText: /^Select your nationality$/ }).nth(1).getByRole('combobox').click();
  await page.getByRole('option', { name: 'Indian' }).click();

  // Gender
  await page.getByRole('radio',{name: user.gender,exact:true}).click();

  // Newsletter
  await page.getByRole('checkbox').check();
}

module.exports = {
  navigateToSignup,
  generateSignupUser,
  fillSignupForm
};