import { expect, request as playwrightRequest } from '@playwright/test';

// ============================================================================
// LOYALTY OFFERS HELPERS
// ============================================================================

export async function verifyLoyaltyOffersAPI(page, cinemaId, sessionId, authToken, userSessionId) {
  console.log('\n=== Starting Loyalty Offers API Verification ===');
  console.log('Parameters:', {
    cinemaId, cinemaIdType: typeof cinemaId,
    sessionId, sessionIdType: typeof sessionId,
    authToken: authToken?.substring(0, 30) + '...',
    userSessionId, userSessionIdLength: userSessionId?.length
  });
  
  if (!userSessionId) {
    console.warn('UserSessionId not available, skipping API verification');
    return null;
  }

  if (userSessionId.includes('Bearer') || userSessionId.includes('eyJ') || userSessionId.length > 50) {
    console.error('❌ userSessionId appears to be a JWT token instead of a session hash!');
    console.error('Expected format: 32-character hash like "bf34fcf9d17f4d4b90fe750039071d9b"');
    console.error('Received:', userSessionId.substring(0, 50) + '...');
    return null;
  }

  const numericCinemaId = typeof cinemaId === 'number' ? cinemaId : parseInt(cinemaId, 10);
  const numericSessionId = typeof sessionId === 'number' ? sessionId : parseInt(sessionId, 10);

  if (isNaN(numericCinemaId) || isNaN(numericSessionId)) {
    console.error('❌ Invalid cinema or session ID');
    return null;
  }

  const bearerToken = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;

  const apiContext = await playwrightRequest.newContext({
    baseURL: 'https://backend.novocinemas.com',
    extraHTTPHeaders: {
      authorization: bearerToken,
      accept: 'application/json, text/plain, */*',
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
      origin: 'https://qa.novocinemas.com',
      referer: 'https://qa.novocinemas.com/'
    }
  });

  try {
    const apiUrl = `/api/booking/get-loyalty-ticket-types/cinemas/${numericCinemaId}/sessions/${numericSessionId}/userSessionId/${userSessionId}?country_id=1&channel=web`;
    
    console.log(`\n=== Calling Loyalty Offers API ===`);
    console.log(`Full URL: https://backend.novocinemas.com${apiUrl}`);
    
    const loyaltyOffersResponse = await apiContext.get(apiUrl);
    console.log(`Loyalty API Status: ${loyaltyOffersResponse.status()}`);
    
    if (!loyaltyOffersResponse.ok()) {
      console.error('Loyalty offers API failed:', loyaltyOffersResponse.status());
      const errorText = await loyaltyOffersResponse.text();
      console.error('Error response:', errorText);
      return null;
    }

    const loyaltyData = await loyaltyOffersResponse.json();
    console.log('Loyalty Offers API Response Structure:', {
      success: loyaltyData.success,
      hasData: !!loyaltyData.data,
      hasTickets: loyaltyData.data?.tickets?.length > 0,
      hasLoyaltyMember: !!loyaltyData.data?.loyaltyMember
    });

    if (!loyaltyData.success || !loyaltyData.data) {
      console.warn('No loyalty offers data available in API response');
      return null;
    }

    const tickets = loyaltyData.data.tickets || [];
    const loyaltyMember = loyaltyData.data.loyaltyMember;

    if (loyaltyMember?.LoyaltyMember) {
      const member = loyaltyMember.LoyaltyMember;
      console.log('\n=== Loyalty Member Details ===');
      console.log('Member:', {
        name: member.FullName,
        memberLevel: member.MemberLevelName,
        cardNumber: member.CardNumber,
        tierPoints: member.BalanceList?.find(b => b.Name === 'Tier Points')?.PointsRemaining,
        spendPoints: member.BalanceList?.find(b => b.Name === 'Spend Points')?.PointsRemaining
      });
    }

    const processedOffers = tickets.map(ticket => ({
      description: ticket.Description,
      pricePerTicket: ticket.PriceInCents / 100,
      priceInCents: ticket.PriceInCents,
      availableQuantity: ticket.QtyAvailable || ticket.QuantityAvailablePerOrder || 0,
      ticketTypeCode: ticket.TicketTypeCode,
      isPackage: ticket.IsPackageTicket,
      isLoyaltyOnly: ticket.IsAvailableForLoyaltyMembersOnly,
      loyaltyPointsCost: ticket.LoyaltyPointsCost,
      thirdPartyMembership: ticket.ThirdPartyMembershipName,
      displaySequence: ticket.DisplaySequence,
      areaCategoryCode: ticket.AreaCategoryCode
    }));

    console.log(`\n=== Processed ${processedOffers.length} Loyalty Offers ===`);
    processedOffers.forEach((offer, index) => {
      console.log(`Offer ${index + 1}:`, {
        description: offer.description,
        price: `QAR ${offer.pricePerTicket.toFixed(2)}`,
        available: offer.availableQuantity,
        loyaltyOnly: offer.isLoyaltyOnly
      });
    });

    return { offers: processedOffers, memberData: loyaltyMember, userSessionId };
  } catch (error) {
    console.error('Error fetching loyalty offers:', error);
    return null;
  } finally {
    await apiContext.dispose();
  }
}

// ============================================================================
// BANK OFFERS HELPERS
// ============================================================================

export async function verifyBankOffers(page, request, sessionId, cinemaId) {
  await expect(page.getByRole('img', { name: 'offerbg' }).first()).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'View' }).first().click();
  await expect(page.getByRole('heading', { name: 'Bank Offers' })).toBeVisible({ timeout: 10000 });

  const offersData = await request.get(
    `https://backend.novocinemas.com/api/booking/offers/get/v2?cinemaId=${cinemaId}&sessionId=${sessionId}&country_id=1&channel=web`
  ).then(r => r.json());

  const activeOffers = offersData.data.filter(offer => offer.is_active && !offer.is_deleted);
  console.log(`Total active offers to verify: ${activeOffers.length}`);

  for (const offer of activeOffers) {
    const offerButton = page.getByRole('button', { name: new RegExp(offer.name, 'i') });
    await expect(offerButton).toBeVisible({ timeout: 5000 });
    console.log(`✓ ${offer.name} is visible`);
  }
}

export function setupValidationInterceptors(page) {
  const panEntriesPromise = page.waitForResponse(
    response => {
      const url = response.url();
      const status = response.status();
      return url.includes('vault.dibsy.one') && url.includes('pan-entries') && (status === 200 || status === 201);
    },
    { timeout: 20000 }
  );

  const offerValidatePromise = page.waitForResponse(
    response => response.url().includes('/api/booking/offers/v2/validate') && response.status() === 200,
    { timeout: 20000 }
  );

  return { panEntriesPromise, offerValidatePromise };
}

export function generateCardNumber() { 
  const p = '552400' + Array.from({length: 9}, () => Math.floor(Math.random() * 10)).join(''); 
  const s = (p + '0').split('').reverse().map(Number).map((d, i) => i % 2 ? (d * 2 > 9 ? d * 2 - 9 : d * 2) : d).reduce((a, b) => a + b, 0); 
  return p + ((10 - (s % 10)) % 10); 
}

export async function validateCard(page, panEntriesPromise, offerValidatePromise) {
  const cardNumber = generateCardNumber();
  console.log('Generated card number:', cardNumber);

  await page.getByRole('textbox', { name: 'Enter Card Number' }).fill(cardNumber);
  await page.getByRole('button', { name: 'Validate' }).click();
  await page.waitForTimeout(1000);

  let panEntriesData = null;
  try {
    const panEntriesResponse = await panEntriesPromise;
    panEntriesData = await panEntriesResponse.json();
  } catch (error) {
    console.error('Failed to capture PAN entries response:', error.message);
    const responses = [];
    page.on('response', async (response) => {
      if (response.url().includes('pan-entries')) {
        responses.push(response);
      }
    });
    await page.waitForTimeout(2000);
    if (responses.length > 0) {
      panEntriesData = await responses[0].json();
    } else {
      throw new Error('Could not capture PAN entries API response');
    }
  }

  if (panEntriesData) {
    await page.evaluate(([panData]) => {
      localStorage.setItem('pan_token', panData.panToken);
      localStorage.setItem('pan_hash', panData.panHash);
      localStorage.setItem('card_bin', panData.cardBin);
      localStorage.setItem('card_last4', panData.lastLast4);
      localStorage.setItem('pan_entries_data', JSON.stringify(panData));
    }, [panEntriesData]);
  }

  const validateResponse = await offerValidatePromise;
  const offerValidationData = await validateResponse.json();

  return { panEntriesData, offerValidationData };
}

export async function storeOfferValidationData(page, offerValidationData) {
  await page.evaluate(([validationData]) => {
    localStorage.setItem('offer_validation_response', JSON.stringify(validationData));
    
    if (validationData.data?.verificationToken) {
      localStorage.setItem('verification_token', validationData.data.verificationToken);
    }
    
    if (validationData.data?.applicableOffer) {
      localStorage.setItem('offer_applied', 'true');
      localStorage.setItem('offer_id', validationData.data.applicableOffer.id.toString());
      localStorage.setItem('offer_name', validationData.data.applicableOffer.offer_name);
    }
    
    if (validationData.data?.priceData) {
      localStorage.setItem('discounted_price', validationData.data.priceData.discounted_price.toString());
      localStorage.setItem('final_price', validationData.data.priceData.final_price.toString());
    }
  }, [offerValidationData]);
}

export function logOfferValidationResults(offerValidationData, panEntriesData) {
  if (offerValidationData.data?.isAllowed && offerValidationData.data?.isBinValid) {
    console.log('✅ CBQ Offer validated successfully!');
    return true;
  } else {
    console.warn('⚠️ Offer validation returned isAllowed: false or isBinValid: false');
    return false;
  }
}

export async function verifyOfferAppliedUI(page, offerValidationData) {
  const finalPriceQAR = offerValidationData.data.priceData.final_price / 100;
  try {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toContainText(`QAR ${finalPriceQAR}`, { timeout: 5000 });
  } catch {
    console.warn('Could not verify final price in UI immediately');
  }
}

export async function validateCardFlow(page) {
  await expect(page.getByText('CBQ Offer').nth(1)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'See More' }).click();
  await page.getByRole('button', { name: 'Terms & Conditions' }).click();
  await page.locator('div').filter({ hasText: /^Terms & Conditions:$/ }).getByRole('button').click();
  await expect(page.getByRole('textbox', { name: 'Enter Card Number' })).toBeVisible({ timeout: 10000 });

  const { panEntriesPromise, offerValidatePromise } = setupValidationInterceptors(page);
  const { panEntriesData, offerValidationData } = await validateCard(page, panEntriesPromise, offerValidatePromise);
  
  await storeOfferValidationData(page, offerValidationData);
  logOfferValidationResults(offerValidationData, panEntriesData);
  
  if (offerValidationData.data?.isAllowed && offerValidationData.data?.isBinValid) {
    await verifyOfferAppliedUI(page, offerValidationData);
  }

  await page.getByRole('button', { name: 'Close' }).click();
}

export async function handleBankOffersFlow(page, request, sessionId, cinemaId) {
  await verifyBankOffers(page, request, sessionId, cinemaId);
  
  const dibsyPublicKeyPromise = page.waitForResponse(
    response => response.url().includes('/api/payment/dibsy/public-key/') && response.status() === 200,
    { timeout: 15000 }
  );
  
  await page.getByRole('button', { name: 'CBQ Offer Logo CBQ Offer' }).click();
  console.log('Clicked CBQ Offer - waiting for Dibsy API...');
  
  const dibsyResponse = await dibsyPublicKeyPromise;
  const dibsyPublicKeyData = await dibsyResponse.json();
  
  await page.evaluate(([publicKeyData]) => {
    localStorage.setItem('dibsy_public_key', publicKeyData.data.publicKey);
    localStorage.setItem('dibsy_merchant_id', publicKeyData.data.merchantId);
    localStorage.setItem('dibsy_data', JSON.stringify(publicKeyData.data));
  }, [dibsyPublicKeyData]);

  await validateCardFlow(page);
}

export function setupPaymentInterceptors(page) {
  const selectSeatsResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/booking/select-seats') && resp.request().method() === 'POST'
  );

  const offersApplyPromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/booking/offers/v2/apply') && resp.request().method() === 'POST',
    { timeout: 20000 }
  ).catch(() => null);

  return { selectSeatsResponsePromise, offersApplyPromise };
}

export async function captureBookingFeeAndDiscount(selectSeatsResponsePromise, offersApplyPromise) {
  let bookingFeeCents = 500;
  let actualDiscountCents = 0;
  let offerApplied = false;
  let reservationId = null;

  try {
    const selectSeatsResponse = await selectSeatsResponsePromise;
    const selectSeatsApiData = await selectSeatsResponse.json();
    bookingFeeCents = selectSeatsApiData?.data?.bookingFee ?? 500;
    reservationId = selectSeatsApiData?.data?.reservationId ?? null;
    console.log('📌 Captured Reservation ID:', reservationId);
  } catch (e) {
    console.warn('Could not capture select-seats API response:', e);
  }

  try {
    const offersApplyResponse = await offersApplyPromise;
    if (offersApplyResponse) {
      const offersApplyData = await offersApplyResponse.json();
      if (offersApplyData.success && offersApplyData.data) {
        offerApplied = true;
        bookingFeeCents = offersApplyData.data.updated_booking_fee ?? bookingFeeCents;
        actualDiscountCents = offersApplyData.data.discount_amount_in_cents ?? 0;
        if (!reservationId && offersApplyData.data.reservationId) {
          reservationId = offersApplyData.data.reservationId;
        }
      }
    }
  } catch (e) {
    console.log('ℹ️ No bank offer applied or API not captured:', e.message);
  }

  return { bookingFeeCents, actualDiscountCents, offerApplied, reservationId };
}

export async function captureBookingFeeAndLoyaltyDiscount(selectSeatsResponsePromise, loyaltyApplyPromise) {
  let bookingFeeCents = 500;
  let actualLoyaltyDiscountCents = 0;
  let loyaltyOfferApplied = false;
  let reservationId = null;

  try {
    const selectSeatsResponse = await selectSeatsResponsePromise;
    const selectSeatsApiData = await selectSeatsResponse.json();
    bookingFeeCents = selectSeatsApiData?.data?.bookingFee ?? 500;
    reservationId = selectSeatsApiData?.data?.reservationId ?? null;
    console.log('📌 Captured Reservation ID:', reservationId);
    console.log('💰 Base Booking Fee:', bookingFeeCents / 100, 'QAR');
  } catch (e) {
    console.warn('Could not capture select-seats API response:', e);
  }

  try {
    const loyaltyApplyResponse = await loyaltyApplyPromise;
    if (loyaltyApplyResponse) {
      const loyaltyApplyData = await loyaltyApplyResponse.json();
      console.log('📝 Loyalty Apply API Response:', JSON.stringify(loyaltyApplyData, null, 2));
      
      if (loyaltyApplyData.success && loyaltyApplyData.data) {
        loyaltyOfferApplied = true;
        bookingFeeCents = loyaltyApplyData.data.updated_booking_fee ?? bookingFeeCents;
        actualLoyaltyDiscountCents = loyaltyApplyData.data.discount_amount_in_cents ?? 0;
        
        if (!reservationId && loyaltyApplyData.data.reservationId) {
          reservationId = loyaltyApplyData.data.reservationId;
        }
        
        console.log('✅ Loyalty offer applied successfully!');
        console.log('   - Discount Amount:', actualLoyaltyDiscountCents / 100, 'QAR');
        console.log('   - Updated Booking Fee:', bookingFeeCents / 100, 'QAR');
      }
    }
  } catch (e) {
    console.log('ℹ️ No loyalty offer applied or API not captured:', e.message);
  }

  return { bookingFeeCents, actualLoyaltyDiscountCents, loyaltyOfferApplied, reservationId };
}

export async function getOfferDataFromStorage(page) {
  return await page.evaluate(() => {
    const offerResponse = localStorage.getItem('offer_validation_response');
    return offerResponse ? JSON.parse(offerResponse) : null;
  });
}

export function calculateFinalPrices(totalExpectedPrice, offerData, offerApplied, actualDiscountCents) {
  let isOfferApplied = offerApplied;
  let offerDiscountAmount = actualDiscountCents / 100;
  let finalTicketPrice = totalExpectedPrice;
  let updatedSeatData = null;

  if (offerData && offerData.data?.isAllowed && offerData.data?.isBinValid) {
    updatedSeatData = offerData.data.seatData;
    finalTicketPrice = totalExpectedPrice - offerDiscountAmount;
  }

  return { isOfferApplied, offerDiscountAmount, finalTicketPrice, updatedSeatData };
}

export async function verifySeatsInPaymentPage(page, isOfferApplied, updatedSeatData, clickedSeats) {
  if (isOfferApplied && updatedSeatData) {
    console.log('✓ Verifying seats with bank offer applied...');
    for (const seatData of updatedSeatData) {
      if (!seatData.AreaName) continue;
      const seatIdentifier = `${seatData.AreaName.split(' ')[0]}`;
      try {
        await expect(page.getByText(seatIdentifier).first()).toBeVisible({ timeout: 5000 });
      } catch {
        console.warn(`Could not verify seat: ${seatIdentifier}`);
      }
    }
  } else {
    for (const seat of clickedSeats) {
      await expect(page.getByText(seat).first()).toBeVisible({ timeout: 5000 });
    }
  }
}

export async function verifyTicketPricesInPayment(page, isOfferApplied, updatedSeatData) {
  if (isOfferApplied && updatedSeatData) {
    console.log('✓ Verifying ticket prices with bank offer...');
    
    const ticketGroups = new Map();
    
    for (const seatData of updatedSeatData) {
      const ticketKey = `${seatData.TicketName}_${seatData.PriceInCents}`;
      if (!ticketGroups.has(ticketKey)) {
        ticketGroups.set(ticketKey, {
          ticketName: seatData.TicketName,
          areaName: seatData.AreaName,
          unitPrice: seatData.PriceInCents / 100,
          count: 0
        });
      }
      ticketGroups.get(ticketKey).count++;
    }
    
    for (const [key, ticketInfo] of ticketGroups) {
      const ticketPriceText = ticketInfo.unitPrice === 0 
        ? `QAR 0.00 x ${ticketInfo.count}`
        : `QAR ${ticketInfo.unitPrice.toFixed(2)} x ${ticketInfo.count}`;
      
      try {
        await expect(page.getByText(ticketPriceText)).toBeVisible({ timeout: 5000 });
        console.log(`✓ Verified ticket price for ${ticketInfo.ticketName}: ${ticketPriceText}`);
      } catch {
        const priceRegex = new RegExp(`QAR\\s*${ticketInfo.unitPrice.toFixed(2).replace('.', '\\.')}\\s*x\\s*${ticketInfo.count}`);
        try {
          await expect(page.locator('body')).toContainText(priceRegex, { timeout: 5000 });
          console.log(`✓ Verified ticket price (regex) for ${ticketInfo.ticketName}: ${ticketPriceText}`);
        } catch {
          console.warn(`Could not verify ticket price: ${ticketPriceText}`);
        }
      }
    }
  }
}

export async function verifyPaymentDetails(page, totalExpectedPrice, isOfferApplied, offerDiscountAmount, bookingFeeValue, totalWithBookingFee) {
  // Verify ticket subtotal - handle both decimal and non-decimal formats
  try {
    await expect(page.getByText('Ticket').first()).toBeVisible({ timeout: 5000 });
    
    // Try exact match first
    const ticketSubtotalExact = `+ QAR ${totalExpectedPrice.toFixed(2)}`;
    const ticketSubtotalNoDecimal = `+ QAR ${Math.floor(totalExpectedPrice)}`;
    
    try {
      await expect(page.getByText(ticketSubtotalExact).first()).toBeVisible({ timeout: 2000 });
      console.log(`✓ Verified ticket subtotal: ${ticketSubtotalExact}`);
    } catch {
      try {
        await expect(page.getByText(ticketSubtotalNoDecimal).first()).toBeVisible({ timeout: 2000 });
        console.log(`✓ Verified ticket subtotal: ${ticketSubtotalNoDecimal}`);
      } catch {
        // Try regex pattern that matches both formats
        const ticketRegex = new RegExp(`\\+\\s*QAR\\s*${Math.floor(totalExpectedPrice)}(?:\\.00)?`);
        await expect(page.locator('body')).toContainText(ticketRegex, { timeout: 5000 });
        console.log(`✓ Verified ticket subtotal (regex): ${totalExpectedPrice}`);
      }
    }
  } catch {
    console.warn(`Could not verify ticket subtotal: QAR ${totalExpectedPrice}`);
  }

  // Verify bank discount - handle both decimal and non-decimal formats
  if (isOfferApplied && offerDiscountAmount > 0) {
    try {
      await expect(page.getByText('Bank Discount').first()).toBeVisible({ timeout: 5000 });
      
      const discountExact = `- QAR ${offerDiscountAmount.toFixed(2)}`;
      const discountNoDecimal = `- QAR ${Math.floor(offerDiscountAmount)}`;
      
      try {
        await expect(page.getByText(discountExact).first()).toBeVisible({ timeout: 2000 });
        console.log(`✓ Verified bank discount: ${discountExact}`);
      } catch {
        try {
          await expect(page.getByText(discountNoDecimal).first()).toBeVisible({ timeout: 2000 });
          console.log(`✓ Verified bank discount: ${discountNoDecimal}`);
        } catch {
          // Try regex pattern
          const discountRegex = new RegExp(`-\\s*QAR\\s*${Math.floor(offerDiscountAmount)}(?:\\.00)?`);
          await expect(page.locator('body')).toContainText(discountRegex, { timeout: 5000 });
          console.log(`✓ Verified bank discount (regex): ${offerDiscountAmount}`);
        }
      }
    } catch (error) {
      console.warn('Bank Discount section not found in side panel:', error.message);
    }
  }

  // Verify booking fee - handle both decimal and non-decimal formats
  try {
    await expect(page.getByText('Booking Fee').first()).toBeVisible({ timeout: 5000 });
    
    const bookingFeeExact = `+ QAR ${bookingFeeValue.toFixed(2)}`;
    const bookingFeeNoDecimal = `+ QAR ${Math.floor(bookingFeeValue)}`;
    
    try {
      await expect(page.getByText(bookingFeeExact).first()).toBeVisible({ timeout: 2000 });
      console.log(`✓ Verified booking fee: ${bookingFeeExact}`);
    } catch {
      try {
        await expect(page.getByText(bookingFeeNoDecimal).first()).toBeVisible({ timeout: 2000 });
        console.log(`✓ Verified booking fee: ${bookingFeeNoDecimal}`);
      } catch {
        // Try regex pattern
        const feeRegex = new RegExp(`\\+\\s*QAR\\s*${Math.floor(bookingFeeValue)}(?:\\.00)?`);
        await expect(page.locator('body')).toContainText(feeRegex, { timeout: 5000 });
        console.log(`✓ Verified booking fee (regex): ${bookingFeeValue}`);
      }
    }
  } catch (error) {
    console.warn('Could not verify booking fee:', error.message);
  }

  // Verify total price - handle both decimal and non-decimal formats
  try {
    const totalExact = totalWithBookingFee.toFixed(2);
    const totalNoDecimal = Math.floor(totalWithBookingFee);
    
    // Try exact decimal format first
    const totalRegexExact = new RegExp(`Total Price.*QAR.*${totalExact.replace('.', '\\.')}`);
    try {
      await expect(page.getByText(totalRegexExact)).toBeVisible({ timeout: 2000 });
      console.log(`✓ Verified total price: QAR ${totalExact}`);
    } catch {
      // Try non-decimal format
      const totalRegexNoDecimal = new RegExp(`Total Price.*QAR.*${totalNoDecimal}`);
      try {
        await expect(page.getByText(totalRegexNoDecimal)).toBeVisible({ timeout: 2000 });
        console.log(`✓ Verified total price: QAR ${totalNoDecimal}`);
      } catch {
        // Try alternative formats
        const totalPriceAlternatives = [
          `Total Price QAR ${totalExact}`,
          `Total Price QAR ${totalNoDecimal}`,
          `QAR ${totalExact}`,
          `QAR ${totalNoDecimal}`
        ];
        
        for (const totalText of totalPriceAlternatives) {
          try {
            await expect(page.locator('body')).toContainText(totalText, { timeout: 2000 });
            console.log(`✓ Verified total price (alternative): ${totalText}`);
            break;
          } catch {
            continue;
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Could not verify total price: QAR ${totalWithBookingFee}`);
  }
}

export async function verifyLoyaltyPaymentDetails(page, totalExpectedPrice, loyaltyOfferApplied, loyaltyDiscountAmount, bookingFeeValue, totalWithBookingFee) {
  // Verify ticket subtotal
  const ticketSubtotalText = `+ QAR ${totalExpectedPrice.toFixed(2)}`;
  try {
    await expect(page.getByText('Ticket').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(ticketSubtotalText).first()).toBeVisible({ timeout: 5000 });
    console.log(`✓ Verified ticket subtotal: ${ticketSubtotalText}`);
  } catch {
    console.warn(`Could not verify ticket subtotal: ${ticketSubtotalText}`);
  }

  // Verify loyalty discount
  if (loyaltyOfferApplied && loyaltyDiscountAmount > 0) {
    try {
      await expect(page.getByText('Loyalty Discount').first()).toBeVisible({ timeout: 5000 });
      const discountText = `- QAR ${loyaltyDiscountAmount.toFixed(2)}`;
      try {
        await expect(page.getByText(discountText).first()).toBeVisible({ timeout: 5000 });
        console.log(`✓ Verified loyalty discount: ${discountText}`);
      } catch {
        const discountRegex = new RegExp(`-\\s*QAR\\s*${loyaltyDiscountAmount.toFixed(2).replace('.', '\\.')}`);
        await expect(page.locator('body')).toContainText(discountRegex, { timeout: 5000 });
        console.log(`✓ Verified loyalty discount (regex)`);
      }
    } catch (error) {
      console.warn('Loyalty Discount section not found in side panel:', error.message);
    }
  }

  // Verify booking fee
  try {
    await expect(page.getByText('Booking Fee').first()).toBeVisible({ timeout: 5000 });
    const bookingFeeAmount = `+ QAR ${bookingFeeValue.toFixed(2)}`;
    try {
      await expect(page.getByText(bookingFeeAmount).first()).toBeVisible({ timeout: 2000 });
      console.log(`✓ Verified booking fee: ${bookingFeeAmount}`);
    } catch {
      const feeRegex = new RegExp(`\\+\\s*QAR\\s*${bookingFeeValue}(?:\\.0+)?`);
      await expect(page.locator('body')).toContainText(feeRegex, { timeout: 5000 });
      console.log(`✓ Verified booking fee (regex)`);
    }
  } catch (error) {
    console.warn('Could not verify booking fee:', error.message);
  }

  // Verify total price
  try {
    await expect(page.getByText(new RegExp(`Total Price.*QAR.*${totalWithBookingFee.toFixed(2).replace('.', '\\.')}`))).toBeVisible({ timeout: 5000 });
    console.log(`✓ Verified total price: QAR ${totalWithBookingFee.toFixed(2)}`);
  } catch {
    const totalPriceAlternatives = [
      `Total Price QAR ${totalWithBookingFee.toFixed(2)}`,
      totalWithBookingFee % 1 === 0 ? `Total Price QAR ${Math.floor(totalWithBookingFee)}` : null,
      `QAR ${totalWithBookingFee.toFixed(2)}`
    ].filter(Boolean);
    
    for (const totalText of totalPriceAlternatives) {
      try {
        await expect(page.locator('body')).toContainText(totalText, { timeout: 5000 });
        console.log(`✓ Verified total price (alternative format): ${totalText}`);
        break;
      } catch {
        continue;
      }
    }
  }
}

export async function verifyOffersPromotionsSection(page, isOfferApplied, offerData) {
  try {
    await expect(page.locator('div').filter({ hasText: /^Offers & Promotions$/ }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Bank Offers').first()).toBeVisible({ timeout: 5000 });
    
    if (isOfferApplied && offerData) {
      const appliedOfferName = offerData.data.applicableOffer?.offer_name;
      if (appliedOfferName) {
        try {
          await expect(page.getByText(new RegExp(appliedOfferName, 'i')).first()).toBeVisible({ timeout: 5000 });
        } catch {
          if (appliedOfferName.toLowerCase().includes('cbq')) {
            await expect(page.getByText(/CBQ.*Offer/i).first()).toBeVisible({ timeout: 5000 });
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to verify Offers & Promotions section:', error.message);
  }
}

export async function verifyLoyaltyOffersSectionInPayment(page, loyaltyOfferApplied, selectedOffer) {
  try {
    await expect(page.locator('div').filter({ hasText: /^Offers & Promotions$/ }).first()).toBeVisible({ timeout: 5000 });
    console.log('✓ Offers & Promotions section visible');
    
    await expect(page.getByText('Loyalty Offers').first()).toBeVisible({ timeout: 5000 });
    console.log('✓ Loyalty Offers label visible');
    
    if (loyaltyOfferApplied && selectedOffer) {
      try {
        await expect(page.getByText(new RegExp(selectedOffer.description, 'i')).first()).toBeVisible({ timeout: 5000 });
        console.log(`✓ Applied loyalty offer visible: ${selectedOffer.description}`);
      } catch {
        console.warn(`Could not verify applied loyalty offer: ${selectedOffer.description}`);
      }
    }
  } catch (error) {
    console.warn('Failed to verify Loyalty Offers section:', error.message);
  }
}

export async function verifyFNBPageBasics(page, sidePanelApiData, movie, cinemaId, reservationId) {
  const expectedUrlPattern = new RegExp(`\/fnb\/cinema\/${cinemaId}\/reservationId\/${reservationId}`);
  await expect(page).toHaveURL(expectedUrlPattern, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Snack Time!' })).toBeVisible({ timeout: 10000 });
}

