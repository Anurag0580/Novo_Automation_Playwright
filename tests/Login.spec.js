import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

const Email = process.env.LOGIN_EMAIL;
const Password = process.env.LOGIN_PASSWORD;
const Phone = process.env.LOGIN_PHONE;

if (!BASE_URL || !BACKEND_URL) {
  throw new Error("❌ PROD_FRONTEND_URL or PROD_BACKEND_URL missing in env");
}

async function openLoginPopup(page) {
  const navButton = page
    .getByRole("navigation")
    .getByRole("button")
    .filter({ hasText: /^$/ })
    .nth(1);

  await expect(navButton).toBeVisible();
  await navButton.click();
  await expect(page.locator("form")).toContainText("Sign In");
}

test.describe("User Authentication – Login, OTP & Password Recovery", () => {
  test("TC_01_Verify successful login with valid email and password", async ({
    page,
  }) => {
    let userApiData;

    await page.route("**/api/user/user-details*", async (route) => {
      const response = await route.fetch();
      userApiData = (await response.json()).data;
      await route.fulfill({ response });
    });

    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByRole("textbox", { name: "Enter your email" }).fill(Email);
    await page
      .getByRole("textbox", { name: "Enter your password" })
      .fill(Password);

    // Password visibility toggle
    const passwordInput = page.getByRole("textbox", {
      name: "Enter your password",
    });
    const toggle = page.locator("form").getByRole("img");
    await toggle.click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    await toggle.click();
    await expect(passwordInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForResponse("**/api/user/user-details*");

    expect(userApiData).toBeTruthy();

    const { user_first_name, loylty_info, tierProgress } = userApiData;
    const memberLevel =
      loylty_info.LoyaltyMember.MemberLevelName.split(" ")[0].toUpperCase();
    const points = tierProgress.pointsRemaining;

    const profileButton = page.getByRole("button", {
      name: new RegExp(`Hey, ${user_first_name}`, "i"),
    });

    await expect(profileButton).toBeVisible();
    const buttonText = await profileButton.innerText();

    expect(buttonText).toContain(memberLevel);
    expect(buttonText).toMatch(/\d+(\.\d+)?k?\s*Points/);
    expect(points).toBeGreaterThanOrEqual(0);
  });

  test("TC_02_Verify validation messages when login form is submitted empty", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Password is required")).toBeVisible();
  });

  test("TC_03_Verify OTP login initiation via WhatsApp using registered phone number", async ({
    page,
  }) => {
    let otpResponse;

    await page.route("**/api/auth/otp-login*", async (route) => {
      const response = await route.fetch();
      otpResponse = await response.json();
      await route.fulfill({ response });
    });

    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByText("Sign in with OTP").click();
    await page
      .getByRole("textbox", { name: "Enter your Phone Number" })
      .fill("9354286531");
    await page.getByRole("button", { name: "Send OTP" }).click();

    await page.waitForResponse("**/api/auth/otp-login*");

    if (otpResponse.success) {
      await expect(page.getByText("Please Check Your whatsapp")).toBeVisible();
    } else {
      await expect(page.getByText(otpResponse.message)).toBeVisible();
    }
  });

  test("TC_04_Verify OTP login initiation using registered email address", async ({
    page,
  }) => {
    let otpResponse;

    await page.route("**/api/auth/otp-login*", async (route) => {
      const response = await route.fetch();
      otpResponse = await response.json();
      await route.fulfill({ response });
    });

    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByText("Sign in with OTP").click();
    await page.getByText("Want to SignIn with Email").click();

    await page
      .getByRole("textbox", { name: "Enter your registered email" })
      .fill(Email);

    await page.getByRole("button", { name: "Send OTP" }).click();
    await page.waitForResponse("**/api/auth/otp-login*");

    if (otpResponse.success) {
      await expect(page.getByText(/Please Check Your/i)).toBeVisible();
    } else {
      await expect(page.getByText(otpResponse.message)).toBeVisible();
    }
  });

  test("TC_05_Verify forgot password OTP flow using registered email", async ({
    page,
  }) => {
    let forgotOtpResponse;

    await page.route("**/api/auth/forget-password-otp*", async (route) => {
      const response = await route.fetch();
      forgotOtpResponse = await response.json();
      await route.fulfill({ response });
    });

    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByText("Forgot Password?").click();
    await page
      .getByRole("textbox", { name: "Enter your registered email" })
      .fill(Email);

    await page.getByRole("button", { name: "Send OTP" }).click();
    await page.waitForResponse("**/api/auth/forget-password-otp*");

    if (forgotOtpResponse.success) {
      await expect(page.getByText(/Please Check Your/i)).toBeVisible();
    } else {
      await expect(
        page.getByText("We couldn't find any account with that email")
      ).toBeVisible();
    }
  });
});
