import { test, expect } from "./fixtures/home-popup.fixture.js";
import {
  BASE_URL,
  COUNTRY_NAME,
} from "./helpers/envConfig.js";
const REAL_DOMAIN_URL = process.env.REAL_DOMAIN_URL;

if (!REAL_DOMAIN_URL) {
  throw new Error(
    "❌ REAL_DOMAIN_URL missing in env"
  );
}

test.describe("Landing Page – Country Selection and Language Toggle Validation", () => {
  test("TC_01 – Verify Country Selection and Language Toggle on Landing Page", async ({
    page,
  }) => {
    await page.goto(`${REAL_DOMAIN_URL}/`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("img", { name: "logo" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Please select your Country" })
    ).toBeVisible();

    const qatarDiv = page.locator("div").filter({ hasText: /^QATAR$/ });
    const uaeDiv = page.locator("div").filter({ hasText: /^UAE$/ });

    await expect(qatarDiv).toBeVisible();
    await expect(uaeDiv).toBeVisible();

    await page.getByRole("button", { name: "العربية" }).click();

    await expect(page.getByText("قطر")).toBeVisible();
    await expect(page.getByText("الإمارات")).toBeVisible();

    await page.getByRole("button", { name: "ENG" }).click();

    const expectedBaseUrl = new URL(BASE_URL);
    const selectedCountryDiv = COUNTRY_NAME === "UAE" ? uaeDiv : qatarDiv;

    await Promise.all([
      page.waitForURL(
        (url) => url.origin === expectedBaseUrl.origin,
        { timeout: 10000 }
      ),
      selectedCountryDiv.getByRole("button").click(),
    ]);

    expect(new URL(page.url()).origin).toBe(expectedBaseUrl.origin);
  });
});
