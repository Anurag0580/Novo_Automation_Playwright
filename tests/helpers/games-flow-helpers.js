import { expect } from "@playwright/test";

export async function captureLandingBannerFileName(page, gameName, baseUrl) {
  const landingBannerImg = page.getByRole("img", { name: gameName }).first();
  await expect(landingBannerImg).toBeVisible();
  const landingBannerSrc = await landingBannerImg.getAttribute("src");
  expect(landingBannerSrc).toBeTruthy();
  return new URL(landingBannerSrc, baseUrl).pathname.split("/").pop();
}

export async function verifyBannerMatchesLanding(page, landingBannerFileName, baseUrl) {
  const bannerImg = page.getByRole("img", { name: "banner" }).first();
  await expect(bannerImg).toBeVisible();
  const bannerSrc = await bannerImg.getAttribute("src");
  expect(bannerSrc).toBeTruthy();
  const bannerFileName = new URL(bannerSrc, baseUrl).pathname.split("/").pop();
  expect(bannerFileName).toBe(landingBannerFileName);
}

export async function continueToFnbAndGetConcessionsResponse(page, loginAndCaptureTokenGames) {
  const concessionsResponsePromise = page.waitForResponse(
    (response) =>
      /\/api\/booking\/concessions\/cinema\/\d+/.test(response.url()) &&
      !response.url().includes("/trending") &&
      response.request().method() === "GET",
  );

  await page.getByRole("button", { name: "Continue" }).click();
  await loginAndCaptureTokenGames(page);

  const concessionsResponse = await concessionsResponsePromise;
  expect(concessionsResponse.ok()).toBeTruthy();
  return concessionsResponse;
}

export async function getBookingDetailsPanel(page, gameName, expectedCinemaName) {
  await expect(page.getByText("Booking Details")).toBeVisible();
  const bookingDetailsPanel = page.locator("div").filter({
    hasText: expectedCinemaName
      ? new RegExp(`Booking Details\\s*${gameName}\\s*${expectedCinemaName}`)
      : new RegExp(`Booking Details\\s*${gameName}`),
  }).first();
  await expect(bookingDetailsPanel).toBeVisible();
  return bookingDetailsPanel;
}

export async function continueToCheckoutAndGetOnlyConcessionData(page, bookingDetailsPanel) {
  const onlyConcessionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/booking/concessions/only-concession") &&
      response.request().method() === "POST",
  );

  const checkoutContinueBtn = bookingDetailsPanel.getByRole("button", { name: "Continue" }).first();
  await expect(checkoutContinueBtn).toBeVisible();

  await Promise.all([
    checkoutContinueBtn.click(),
    page.waitForURL(/\/games\/payment\/[a-zA-Z0-9-]+/, { timeout: 30000 }),
  ]);

  const onlyConcessionResponse = await onlyConcessionResponsePromise;
  expect(onlyConcessionResponse.ok()).toBeTruthy();
  const onlyConcessionData = await onlyConcessionResponse.json();

  const reservationId = onlyConcessionData?.data?.reservationId;
  expect(reservationId).toBeTruthy();
  await expect(page).toHaveURL(new RegExp(`/games/payment/${reservationId}$`));

  return onlyConcessionData;
}

export function getOnlyConcessionAmounts(onlyConcessionData) {
  const apiTicketAmount = (onlyConcessionData?.data?.event_price_in_cents || 0) / 100;
  const apiFnbAmount = (onlyConcessionData?.data?.concession_price_in_cents || 0) / 100;
  const apiTotalAmount = (onlyConcessionData?.data?.total_price_in_cents || 0) / 100;
  return { apiTicketAmount, apiFnbAmount, apiTotalAmount };
}

export async function getCheckoutPanel(page) {
  await expect(page.getByText("Booking Details").first()).toBeVisible();
  const checkoutPanel = page.locator("div").filter({ hasText: /Booking Details/ }).first();
  await expect(checkoutPanel).toBeVisible();
  return checkoutPanel;
}

export async function verifyTicketAndFnbInCheckout(checkoutPanel, apiTicketAmount, apiFnbAmount) {
  await expect(checkoutPanel.getByText("Ticket").first()).toBeVisible();
  await expect(checkoutPanel.getByText(`+ QAR ${Math.round(apiTicketAmount)}`).first()).toBeVisible();

  if (Math.round(apiFnbAmount) > 0) {
    await expect(checkoutPanel.getByText("F&B").first()).toBeVisible();
    await expect(checkoutPanel.getByText(`+ QAR ${Math.round(apiFnbAmount)}`).first()).toBeVisible();
  } else {
    await expect(checkoutPanel.getByText("F&B").first()).toHaveCount(0);
  }
}

export async function verifyTotalInCheckout(checkoutPanel, apiTotalAmount) {
  await expect(checkoutPanel.getByText("Total Price").first()).toBeVisible();
  await expect(checkoutPanel.getByText(`QAR ${Math.round(apiTotalAmount)}`).first()).toBeVisible();
}

export async function verifyConcessionItemsInCheckout(checkoutPanel, concessionItemData, gameName, includeSocks) {
  for (const concessionItem of concessionItemData || []) {
    const concessionName = (concessionItem?.concession_name || "").trim();
    if (/voucher/i.test(concessionName)) {
      await expect(
        checkoutPanel
          .locator("span:visible")
          .filter({ hasText: new RegExp(`^${gameName}$`) })
          .first(),
      ).toBeVisible();
      continue;
    }
    if (includeSocks && /^socks$/i.test(concessionName)) {
      await expect(checkoutPanel.getByText(/Socks:?/i).first()).toBeVisible();
      continue;
    }
    await expect(checkoutPanel.getByText(concessionName).first()).toBeVisible();
  }
}
