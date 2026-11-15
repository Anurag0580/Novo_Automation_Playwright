import { test, expect } from "./fixtures/home-popup.fixture.js";
import { PROD_FRONTEND_URL, REAL_DOMAIN_URL } from "./helpers/envConfig.js";

test.describe("Landing Page – Country Selection and Automatic Redirect Validation", () => {
  test("TC_01 – Verify Automatic Redirect from Real Domain to Qatar Frontend", async ({
    page,
  }) => {
    await page.goto(`${REAL_DOMAIN_URL}/`);

    await page.waitForURL(
      (url) => url.origin === new URL(PROD_FRONTEND_URL).origin,
      { timeout: 30000 }
    );

    const sanitizedFrontendUrl = PROD_FRONTEND_URL.replace(/\/+$/, "");
    await expect(page).toHaveURL(
      new RegExp(`^${sanitizedFrontendUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );

    await page.waitForLoadState("domcontentloaded");

    console.log("🌍 Automatically redirected to Qatar frontend");

    await expect(
      page.getByRole("navigation").getByRole("img", { name: "Logo" })
    ).toBeVisible();
  });
});
