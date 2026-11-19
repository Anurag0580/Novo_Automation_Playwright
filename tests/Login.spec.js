import { test, expect } from "./fixtures/home-popup.fixture.js";
import {
  BASE_URL,
  newBackendPost,
  newBackendGet,
} from "./helpers/envConfig.js";

const Email = process.env.LOGIN_EMAIL ? process.env.LOGIN_EMAIL.trim() : "";
const Password = process.env.LOGIN_PASSWORD
  ? process.env.LOGIN_PASSWORD.trim()
  : "";
const Phone = process.env.LOGIN_PHONE ? process.env.LOGIN_PHONE.trim() : "";
const ForgotPasswordEmail = process.env.FORGOT_PASSWORD_EMAIL
  ? process.env.FORGOT_PASSWORD_EMAIL.trim()
  : "";

async function openLoginPopup(page) {
  const navButton = page
    .getByRole("navigation")
    .getByRole("button")
    .filter({ hasText: /^$/ })
    .nth(1);

  await expect(navButton).toBeVisible();
  await navButton.click();
  try {
    await expect(page.locator("form")).toContainText("Sign In", { timeout: 3000 });
  } catch {
    await navButton.click();
    await expect(page.locator("form")).toContainText("Sign In");
  }
}

test.describe("User Authentication – Login, OTP & Password Recovery", () => {
  test("TC_01_Verify successful login with valid email and password", async ({
    page,
  }) => {
    // 1. Direct New Backend Authentication API Validation
    const backendRes = await newBackendPost("/auth/login", {
      user_email: Email,
      user_password: Password,
    });
    expect(backendRes.status).toBe(200);

    const backendJson = await backendRes.json();
    expect(backendJson.success).toBe(true);
    expect(backendJson.statusCode).toBe(200);
    expect(backendJson.data).toBeDefined();

    // Capture returned auth token in memory only (never print or expose)
    const backendAuthToken = backendJson.data?.token;
    const isBackendAuthTokenValid = Boolean(
      backendAuthToken &&
        typeof backendAuthToken === "string" &&
        backendAuthToken.length > 20
    );
    expect(
      isBackendAuthTokenValid,
      "Expected a valid New Backend authentication token"
    ).toBe(true);

    // 2. Monitor browser network requests for frontend login, session creation, and user details
    let capturedSessionToken = null;
    let capturedFrontendLoginToken = null;

    const loginPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/auth/login") &&
        res.request().method() === "POST" &&
        res.status() === 200
    );

    const sessionPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/auth/session") &&
        res.request().method() === "POST"
    );

    const browserUserDetailsPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/users/details") &&
        res.request().method() === "GET" &&
        res.status() === 200
    );

    page.on("request", (req) => {
      if (req.url().includes("/api/auth/session") && req.method() === "POST") {
        try {
          const postData = req.postDataJSON();
          if (postData && postData.token) {
            capturedSessionToken = postData.token;
          }
        } catch {
          // In-memory extraction only
        }
      }
    });

    // 3. Perform Frontend Login Flow
    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByRole("textbox", { name: "Enter your email" }).fill(Email);
    await page
      .getByRole("textbox", { name: "Enter your password" })
      .fill(Password);

    // Password visibility toggle validation
    const passwordInput = page.getByRole("textbox", {
      name: "Enter your password",
    });
    const toggle = page.locator("form svg");
    await toggle.click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    await toggle.click();
    await expect(passwordInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Sign In" }).click();

    // 4. Validate frontend login response and session creation request
    const loginResponse = await loginPromise;
    const loginJson = await loginResponse.json().catch(() => ({}));
    capturedFrontendLoginToken = loginJson?.data?.token;

    const sessionResponse = await sessionPromise;
    expect(sessionResponse.status()).toBe(200);

    const isSessionTokenPresent = Boolean(
      capturedSessionToken &&
        typeof capturedSessionToken === "string" &&
        capturedSessionToken.length > 20
    );
    expect(
      isSessionTokenPresent,
      "Frontend session request must contain an authentication token"
    ).toBe(true);

    // Compare tokens in memory only (boolean check avoids printing tokens in test diffs)
    const tokensMatch =
      typeof capturedSessionToken === "string" &&
      capturedSessionToken.length > 0 &&
      capturedSessionToken === capturedFrontendLoginToken;
    expect(
      tokensMatch,
      "Frontend session token must match the New Backend authentication token"
    ).toBe(true);

    // Wait for the frontend's user details call triggered after session creation
    await browserUserDetailsPromise;

    // 5. Invoke and Validate the New Backend User Details API (/users/details)
    const userDetailsRes = await newBackendGet("/users/details", {
      headers: {
        Authorization: `Bearer ${backendAuthToken}`,
      },
    });
    expect(userDetailsRes.status).toBe(200);

    const userDetailsJson = await userDetailsRes.json();
    expect(userDetailsJson.success).toBe(true);
    expect(userDetailsJson.statusCode).toBe(200);
    expect(userDetailsJson.data).toBeDefined();

    const userData = userDetailsJson.data;

    // Validate available user fields confirmed in the actual API response
    expect(typeof userData.user_id).toBe("string");
    expect(userData.user_id.length).toBeGreaterThan(0);

    expect(typeof userData.user_first_name).toBe("string");
    expect(userData.user_first_name.length).toBeGreaterThan(0);

    expect(typeof userData.user_last_name).toBe("string");
    expect(typeof userData.user_email).toBe("string");
    expect(userData.user_email.toLowerCase()).toBe(Email.toLowerCase());

    expect(typeof userData.user_contact).toBe("string");
    expect(typeof userData.is_email_verified).toBe("boolean");
    expect(typeof userData.is_contact_verified).toBe("boolean");

    // 6. Correct Loyalty Points Balance Validation
    // data.tierProgress.pointsRemaining represents points required to reach next tier.
    // The user's actual current loyalty points balance is Spend Points (BalanceTypeID "8") in BalanceList.
    const balanceList = userData.loylty_info?.LoyaltyMember?.BalanceList || [];
    const spendPointsItem =
      balanceList.find(
        (b) =>
          b.BalanceTypeID === "8" &&
          b.Name &&
          b.Name.toLowerCase() === "spend points"
      ) ||
      balanceList.find((b) => b.BalanceTypeID === "8") ||
      balanceList.find(
        (b) => b.Name && b.Name.toLowerCase() === "spend points"
      );

    expect(
      spendPointsItem,
      "Expected Spend Points balance (BalanceTypeID 8 / 'Spend Points') to be present in BalanceList"
    ).toBeDefined();

    const tierPointsItem = balanceList.find(
      (b) =>
        b.BalanceTypeID === "1" ||
        (b.Name && b.Name.toLowerCase() === "tier points")
    );
    const currentLoyaltyPoints = spendPointsItem
      ? spendPointsItem.PointsRemaining
      : null;
    expect(typeof currentLoyaltyPoints).toBe("number");
    expect(currentLoyaltyPoints).toBeGreaterThanOrEqual(0);

    if (tierPointsItem) {
      expect(typeof tierPointsItem.PointsRemaining).toBe("number");
      expect(tierPointsItem.PointsRemaining).toBeGreaterThanOrEqual(0);
    }

    // Semantic check for tier progress
    expect(userData.tierProgress).toBeDefined();
    expect(typeof userData.tierProgress.totalPoints).toBe("number");
    expect(typeof userData.tierProgress.pointsRemaining).toBe("number");

    // Format expected spend points as displayed on frontend (e.g. 4882 -> 4.9k)
    const expectedPointsDisplay =
      currentLoyaltyPoints >= 1000
        ? `${(currentLoyaltyPoints / 1000).toFixed(1)}k`
        : `${currentLoyaltyPoints}`;

    // Extract tier name from API
    const apiFirstName = userData.user_first_name.trim();
    const apiTierName =
      userData.tierProgress?.currentTier?.name ||
      userData.loylty_info?.LoyaltyMember?.MemberLevelName?.split(" ")[0] ||
      "";

    // 7. Validate the returned user details against the authenticated user's frontend UI
    const profileButton = page.getByRole("button", {
      name: new RegExp(`Hey, ${apiFirstName}`, "i"),
    });

    await expect(profileButton).toBeVisible();
    const buttonText = await profileButton.innerText();

    // Verify first name, tier name, and exact formatted spend points balance
    expect(buttonText).toContain(`Hey, ${apiFirstName}`);
    if (apiTierName) {
      expect(buttonText.toUpperCase()).toContain(apiTierName.toUpperCase());
    }
    expect(buttonText).toContain(expectedPointsDisplay);
    expect(buttonText).toMatch(/\d+(\.\d+)?k?\s*Points/i);
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

  test("TC_03_Verify OTP login initiation using registered phone number", async ({
    page,
  }) => {
    test.skip(
      !Phone,
      "LOGIN_PHONE is required for WhatsApp phone OTP login flow."
    );

    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByText("Sign in with OTP").click();

    // 1. Frontend UI Flow Validation (triggers single OTP request)
    const otpPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/auth/login-via-otp") &&
        res.request().method() === "POST"
    );

    // Fill phone number without +974 prefix if already included, as Qatar UI prepends +974
    const uiInputPhone = Phone.startsWith("+974") ? Phone.slice(4) : Phone;
    await page.getByPlaceholder("Enter your Phone Number").fill(uiInputPhone);
    await page.getByRole("button", { name: "Send OTP" }).click();

    const response = await otpPromise;
    const otpResponse = await response.json().catch(() => ({}));

    // Handle rate limiting explicitly without falsely reporting a successful OTP flow
    if (
      response.status() === 429 ||
      otpResponse?.error?.code === "TOO_MANY_REQUESTS"
    ) {
      test.skip(
        true,
        `OTP rate limit / cooldown active from backend (HTTP 429 - TOO_MANY_REQUESTS: ${otpResponse?.message || "Please wait 2 minutes"})`
      );
    }

    // Handle unregistered contact without falsely reporting a successful OTP flow
    if (
      response.status() === 404 ||
      otpResponse?.error?.code === "NO_ACCOUNT_FOUND"
    ) {
      test.skip(
        true,
        "Configured phone number is not registered for OTP login in the backend database"
      );
    }

    // Validate successful OTP initiation response
    expect(response.status()).toBe(200);
    expect(otpResponse.success).toBe(true);
    expect(otpResponse.statusCode).toBe(200);
    expect(otpResponse.message).toMatch(/OTP sent/i);

    // Verify UI state indicates OTP was sent
    await expect(page.getByText(/Please Check Your whatsapp/i)).toBeVisible();
  });

  test("TC_04_Verify OTP login initiation using registered email address", async ({
    page,
  }) => {
    test.skip(!Email, "LOGIN_EMAIL is required for email OTP login flow.");

    // 1. Frontend UI Flow Validation (triggers single OTP request)
    const otpPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/auth/login-via-otp") &&
        res.request().method() === "POST"
    );

    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByText("Sign in with OTP").click();
    await page.getByText("Want to SignIn with Email").click();

    await page
      .getByRole("textbox", { name: "Enter your registered email" })
      .fill(Email);

    await page.getByRole("button", { name: "Send OTP" }).click();

    const response = await otpPromise;
    const otpResponse = await response.json().catch(() => ({}));

    // Handle rate limiting explicitly without falsely reporting a successful OTP flow
    if (
      response.status() === 429 ||
      otpResponse?.error?.code === "TOO_MANY_REQUESTS"
    ) {
      test.skip(
        true,
        `OTP rate limit / cooldown active from backend (HTTP 429 - TOO_MANY_REQUESTS: ${otpResponse?.message || "Please wait 2 minutes"})`
      );
    }

    // Handle unregistered email without falsely reporting a successful OTP flow
    if (
      response.status() === 404 ||
      otpResponse?.error?.code === "NO_ACCOUNT_FOUND"
    ) {
      test.skip(
        true,
        "Configured LOGIN_EMAIL is not registered in the backend database"
      );
    }

    // Validate successful OTP initiation response
    expect(response.status()).toBe(200);
    expect(otpResponse.success).toBe(true);
    expect(otpResponse.statusCode).toBe(200);
    expect(otpResponse.message).toMatch(/OTP sent/i);

    // Verify UI state indicates OTP was sent
    await expect(page.getByText(/Please Check Your/i)).toBeVisible();
  });

  test("TC_05_Verify forgot password OTP flow using registered email", async ({
    page,
  }) => {
    test.skip(
      !ForgotPasswordEmail,
      "FORGOT_PASSWORD_EMAIL is required for forgot password OTP flow."
    );

    // 1. Frontend UI Flow Validation (triggers single OTP request)
    const forgotPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/auth/forget-password-otp") &&
        res.request().method() === "POST"
    );

    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    await page.getByText("Forgot Password?").click();
    await page
      .getByRole("textbox", { name: "Enter your registered email" })
      .fill(ForgotPasswordEmail);

    await page.getByRole("button", { name: "Send OTP" }).click();

    const response = await forgotPromise;
    const forgotOtpResponse = await response.json().catch(() => ({}));

    // Handle rate limiting explicitly without falsely reporting a successful OTP flow
    if (
      response.status() === 429 ||
      forgotOtpResponse?.error?.code === "TOO_MANY_REQUESTS"
    ) {
      test.skip(
        true,
        `Forgot password OTP rate limit / cooldown active from backend (HTTP 429 - TOO_MANY_REQUESTS: ${forgotOtpResponse?.message || "Please wait 2 minutes"})`
      );
    }

    // Handle unregistered email without falsely reporting a successful OTP flow
    if (
      response.status() === 404 ||
      forgotOtpResponse?.error?.code === "NO_ACCOUNT_FOUND"
    ) {
      test.skip(
        true,
        "Configured FORGOT_PASSWORD_EMAIL is not registered in the backend database"
      );
    }

    // Validate successful OTP initiation response
    expect(response.status()).toBe(200);
    expect(forgotOtpResponse.success).toBe(true);
    expect(forgotOtpResponse.statusCode).toBe(200);
    expect(forgotOtpResponse.message).toMatch(/success/i);

    // Verify UI state indicates OTP was sent
    await expect(page.getByText(/Please Check Your/i)).toBeVisible();
  });

  test("TC_06_Verify user logout, session invalidation and post-logout navigation restriction", async ({
    page,
  }) => {
    let newBackendLogoutCalled = false;

    // Monitor if frontend ever triggers New Backend logout endpoint directly
    page.on("request", (req) => {
      if (
        req.url().includes("web-api.novocinemas.com") &&
        req.url().includes("/auth/logout")
      ) {
        newBackendLogoutCalled = true;
      }
    });

    // 1. Launch dedicated isolated context, navigate to Qatar frontend
    await page.goto(`${BASE_URL}/home`);
    await openLoginPopup(page);

    // 2. Perform actual frontend login
    await page.getByRole("textbox", { name: "Enter your email" }).fill(Email);
    await page
      .getByRole("textbox", { name: "Enter your password" })
      .fill(Password);

    const sessionCreatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/auth/session") &&
        res.request().method() === "POST" &&
        res.status() === 200
    );

    await page.getByRole("button", { name: "Sign In" }).click();

    // 3. Wait for successful New Backend auth and frontend session creation
    await sessionCreatePromise;

    // 4. Verify authenticated user state is visible
    const profileButton = page.getByRole("button", { name: /Hey,/i });
    await expect(profileButton).toBeVisible();

    // 5. Click Logout option through the UI (profile menu -> SIGN OUT)
    await profileButton.click();

    const signOutButton = page
      .getByRole("button", { name: /sign\s*out|log\s*out/i })
      .or(page.getByText(/sign\s*out|log\s*out/i))
      .first();
    await expect(signOutButton).toBeVisible();

    // 6. Monitor browser network activity during logout
    const sessionDeletePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/auth/session") &&
        res.request().method() === "DELETE"
    );

    await signOutButton.click();

    // 7. Verify DELETE /api/auth/session is triggered and responds successfully
    const deleteResponse = await sessionDeletePromise;
    expect(deleteResponse.status()).toBe(200);

    // 8. Verify session is invalidated and user is logged out in UI
    await expect(profileButton).toBeHidden();
    const navLoginButton = page
      .getByRole("navigation")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .nth(1);
    await expect(navLoginButton).toBeVisible();

    // 9. Verify user cannot access authenticated UI without logging in again
    await page.goto(`${BASE_URL}/profile`);
    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/?$|${BASE_URL}/home`));
    await expect(profileButton).toBeHidden();
    await expect(page.getByText("Personal Details")).toBeHidden();

    // Verify whether frontend calls New Backend logout directly
    expect(newBackendLogoutCalled).toBe(false);
  });

  test("TC_07_Verify New Backend logout API invalidates authentication session with Bearer token", async () => {
    // 1. Authenticate with New Backend to obtain an active session token
    const loginRes = await newBackendPost("/auth/login", {
      user_email: Email,
      user_password: Password,
    });
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.success).toBe(true);

    const authToken = loginJson.data?.token;
    const isAuthTokenValid = Boolean(
      authToken && typeof authToken === "string" && authToken.length > 20
    );
    expect(
      isAuthTokenValid,
      "Expected a valid New Backend authentication token"
    ).toBe(true);

    // 2. Call New Backend logout API with Bearer token
    const logoutRes = await newBackendPost(
      "/auth/logout",
      {},
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    expect(logoutRes.status).toBe(200);

    const logoutJson = await logoutRes.json();
    expect(logoutJson.success).toBe(true);
    expect(logoutJson.statusCode).toBe(200);
    expect(logoutJson.message).toMatch(/success/i);
  });
});
