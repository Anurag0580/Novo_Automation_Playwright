import { test, expect } from '@playwright/test';

test.describe('Sign Up Flow Tests', () => {
  
  test('Verifies Navigation to Sign-Up Page from Home Page', async ({ page }) => {
    await page.goto('https://qa.novocinemas.com/home');
    
    // Navigate to sign up page
    await page.getByRole('navigation').getByRole('button').filter({ hasText: /^$/ }).nth(1).click();
    await page.locator('div').filter({ hasText: /^Don't have an account\?Sign Up$/ }).getByRole('button').click();
    
    // Verify sign up page is visible
    await expect(page.getByRole('heading', { name: 'Sign Up', exact: true })).toBeVisible();
  });

  test('Verifies Successful Sign-Up with Valid User Details', async ({ page }) => {
    // Mock OTP verification API before navigation
    await page.route('**/api/verify-otp*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 200,
          success: true,
          message: 'OTP verified successfully'
        })
      });
    });

    await page.goto('https://qa.novocinemas.com/home');
    
    // Navigate to sign up page
    await page.getByRole('navigation').getByRole('button').filter({ hasText: /^$/ }).nth(1).click();
    await page.locator('div').filter({ hasText: /^Don't have an account\?Sign Up$/ }).getByRole('button').click();
    
    // Verify form elements are visible
    const formElements = [
      page.getByRole('heading', { name: 'Sign Up', exact: true }),
      page.locator('div').filter({ hasText: /^Name$/ }),
      page.getByRole('textbox', { name: 'Enter your first name' }),
      page.getByRole('textbox', { name: 'Enter your last name' }),
      page.getByRole('textbox', { name: 'Enter your email' }),
      page.getByRole('textbox', { name: 'Enter your password' }),
      page.getByRole('textbox', { name: 'Confirm your password' }),
      page.locator('div').filter({ hasText: /^Year$/ }).nth(3),
      page.locator('div').filter({ hasText: /^Month$/ }).nth(2),
      page.locator('div').filter({ hasText: /^Day$/ }).nth(2),
      page.getByText('Phone Number'),
      page.locator('div').filter({ hasText: /^Select your nationality$/ }).nth(1),
      page.locator('label').filter({ hasText: /^Male$/ }),
      page.locator('label').filter({ hasText: 'Female' }),
      page.locator('form').getByRole('button', { name: 'Sign Up' })
    ];

    for (const element of formElements) {
      await expect(element).toBeVisible();
    }

    // Generate dynamic user data
    const timestamp = Date.now();
    const firstName = 'TestUser';
    const lastName = 'Auto';
    const email = `testuser${timestamp}@temp.com`;
    const password = 'TempUser@123';
    const phone = `98${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;

    // Fill user details with dynamic data
    await page.getByRole('textbox', { name: 'Enter your first name' }).fill(firstName);
    await page.getByRole('textbox', { name: 'Enter your last name' }).fill(lastName);
    await page.getByRole('textbox', { name: 'Enter your email' }).fill(email);
    await page.getByRole('textbox', { name: 'Enter your password' }).fill(password);
    await page.getByRole('textbox', { name: 'Confirm your password' }).fill(password);

    // Generate random date of birth (18-65 years old)
    const currentYear = new Date().getFullYear();
    const randomYear = currentYear - Math.floor(Math.random() * 47) - 18;
    const randomMonth = Math.floor(Math.random() * 12) + 1;
    const randomDay = Math.floor(Math.random() * 28) + 1;
    
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    const selectedMonth = months[randomMonth - 1];
    
    console.log(`Generated User: ${firstName} ${lastName} (${email})`);
    console.log(`Generated DOB: ${randomDay}/${randomMonth}/${randomYear} (${selectedMonth})`);
    console.log(`Generated Phone: ${phone}`);

    // Year (first dropdown)
    await page.locator('.css-hswncw-indicatorContainer').nth(0).click();
    await page.getByRole('option', { name: randomYear.toString() }).click();

    // Month (second dropdown)
    await page.locator('div:nth-child(2) > .w-full > .css-bep2p7-control > .css-1wy0on6 > .css-hswncw-indicatorContainer').click();
    await page.getByRole('option', { name: selectedMonth }).click();

    // Day (third dropdown)
    await page.locator('.css-hswncw-indicatorContainer').nth(1).click();
    await page.getByRole('option', { name: randomDay.toString() }).click();

    // Fill phone number with dynamic data
    await page.getByRole('textbox', { name: 'Enter your Phone Number' }).fill(phone);

    // Nationality
    await page.locator('.mb-4 > .custom-scrollbar > .css-bep2p7-control > .css-1wy0on6 > .css-hswncw-indicatorContainer').click();
    await page.getByRole('option', { name: 'Indian' }).click();

    // Select random gender
    const genders = ['Male', 'Female'];
    const selectedGender = genders[Math.floor(Math.random() * genders.length)];
    await page.locator(`label`).filter({ hasText: new RegExp(`^${selectedGender}$`) }).click();
    console.log(`Selected Gender: ${selectedGender}`);

    // Check newsletter subscription
    await page.getByRole('checkbox').check();
    await expect(page.getByRole('checkbox')).toBeChecked();

    // Submit form
    await page.locator('form').getByRole('button', { name: 'Sign Up' }).click();

    // Wait for OTP page and verify
    await expect(page.getByText('Please check your email')).toBeVisible();
    await expect(page.locator('body')).toContainText('Verify');

    // Generate random 4-digit OTP for testing
    const randomOTP = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`Generated OTP: ${randomOTP}`);
    
    // Fill OTP - Use a more reliable selector
    const otpInputs = await page.locator('input[name^="otp"]').all();
    for (let i = 0; i < otpInputs.length; i++) {
        await otpInputs[i].fill(randomOTP[i]);
    }
    
    // Submit OTP verification - Use a more specific selector and force click if needed
    const submitButton = page.locator('form').getByRole('button').first();
    
    // Try multiple approaches to handle the modal interception
    try {
        await submitButton.click({ timeout: 5000 });
    } catch (error) {
        // If regular click fails, try forcing the click
        await submitButton.click({ force: true });
    }
    
    // Alternatively, use JavaScript to click the button
    await page.evaluate(() => {
        const button = document.querySelector('form button[type="submit"]');
        if (button) button.click();
    });
    
    // Verify successful registration redirect
    await expect(page).toHaveURL(/.*\/home/);
    
    // Verify user is logged in with correct dynamic name
    await expect(page.locator('.justify-end > .relative > .capitalize'))
      .toContainText(`Hey, ${firstName}`);
});

  test('Verifies Sign-Up Form Validation with Existing Email', async ({ page }) => {
    await page.goto('https://qa.novocinemas.com/home');
    
    // Navigate to sign up page
    await page.getByRole('navigation').getByRole('button').filter({ hasText: /^$/ }).nth(1).click();
    await page.locator('div').filter({ hasText: /^Don't have an account\?Sign Up$/ }).getByRole('button').click();
    
    // Fill form with existing email to trigger validation
    await page.getByRole('textbox', { name: 'Enter your first name' }).fill('Test');
    await page.getByRole('textbox', { name: 'Enter your last name' }).fill('User');
    await page.getByRole('textbox', { name: 'Enter your email' }).fill('Anurag.Gupta@enpointe.io'); // Known existing email
    await page.getByRole('textbox', { name: 'Enter your password' }).fill('Test@123');
    await page.getByRole('textbox', { name: 'Confirm your password' }).fill('Test@123');
    
    // Quick fill required fields for validation test
    await page.locator('.css-hswncw-indicatorContainer').first().click();
    await page.getByRole('option', { name: '2000' }).click();
    await page.getByRole('textbox', { name: 'Enter your Phone Number' }).fill('1234567890');
    await page.locator('.custom-scrollbar > .css-bep2p7-control > .css-1wy0on6 > .css-hswncw-indicatorContainer').click();
    await page.getByRole('option', { name: 'Indian' }).click();
    await page.locator('label').filter({ hasText: /^Male$/ }).click();
    await page.getByRole('checkbox').check();
    
    // Submit and verify error message
    await page.locator('form').getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByText('The email address is already')).toBeVisible();
  });
});