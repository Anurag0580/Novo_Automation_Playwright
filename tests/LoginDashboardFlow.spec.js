import { test, expect } from "./fixtures/home-popup.fixture.js";
import { BASE_URL } from "./helpers/envConfig.js";

// Test-scoped variables to share API responses between beforeEach and tests
let capturedUserDetails = null;

// ==================== HELPER FUNCTIONS ====================

/**
 * Normalize text by trimming and converting to lowercase for robust matching.
 */
function normalizeText(value) {
  if (!value) return "";
  return value.toString().trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Click a link on the page using browser-side click to bypass pointer interception.
 */
async function clickLinkByHref(page, href) {
  console.log(`Clicking link with href="${href}" via DOM...`);
  await page.evaluate((targetHref) => {
    const link = document.querySelector(`a[href="${targetHref}"]`);
    if (link) {
      link.click();
    } else {
      throw new Error(`Link with href="${targetHref}" not found in DOM`);
    }
  }, href);
}

// ==================== TEST SUITE ====================

test.describe("Dashboard & Profile API vs UI Validation", () => {
  // Use default desktop viewport
  test.use({
    viewport: { width: 1920, height: 1080 },
  });

  test.beforeEach(async ({ page }) => {
    console.log("Navigating to home page");
    await page.goto(`${BASE_URL}/home`);
    await page.waitForLoadState("domcontentloaded");
    console.log("Homepage loaded");

    // Open login popup
    console.log("Opening login popup");
    const navButton = page
      .getByRole("navigation")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .nth(1);

    await expect(navButton).toBeVisible();
    await navButton.click();
    try {
      await expect(
        page.getByRole("textbox", { name: "Enter your email" }),
      ).toBeVisible({ timeout: 5000 });
    } catch (e) {
      console.log(
        "Login textbox not visible after click, retrying navButton click...",
      );
      await navButton.click();
      await expect(
        page.getByRole("textbox", { name: "Enter your email" }),
      ).toBeVisible({ timeout: 5000 });
    }
    console.log("Login popup opened");

    // Fill credentials
    const email = (process.env.LOGIN_EMAIL || "").trim();
    const password = (process.env.LOGIN_PASSWORD || "").trim();
    await page.getByRole("textbox", { name: "Enter your email" }).fill(email);
    await page
      .getByRole("textbox", { name: "Enter your password" })
      .fill(password);
    await page.waitForTimeout(500); // Let UI settle

    // Set user-details waiter BEFORE clicking Sign In
    console.log("Setting up user-details response waiter");
    const userDetailsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/user/user-details") &&
        response.status() === 200,
      { timeout: 25000 },
    );

    console.log("Submitting login credentials");
    await page.getByRole("button", { name: "Sign In" }).click({ force: true });

    console.log("Waiting for user-details API response...");
    const userDetailsResponse = await userDetailsPromise;
    const userDetailsJson = await userDetailsResponse.json();
    capturedUserDetails = userDetailsJson.data;

    console.log("User details API captured");

    await page.waitForTimeout(2000); // Let the login process settle

    // Open Dashboard
    console.log("Opening Dashboard via profile header menu");
    const profileIcon = page.getByRole("img", { name: "profile", exact: true });
    const heyButton = page.getByRole("button", { name: /Hey,/i });

    if (await profileIcon.isVisible()) {
      await profileIcon.click();
    } else {
      await heyButton.click();
    }

    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.locator("body")).toContainText("Spend Points", {
      timeout: 15000,
    });
    console.log("Dashboard opened");
  });

  test("TC_01 - Verify Dashboard Loyalty Data Against API", async ({
    page,
  }, testInfo) => {
    let uiData = {};
    try {
      console.log("Extracting UI loyalty data...");
      const bodyText = await page.locator("body").innerText();

      // Extract Member ID
      const memberIdMatch = bodyText.match(/NCB0T5ZJ[A-Z0-9]+/i);
      const uiMemberId = memberIdMatch ? memberIdMatch[0].trim() : "";

      // Extract Spend Points
      const spendPointsMatch = bodyText.match(/Spend Points\s*:\s*(\d+)/i);
      const uiSpendPoints = spendPointsMatch
        ? parseInt(spendPointsMatch[1], 10)
        : 0;

      // Extract Tier Points
      const tierPointsMatch = bodyText.match(/Tier Points\s*:\s*(\d+)/i);
      const uiTierPoints = tierPointsMatch
        ? parseInt(tierPointsMatch[1], 10)
        : 0;

      uiData = { uiMemberId, uiSpendPoints, uiTierPoints };

      // Extract Expected API data
      const apiMemberId = capturedUserDetails.loylty_info.LoyaltySessionToken
        ? capturedUserDetails.loylty_info.LoyaltyMember.MemberId
        : "";
      const apiTierPointsObj =
        capturedUserDetails.loylty_info.LoyaltyMember.BalanceList.find(
          (b) => b.BalanceTypeID === "1",
        );
      const apiTierPoints = apiTierPointsObj
        ? apiTierPointsObj.PointsRemaining
        : 0;

      const apiSpendPointsObj =
        capturedUserDetails.loylty_info.LoyaltyMember.BalanceList.find(
          (b) => b.BalanceTypeID === "8",
        );
      const apiSpendPoints = apiSpendPointsObj
        ? apiSpendPointsObj.PointsRemaining
        : 0;

      console.log("API Member ID:", apiMemberId);
      console.log("UI Member ID:", uiMemberId);
      console.log("API Tier Points:", apiTierPoints);
      console.log("UI Tier Points:", uiTierPoints);
      console.log("API Spend Points:", apiSpendPoints);
      console.log("UI Spend Points:", uiSpendPoints);

      // Assertions
      expect(normalizeText(uiMemberId)).toBe(normalizeText(apiMemberId));
      expect(uiTierPoints).toBe(apiTierPoints);
      expect(uiSpendPoints).toBe(apiSpendPoints);

      console.log("Loyalty data validated");
    } catch (error) {
      console.log("❌ Test Failed! Diagnostics:");
      console.log(
        "API Response details:",
        JSON.stringify(capturedUserDetails, null, 2),
      );
      console.log("UI Extracted Values:", JSON.stringify(uiData, null, 2));
      await takeFailureScreenshot(page, testInfo);
      throw error;
    }
  });

  test("TC_02 - Verify Profile Information Against API", async ({
    page,
  }, testInfo) => {
    let uiProfileData = {};

    try {
      console.log("Navigating to Profile tab...");
      await clickLinkByHref(page, "/profile");

      await expect(page.locator("body")).toContainText("Personal Details", {
        timeout: 15000,
      });

      console.log("Profile page loaded. Extracting UI profile information...");

      // First Name
      const firstName = await page
        .locator('input[placeholder*="first name"]')
        .inputValue()
        .catch(() => "");

      // Last Name
      const lastName = await page
        .locator('input[placeholder*="last name"]')
        .inputValue()
        .catch(() => "");

      // Email
      const email = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll("input"));

        for (const input of inputs) {
          if (/\S+@\S+\.\S+/.test(input.value)) {
            return input.value.trim();
          }
        }

        const elements = Array.from(document.querySelectorAll("span, div, p"));

        for (const el of elements) {
          if (
            el.childNodes.length === 1 &&
            el.textContent &&
            /\S+@\S+\.\S+/.test(el.textContent)
          ) {
            return el.textContent.trim();
          }
        }

        return "";
      });

      // Country Code (Separate Validation)
      const countryCode = await page
        .locator('span:text("+974")')
        .textContent()
        .catch(() => "");

      // Contact Number
      const contact = await page
        .locator(
          'input[type="tel"], input[placeholder*="phone"], input[placeholder*="Phone"]',
        )
        .first()
        .inputValue()
        .catch(() => "");

      // DOB Extraction (Stable)
      const dob = await page.evaluate(() => {
        const year = document.querySelector('input[name="year"]')?.value || "";
        const month =
          document.querySelector('input[name="month"]')?.value || "";
        const day = document.querySelector('input[name="day"]')?.value || "";

        // Get visible month specifically from month field only
        const monthInput = document.querySelector('input[name="month"]');
        const monthContainer = monthInput?.closest("div");

        const visibleMonth =
          monthContainer
            ?.querySelector(".css-gfxedy-singleValue")
            ?.textContent?.trim() || "";

        return {
          year,
          month,
          day,
          visibleMonth,
        };
      });

      // Nationality
      const nationality = await page.evaluate(() => {
        const natLabel = Array.from(
          document.querySelectorAll("div, label"),
        ).find(
          (el) => el.textContent && el.textContent.trim() === "Nationality",
        );

        if (!natLabel) return "";

        const parent = natLabel.parentElement;
        if (!parent) return "";

        return (
          parent.innerText
            .split("\n")
            .find(
              (line) => line.trim() !== "Nationality" && line.trim() !== "",
            ) || ""
        );
      });

      // Gender
      const gender = await page.evaluate(() => {
        const maleRadio = document.querySelector(
          'input[value="Male"], input[value="M"]',
        );

        const femaleRadio = document.querySelector(
          'input[value="Female"], input[value="F"]',
        );

        if (maleRadio?.checked) return "Male";
        if (femaleRadio?.checked) return "Female";

        const labels = Array.from(document.querySelectorAll("label"));

        for (const label of labels) {
          if (
            label.innerText.includes("Male") &&
            (label.className.includes("active") ||
              label.className.includes("checked") ||
              label.outerHTML.includes("checked"))
          ) {
            return "Male";
          }

          if (
            label.innerText.includes("Female") &&
            (label.className.includes("active") ||
              label.className.includes("checked") ||
              label.outerHTML.includes("checked"))
          ) {
            return "Female";
          }
        }

        return "";
      });

      // Loyalty Card Number
      const loyaltyCardNumber = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const match = bodyText.match(/\b8000077995\d+\b/);
        return match ? match[0] : "";
      });

      // Store UI Data
      uiProfileData = {
        user_first_name: firstName,
        user_last_name: lastName,
        user_email: email,
        country_code: countryCode,
        user_contact: contact,
        dob,
        nationality,
        gender,
        loyalty_card_number: loyaltyCardNumber,
      };

      console.log("Profile validation started");
      console.log("UI Profile Data:", uiProfileData);

      // Validate First Name
      expect(normalizeText(uiProfileData.user_first_name)).toBe(
        normalizeText(capturedUserDetails.user_first_name),
      );

      // Validate Last Name
      expect(normalizeText(uiProfileData.user_last_name)).toBe(
        normalizeText(capturedUserDetails.user_last_name),
      );

      // Validate Email
      expect(normalizeText(uiProfileData.user_email)).toBe(
        normalizeText(capturedUserDetails.user_email),
      );

      // Validate Country Code
      expect(uiProfileData.country_code.trim()).toBe("+974");

      // Validate Contact Number (Digits only)
      const apiPhoneDigits = capturedUserDetails.user_contact.replace(
        /[^0-9]/g,
        "",
      );

      const uiPhoneDigits = uiProfileData.user_contact.replace(/[^0-9]/g, "");

      expect(apiPhoneDigits).toContain(uiPhoneDigits);

      // Validate DOB
      const apiDob = new Date(capturedUserDetails.user_dob);

      expect(uiProfileData.dob.year).toBe(String(apiDob.getUTCFullYear()));

      expect(Number(uiProfileData.dob.day)).toBe(apiDob.getUTCDate());

      expect(Number(uiProfileData.dob.month)).toBe(apiDob.getUTCMonth() + 1);

      const monthName = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ][apiDob.getUTCMonth()];

      expect(normalizeText(uiProfileData.dob.visibleMonth)).toBe(
        normalizeText(monthName),
      );

      // Validate Nationality
      expect(normalizeText(uiProfileData.nationality)).toBe(
        normalizeText(capturedUserDetails.nationality),
      );

      // Validate Gender
      expect(normalizeText(uiProfileData.gender)).toBe(
        normalizeText(capturedUserDetails.gender),
      );

      // Validate Profile Image
      console.log("Validating Profile Image...");

      const profileImageSrc = capturedUserDetails.profile_picture;

      const profileImages = page.locator("img");
      const count = await profileImages.count();

      let foundTargetImage = false;

      for (let i = 0; i < count; i++) {
        const src = await profileImages.nth(i).getAttribute("src");

        if (src && src.includes(profileImageSrc.split("/").pop())) {
          foundTargetImage = true;
          break;
        }
      }

      expect(foundTargetImage).toBe(true);

      console.log("Profile image validated");
      console.log("Profile validated successfully");
    } catch (error) {
      console.log("❌ Test Failed! Diagnostics:");
      console.log(
        "UI Extracted Values:",
        JSON.stringify(uiProfileData, null, 2),
      );

      await takeFailureScreenshot(page, testInfo);
      throw error;
    }
  });

  test("TC_03 - Verify Saved Cards Against Saved Cards API", async ({
    page,
  }, testInfo) => {
    let apiCards = [];
    let uiCards = [];

    try {
      console.log("Preparing Saved Cards navigation...");

      // Set API waiter before navigation
      console.log("Setting up saved-cards response waiter");
      const savedCardsPromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/payment/dibsy/saved-cards") &&
          response.status() === 200,
        { timeout: 15000 },
      );

      console.log("Clicking Saved Cards link");
      await clickLinkByHref(page, "/saved-cards");

      console.log("Waiting for saved cards API response...");
      const savedCardsResponse = await savedCardsPromise;
      const savedCardsJson = await savedCardsResponse.json();

      apiCards = savedCardsJson.data || [];

      console.log("Saved Cards API captured successfully");

      // Extract UI cards (ONLY from actual card blocks)
      console.log("Extracting UI saved cards...");
      uiCards = await page.evaluate(() => {
        const cards = [];

        const cardBlocks = Array.from(
          document.querySelectorAll(".rounded-\\[25px\\].p-4"),
        );

        cardBlocks.forEach((card) => {
          const cardText =
            card.querySelector(".font-medium")?.textContent?.trim() || "";

          const expiryText =
            card.querySelector(".text-sm")?.textContent?.trim() || "";

          const cardMatch = cardText.match(
            /(visa|mastercard|amex|jcb)\s*[•*·\s-]*\s*(\d{4})/i,
          );

          const expiryMatch = expiryText.match(/(\d{2}\/\d{2})/);

          if (cardMatch && expiryMatch) {
            cards.push({
              scheme: cardMatch[1].toUpperCase(),
              last4: cardMatch[2],
              expiry: expiryMatch[1],
            });
          }
        });

        return cards;
      });

      console.log("UI Saved Cards:", uiCards);

      // ==========================
      // API Duplicate Detection
      // ==========================
      const apiCardCount = {};

      for (const card of apiCards) {
        const key = `${card.cardScheme.toUpperCase()}-${card.cardLast4}-${card.expiry}`;
        apiCardCount[key] = (apiCardCount[key] || 0) + 1;
      }

      for (const [key, count] of Object.entries(apiCardCount)) {
        if (count > 1) {
          console.warn(
            `⚠ WARNING: Duplicate card found in API (${count} occurrences): ${key}`,
          );
        }
      }

      // ==========================
      // UI Duplicate Detection
      // ==========================
      const uiCardCount = {};

      for (const card of uiCards) {
        const key = `${card.scheme}-${card.last4}-${card.expiry}`;
        uiCardCount[key] = (uiCardCount[key] || 0) + 1;
      }

      for (const [key, count] of Object.entries(uiCardCount)) {
        if (count > 1) {
          console.warn(
            `⚠ WARNING: Duplicate card displayed in UI (${count} occurrences): ${key}`,
          );
        }
      }

      // ==========================
      // Validate API cards exist in UI
      // ==========================
      for (const apiCard of apiCards) {
        const apiScheme = apiCard.cardScheme.toUpperCase();
        const apiLast4 = apiCard.cardLast4;
        const apiExpiry = apiCard.expiry;

        const matchedUi = uiCards.find(
          (ui) =>
            ui.scheme === apiScheme &&
            ui.last4 === apiLast4 &&
            ui.expiry === apiExpiry,
        );

        if (!matchedUi) {
          throw new Error(
            `API Card missing from UI: Scheme=${apiScheme}, Last4=${apiLast4}, Expiry=${apiExpiry}`,
          );
        }
      }

      // ==========================
      // Extra UI Card Check
      // ==========================
      for (const uiCard of uiCards) {
        const matchedApi = apiCards.find(
          (api) =>
            api.cardScheme.toUpperCase() === uiCard.scheme &&
            api.cardLast4 === uiCard.last4 &&
            api.expiry === uiCard.expiry,
        );

        if (!matchedApi) {
          console.warn(
            `⚠ WARNING: UI has extra card not present in API: ${uiCard.scheme}-${uiCard.last4}-${uiCard.expiry}`,
          );
        }
      }

      console.log("Saved cards validated successfully");
    } catch (error) {
      console.log("❌ Test Failed! Diagnostics:");
      console.log("API Cards Response:", JSON.stringify(apiCards, null, 2));
      console.log("UI Cards Extracted:", JSON.stringify(uiCards, null, 2));

      await takeFailureScreenshot(page, testInfo);
      throw error;
    }
  });

  test("TC_04 - Verify Upcoming Bookings Against Upcoming Booking API", async ({
    page,
  }, testInfo) => {
    let apiUpcoming = [];
    let uiUpcoming = [];
    try {
      console.log("Preparing Upcoming Bookings navigation...");

      // Set upcoming bookings waiter BEFORE click
      console.log("Setting up upcoming-bookings response waiter");
      const upcomingPromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/booking/upcoming-bookings") &&
          response.status() === 200,
        { timeout: 15000 },
      );

      console.log("Clicking Booking History link");
      await clickLinkByHref(page, "/bookinghistory");

      console.log("Waiting for upcoming bookings API response...");
      const upcomingResponse = await upcomingPromise;
      const upcomingJson = await upcomingResponse.json();
      apiUpcoming = upcomingJson.data || [];

      console.log("Upcoming bookings validation started");
      console.log("Upcoming API:", apiUpcoming);

      // If empty, validate UI reflects the same
      if (apiUpcoming.length === 0) {
        console.log("No upcoming bookings found, verifying empty state in UI");
        await expect(page.locator("body")).toContainText(
          "No upcoming bookings",
        );
        return;
      }

      // Extract UI bookings
      uiUpcoming = await page.evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll("div.hover\\:cursor-pointer"),
        );
        const results = [];
        cards.forEach((card) => {
          const text = card.textContent || "";
          const matches = [
            ...text.matchAll(/Booking\s*ID\s*::?\s*([A-Z0-9]+)/gi),
          ];
          if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            let bookingId = lastMatch[1].trim();
            if (bookingId.length > 7) {
              bookingId = bookingId.substring(0, 7);
            }
            results.push({ bookingId, text });
          }
        });
        return results;
      });

      console.log("Upcoming UI:", uiUpcoming);

      // Validate first 2-3 bookings
      const limit = Math.min(3, apiUpcoming.length);
      for (let i = 0; i < limit; i++) {
        const apiBooking = apiUpcoming[i];
        const bookingId = apiBooking.vista_booking_id;
        const movieName = apiBooking.movie
          ? apiBooking.movie.movie_title
          : "YOUR MEAL";
        const cinemaName = apiBooking.cinema ? apiBooking.cinema.name : "";
        const showDate = apiBooking.show_date;

        console.log(`Validating upcoming booking ID: ${bookingId}`);

        // Find match in UI by booking ID
        const uiMatch = uiUpcoming.find((ui) => ui.bookingId === bookingId);
        if (!uiMatch) {
          throw new Error(`Upcoming Booking ID ${bookingId} not found in UI`);
        }

        expect(normalizeText(uiMatch.text)).toContain(normalizeText(movieName));
        expect(normalizeText(uiMatch.text)).toContain(
          normalizeText(cinemaName),
        );
        expect(normalizeText(uiMatch.text)).toContain(normalizeText(showDate));
      }

      console.log("Upcoming bookings validated");
    } catch (error) {
      console.log("❌ Test Failed! Diagnostics:");
      console.log(
        "API Upcoming Response:",
        JSON.stringify(apiUpcoming, null, 2),
      );
      console.log(
        "UI Upcoming Extracted:",
        JSON.stringify(uiUpcoming, null, 2),
      );
      await takeFailureScreenshot(page, testInfo);
      throw error;
    }
  });

  test("TC_05 - Verify Past Bookings Against Booking History API", async ({
    page,
  }, testInfo) => {
    let apiPast = [];
    let uiPast = [];
    try {
      console.log("Preparing Past Bookings navigation...");

      // 1. Go to Booking History first
      const upcomingPromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/booking/upcoming-bookings") &&
          response.status() === 200,
        { timeout: 15000 },
      );
      await clickLinkByHref(page, "/bookinghistory");
      await upcomingPromise;

      // 2. Click Past Bookings tab, set waiter BEFORE click
      console.log("Setting up booking-history response waiter");
      const pastPromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/user/booking-history") &&
          response.status() === 200,
        { timeout: 15000 },
      );

      console.log("Clicking Past Bookings tab");
      await page
        .locator(
          "div:has-text('Past Bookings'), button:has-text('Past Bookings')",
        )
        .first()
        .click();

      console.log("Waiting for past bookings API response...");
      const pastResponse = await pastPromise;
      const pastJson = await pastResponse.json();
      apiPast = pastJson.data || [];

      await page.waitForTimeout(3000); // Settle UI rendering

      // Extract UI bookings
      console.log("Extracting UI past bookings...");
      uiPast = await page.evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll("div.hover\\:cursor-pointer"),
        );
        const results = [];
        cards.forEach((card) => {
          const text = card.textContent || "";
          const matches = [
            ...text.matchAll(/Booking\s*ID\s*::?\s*([A-Z0-9]+)/gi),
          ];
          if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            let bookingId = lastMatch[1].trim();
            if (bookingId.length > 7) {
              bookingId = bookingId.substring(0, 7);
            }
            results.push({ bookingId, text });
          }
        });
        return results;
      });

      console.log("Past bookings validation started");
      console.log("Past API count:", apiPast.length);
      console.log("Past UI count:", uiPast.length);
      console.log("Past Bookings Data for first 5 bookings:", apiPast.slice(0, 5));
      console.log("Past UI Data for first 5 bookings:", uiPast.slice(0, 5));

      // Validate first 2-3 bookings
      const limit = Math.min(3, apiPast.length);
      for (let i = 0; i < limit; i++) {
        const apiBooking = apiPast[i];
        const bookingId = apiBooking.vista_booking_id;
        const movieName = apiBooking.movie
          ? apiBooking.movie.movie_title
          : "YOUR MEAL";
        const cinemaName = apiBooking.cinema ? apiBooking.cinema.name : "";
        const showDate = apiBooking.show_date;

        console.log(`Validating past booking ID: ${bookingId}`);

        // Find match in UI by booking ID
        const uiMatch = uiPast.find((ui) => ui.bookingId === bookingId);
        if (!uiMatch) {
          throw new Error(`Past Booking ID ${bookingId} not found in UI`);
        }

        // Duplicate movie title log if repeated
        const duplicates = apiPast.filter(
          (b) =>
            b.movie &&
            movieName !== "YOUR MEAL" &&
            b.movie.movie_title === movieName,
        );
        if (duplicates.length > 1) {
          console.log(
            `Duplicate movie found in past bookings ${movieName}, comparing booking IDs`,
          );
        }

        expect(normalizeText(uiMatch.text)).toContain(normalizeText(movieName));
        expect(normalizeText(uiMatch.text)).toContain(
          normalizeText(cinemaName),
        );
        expect(normalizeText(uiMatch.text)).toContain(normalizeText(showDate));
      }

      console.log("Past bookings validated");
    } catch (error) {
      console.log("❌ Test Failed! Diagnostics:");
      console.log("Past API Response:", JSON.stringify(apiPast, null, 2));
      console.log("UI Past Extracted:", JSON.stringify(uiPast, null, 2));
      await takeFailureScreenshot(page, testInfo);
      throw error;
    }
  });
});
