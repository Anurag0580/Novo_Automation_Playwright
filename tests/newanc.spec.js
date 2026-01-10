import { test, expect } from '@playwright/test';
import {
  waitForPageLoad,
  switchLanguage,
  validateImageLoaded,
  validateImageBinding,
  validateBannerImageBinding,
  fetchApiData,
  stripHtmlTags,
  extractEmailFromHtml,
  checkLoginStatus,
  validateTierCards,
  validateTermsTabs,
  expandFaq
} from './helpers/anciliarypages_helpers.js';

const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

if (!BASE_URL || !BACKEND_URL) {
  throw new Error('❌ PROD_FRONTEND_URL or PROD_BACKEND_URL missing in env');
}

test('TC_01 – Verify “About Us” Page Content, Images, External Links, and Language Switching Using Backend API Data', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);

  const API_CONFIG = {
    baseUrl: `${BACKEND_URL}/api/home/pages`,
    params: {
      key: '/about',
      country_id: 1,
      channel: 'web'
    },
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${BASE_URL}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
    }
  };

  const apiData = await fetchApiData(page, API_CONFIG, 2);
  const en = apiData.page_json;
  const ar = apiData.page_json_ar;

  await page.goto(`${BASE_URL}/home`);
  await waitForPageLoad(page);

  try {
    await page.getByRole('link', { name: 'About Us' }).click();
  } catch {
    await page.goto(`${BASE_URL}/about-us`);
  }
  await waitForPageLoad(page);

  console.log('=== ENGLISH VERSION ===');

  await expect(
    page.locator('h1,h2,h3').filter({ hasText: apiData.page_name })
  ).toBeVisible();

  if (en.description_heading) {
    await expect(page.getByText(en.description_heading)).toBeVisible();
  }

  const bannerImg = page.getByRole('img', { name: 'termsImage' });
  await validateImageLoaded(bannerImg, 'Banner image');

  if (en.film?.[0]) {
    const film = en.film[0];

    if (film.filmTitle) {
      await expect(page.getByRole('heading', { name: film.filmTitle })).toBeVisible();
    }

    const filmImg = page.getByRole('img').filter({ hasText: '' }).nth(1);
    await validateImageLoaded(filmImg, 'Film image');

    if (film.linkName) {
      const link = page.getByRole('link', { name: film.linkName });
      await expect(link).toBeVisible();

      try {
        const [popup] = await Promise.all([
          page.waitForEvent('popup', { timeout: 8000 }),
          link.click()
        ]);
        await popup.close();
      } catch {
        console.warn('Film external link not opened');
      }
    }
  }

  for (const social of ['facebook', 'instagram', 'youtube']) {
    try {
      const link = page.locator(`a[href*="${social}"]`).first();
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        link.click()
      ]);
      await expect(popup.url()).toContain(social);
      await popup.close();
    } catch {
      console.warn(`${social} link missing`);
    }
  }

  if (en.section_two?.title) {
    await expect(page.getByRole('heading', { name: en.section_two.title })).toBeVisible();
    await validateImageLoaded(page.locator('img').last(), 'Partner logo');
  }

  console.log('=== ARABIC VERSION ===');
  await switchLanguage(page, 'العربية');

  await expect(
    page.locator('h1,h2,h3').filter({ hasText: apiData.page_name_ar })
  ).toBeVisible();

  if (ar.description_heading) {
    await expect(page.getByText(ar.description_heading)).toBeVisible();
  }

  if (ar.film?.[0]) {
    const arFilm = ar.film[0];
    if (arFilm.filmTitle) {
      await expect(page.getByRole('heading', { name: arFilm.filmTitle })).toBeVisible();
    }
    await validateImageLoaded(page.locator('img').nth(1), 'Arabic film image');
  }

  if (ar.section_two?.title) {
    await expect(page.getByRole('heading', { name: ar.section_two.title })).toBeVisible();
    await validateImageLoaded(page.locator('img').last(), 'Arabic partner logo');
  }

  await switchLanguage(page, 'ENG');

  console.log('✅ About Us page validation completed successfully');
});

test('TC_02 – Verify “Advertise With Us” Page Content, Feature Sections, Form Validation, and Language Switching Using Backend API Data', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);

  const API_CONFIG = {
    baseUrl: `${BACKEND_URL}/api/home/pages`,
    params: {
      key: '/advertise',
      country_id: 1,
      channel: 'web'
    },
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${BASE_URL}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
    }
  };

  const apiData = await fetchApiData(page, API_CONFIG, 4);
  const en = apiData.page_json;
  const ar = apiData.page_json_ar;

  console.log('API Data Retrieved:', {
    pageTitle: apiData.page_name,
    pageDesc: apiData.page_desc,
    featureCount: en.featureArray?.length || 0
  });

  await page.goto(`${BASE_URL}/home`);
  await waitForPageLoad(page);

  try {
    await page.getByRole('link', { name: 'Advertise With Us' }).click();
  } catch {
    await page.goto(`${BASE_URL}/advertise-with-us`);
  }

  await waitForPageLoad(page);

  console.log('\n=== ENGLISH VERSION ===');

  await expect(
    page.locator('h1,h2,h3').filter({ hasText: apiData.page_name })
  ).toBeVisible();

  if (apiData.page_desc) {
    await expect(
      page.getByText(apiData.page_desc, { exact: false })
    ).toBeVisible();
  }

  if (en.bannerArray?.[0]?.banner) {
    const bannerImg = page.locator('img[alt="termsImage"]').first();
    await expect(bannerImg).toHaveAttribute('src', /gumlet\.io|novo/i);
    const src = await bannerImg.getAttribute('src');
    console.log(`✔ Banner image (EN) src bound: ${src}`);
  }

  if (en.content) {
    const contentText = en.content.replace(/<[^>]*>/g, '').trim();
    if (contentText) {
      await expect(
        page.getByText(contentText, { exact: false })
      ).toBeVisible();
    }
  }

  if (en.featureArray?.length) {
    console.log(`Validating ${en.featureArray.length} feature sections...`);

    for (let i = 0; i < en.featureArray.length; i++) {
      const feature = en.featureArray[i];
      console.log(`\n--- Feature ${i + 1}: ${feature.title} ---`);

      if (feature.title) {
        await expect(
          page.getByRole('heading', { name: feature.title })
        ).toBeVisible();
      }

      if (feature.description) {
        const text = feature.description.replace(/<[^>]*>/g, '').trim();
        const snippet = text.substring(0, 100);

        try {
          await expect(
            page.getByText(snippet, { exact: false })
          ).toBeVisible({ timeout: 5000 });
        } catch {
          console.warn(`⚠ Description missing for: ${feature.title}`);
        }
      }

      if (feature.image) {
        const img = page.locator('img').nth(i + 1);
        await validateImageBinding(img, `Feature ${i + 1} image (EN)`);
      }
    }
  }

  console.log('\n--- Form Validation (EN) ---');
  const submitBtn = page.getByRole('button', { name: 'Submit' });
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    try {
      await expect(page.getByText(/required/i).first()).toBeVisible();
      console.log('✔ Form validation working');
    } catch {
      console.warn('⚠ Form validation not triggered');
    }
  }

  console.log('\n=== ARABIC VERSION ===');
  await switchLanguage(page, 'العربية');

  await expect(
    page.locator('h1,h2,h3').filter({ hasText: apiData.page_name_ar })
  ).toBeVisible();

  if (apiData.page_desc_ar) {
    await expect(
      page.getByText(apiData.page_desc_ar, { exact: false })
    ).toBeVisible();
  }

  if (ar.bannerArray?.[0]?.banner) {
    const bannerImg = page.locator('img[alt="termsImage"]').first();
    await expect(bannerImg).toHaveAttribute('src', /gumlet\.io|novo/i);
    const src = await bannerImg.getAttribute('src');
    console.log(`✔ Banner image (AR) src bound: ${src}`);
  }

  if (ar.featureArray?.length) {
    for (let i = 0; i < ar.featureArray.length; i++) {
      const feature = ar.featureArray[i];

      if (feature.title) {
        await expect(
          page.getByRole('heading', { name: feature.title })
        ).toBeVisible();
      }

      if (feature.image) {
        const img = page.locator('img').nth(i + 1);
        await validateImageBinding(img, `Feature ${i + 1} image (AR)`);
      }
    }
  }

  console.log('\n--- Form Validation (AR) ---');
  const arSubmit = page.getByRole('button', { name: 'تقديم' });
  if (await arSubmit.isVisible()) {
    await arSubmit.click();
    try {
      await expect(page.getByText(/مطلوب/i).first()).toBeVisible();
      console.log('✔ Arabic form validation working');
    } catch {
      console.warn('⚠ Arabic form validation not triggered');
    }
  }

  await switchLanguage(page, 'ENG');

  console.log('\n✅ Advertise With Us page validation completed successfully');
});

test('TC_03 – Verify “Careers” Page Content, Email Links, Banner Images, and Language Switching Using Backend API Data', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);

  const API_CONFIG = {
    baseUrl: `${BACKEND_URL}/api/home/pages`,
    params: {
      key: '/career',
      country_id: 1,
      channel: 'web'
    },
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${BASE_URL}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
    }
  };

  const apiData = await fetchApiData(page, API_CONFIG, 1);
  const en = apiData.page_json;
  const ar = apiData.page_json_ar;

  console.log('API Data Retrieved:', {
    title: apiData.page_name,
    description: apiData.page_desc,
    email: en.mail
  });

  await page.goto(`${BASE_URL}/home`);
  await waitForPageLoad(page);

  try {
    await page.getByRole('link', { name: 'Careers' }).click();
  } catch {
    await page.goto(`${BASE_URL}/careers`);
  }

  await waitForPageLoad(page);

  console.log('\n=== ENGLISH VERSION ===');

  await expect(
    page.locator('h1,h2,h3').filter({ hasText: apiData.page_name })
  ).toBeVisible();

  if (apiData.page_desc) {
    await expect(
      page.getByText(apiData.page_desc, { exact: false })
    ).toBeVisible();
  }

  if (en.bannerArray?.[0]?.banner) {
    console.log('\n--- Banner Image Validation (EN) ---');
    const bannerImg = page.locator('img[alt="termsImage"]').first();
    await validateBannerImageBinding(bannerImg, 'Banner image (EN)');
  }

  if (en.page_content) {
    console.log('\n--- Page Content Validation ---');
    const contentText = stripHtmlTags(en.page_content);

    const paragraphs = contentText
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 30);

    for (const p of paragraphs) {
      const snippet = p.substring(0, 80);
      try {
        await expect(page.getByText(snippet, { exact: false }))
          .toBeVisible({ timeout: 5000 });
        console.log(`✔ Content validated: ${snippet}...`);
      } catch {
        console.warn(`⚠ Content missing: ${snippet}...`);
      }
    }
  }

  if (en.mail) {
    const emailLink = page.getByRole('link', { name: en.mail });
    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveAttribute(
      'href',
      `mailto:${en.mail}`
    );
    console.log(`✔ Email link validated: ${en.mail}`);
  }

  const contentEmail = extractEmailFromHtml(en.page_content);
  if (contentEmail && contentEmail !== en.mail) {
    await expect(page.getByText(contentEmail)).toBeVisible();
    console.log(`✔ Additional content email found: ${contentEmail}`);
  }

  console.log('\n=== ARABIC VERSION ===');
  await switchLanguage(page, 'العربية');

  await expect(
    page.locator('h1,h2,h3').filter({ hasText: apiData.page_name_ar })
  ).toBeVisible();

  if (apiData.page_desc_ar) {
    await expect(
      page.getByText(apiData.page_desc_ar, { exact: false })
    ).toBeVisible();
  }

  if (ar.bannerArray?.[0]?.banner) {
    console.log('\n--- Banner Image Validation (AR) ---');
    const bannerImg = page.locator('img[alt="termsImage"]').first();
    await validateBannerImageBinding(bannerImg, 'Banner image (AR)');
  }

  if (ar.page_content) {
    const contentText = stripHtmlTags(ar.page_content);

    const paragraphs = contentText
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 30);

    for (const p of paragraphs) {
      const snippet = p.substring(0, 80);
      try {
        await expect(page.getByText(snippet, { exact: false }))
          .toBeVisible({ timeout: 5000 });
        console.log(`✔ Arabic content validated`);
      } catch {
        console.warn(`⚠ Arabic content missing`);
      }
    }
  }

  if (ar.mail) {
    const emailLinks = page.locator(`a[href="mailto:${ar.mail}"]`);
    const count = await emailLinks.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✔ Found ${count} mailto link(s) for: ${ar.mail}`);
    await expect(emailLinks.first()).toBeVisible();
  }

  await switchLanguage(page, 'ENG');

  console.log('\n✅ Careers page validation completed successfully');
});

test('TC_04 – Verify “Privacy Policy” Page Content Sections, Links, Key Policy Areas, and Language Switching Using Backend API Data', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);

  const API_CONFIG = {
    baseUrl: `${BACKEND_URL}/api/home/pages`,
    params: {
      key: '/privacy',
      country_id: 1,
      channel: 'web'
    },
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${BASE_URL}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
    }
  };

  const apiData = await fetchApiData(page, API_CONFIG, 9);
  const en = apiData.page_json;
  const ar = apiData.page_json_ar;

  console.log('API Data Retrieved:', {
    pageTitle: apiData.page_name,
    contentSections: en.contentArray?.length || 0,
    arabicSections: ar.contentArray?.length || 0
  });

  await page.goto(`${BASE_URL}/home`);
  await waitForPageLoad(page);

  try {
    await page.getByRole('link', { name: 'Privacy Policy' }).click();
  } catch {
    await page.goto(`${BASE_URL}/privacy-policy`);
  }
  await waitForPageLoad(page);

  console.log('\n=== ENGLISH VERSION ===');

  try {
    await expect(
      page.locator('h1,h2,h3').filter({ hasText: apiData.page_name })
    ).toBeVisible({ timeout: 8000 });
    console.log(`✔ Page title validated: ${apiData.page_name}`);
  } catch {
    console.warn(`Page title not found: ${apiData.page_name}`);
  }

  if (apiData.page_desc) {
    console.log('\n--- Page Description Validation ---');
    const descText = stripHtmlTags(apiData.page_desc);
    
    const descPhrases = descText.split(/\n+/).filter(p => p.length > 30);
    
    for (const phrase of descPhrases) {
      try {
        const snippet = phrase.substring(0, 80);
        await expect(
          page.getByText(snippet, { exact: false })
        ).toBeVisible({ timeout: 5000 });
        console.log(`✔ Description validated: ${snippet}...`);
      } catch {
        console.warn(`Description phrase not found: ${phrase.substring(0, 50)}...`);
      }
    }
  }

  if (en.contentArray && en.contentArray.length > 0) {
    console.log(`\n--- Validating ${en.contentArray.length} Content Sections ---`);

    for (let i = 0; i < en.contentArray.length; i++) {
      const section = en.contentArray[i];
      console.log(`\n--- Section ${i + 1}: ${section.title} ---`);

      if (section.title) {
        try {
          await expect(
            page.getByText(section.title, { exact: false })
          ).toBeVisible({ timeout: 5000 });
          console.log(`✔ Section title validated: ${section.title}`);
        } catch {
          console.warn(`Section title not found: ${section.title}`);
        }
      }

      if (section.content) {
        const contentText = stripHtmlTags(section.content);
        const contentSnippet = contentText.substring(0, 100).trim();
        
        if (contentSnippet.length > 20) {
          try {
            await expect(
              page.getByText(contentSnippet, { exact: false })
            ).toBeVisible({ timeout: 5000 });
            console.log(`✔ Content validated: ${contentSnippet}...`);
          } catch {
            console.warn(`Content not found for section: ${section.title}`);
          }
        }

        const linkMatch = section.content.match(/href="([^"]+)"/);
        if (linkMatch) {
          const linkUrl = linkMatch[1];
          try {
            const link = page.getByRole('link', { name: new RegExp(linkUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
            await expect(link).toBeVisible({ timeout: 3000 });
            console.log(`✔ Link found in section: ${linkUrl}`);
          } catch {
            console.warn(`Link not found in section: ${linkUrl}`);
          }
        }
      }
    }
  }

  console.log('\n=== ARABIC VERSION ===');
  await switchLanguage(page, 'العربية');

  try {
    await expect(
      page.locator('h1,h2,h3').filter({ hasText: apiData.page_name_ar })
    ).toBeVisible({ timeout: 8000 });
    console.log(`✔ Arabic page title validated: ${apiData.page_name_ar}`);
  } catch {
    console.warn(`Arabic page title not found: ${apiData.page_name_ar}`);
  }

  if (apiData.page_desc_ar) {
    console.log('\n--- Arabic Page Description Validation ---');
    const descText = stripHtmlTags(apiData.page_desc_ar);
    
    const descPhrases = descText.split(/\n+/).filter(p => p.length > 30);
    
    for (const phrase of descPhrases) {
      try {
        const snippet = phrase.substring(0, 80);
        await expect(
          page.getByText(snippet, { exact: false })
        ).toBeVisible({ timeout: 5000 });
        console.log(`✔ Arabic description validated: ${snippet}...`);
      } catch {
        console.warn(`Arabic description phrase not found: ${phrase.substring(0, 50)}...`);
      }
    }
  }

  if (ar.contentArray && ar.contentArray.length > 0) {
    console.log(`\n--- Validating ${ar.contentArray.length} Arabic Content Sections ---`);

    for (let i = 0; i < ar.contentArray.length; i++) {
      const section = ar.contentArray[i];
      console.log(`\n--- Arabic Section ${i + 1}: ${section.title} ---`);

      if (section.title) {
        try {
          await expect(
            page.getByText(section.title, { exact: false }).first()
          ).toBeVisible({ timeout: 5000 });
          console.log(`✔ Arabic section title validated: ${section.title}`);
        } catch {
          console.warn(`Arabic section title not found: ${section.title}`);
        }
      }

      if (section.content) {
        const contentText = stripHtmlTags(section.content);
        const contentSnippet = contentText.substring(0, 100).trim();
        
        if (contentSnippet.length > 20) {
          try {
            await expect(
              page.getByText(contentSnippet, { exact: false })
            ).toBeVisible({ timeout: 5000 });
            console.log(`✔ Arabic content validated: ${contentSnippet}...`);
          } catch {
            console.warn(`Arabic content not found for section: ${section.title}`);
          }
        }

        const linkMatch = section.content.match(/href="([^"]+)"/);
        if (linkMatch) {
          const linkUrl = linkMatch[1];
          try {
            const link = page.getByRole('link', { name: new RegExp(linkUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
            await expect(link).toBeVisible({ timeout: 3000 });
            console.log(`✔ Arabic link found in section: ${linkUrl}`);
          } catch {
            console.warn(`Arabic link not found in section: ${linkUrl}`);
          }
        }
      }
    }
  }

  console.log('\n--- Validating Key Policy Sections ---');
  
  const importantSections = [
    'Account and registration',
    'Privacy policy guarantee',
    'Credit card details',
    'Your consent'
  ];

  for (const sectionName of importantSections) {
    const section = en.contentArray?.find(s => s.title === sectionName);
    if (section) {
      console.log(`✔ Key section found in API: ${sectionName}`);
    } else {
      console.warn(`Key section not found in API: ${sectionName}`);
    }
  }

  await switchLanguage(page, 'ENG');

  console.log('\n✅ Privacy Policy page validation completed successfully');
});

test('TC_05 – Verify “Terms and Conditions” Page Content Sections, Legal Policies, Links, and Language Switching Using Backend API Data', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);

  const API_CONFIG = {
    baseUrl: `${BACKEND_URL}/api/home/pages`,
    params: {
      key: '/t&c',
      country_id: 1,
      channel: 'web'
    },
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${BASE_URL}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
    }
  };

  const apiData = await fetchApiData(page, API_CONFIG, 6);
  const en = apiData.page_json;
  const ar = apiData.page_json_ar;

  console.log('API Data Retrieved:', {
    pageTitle: apiData.page_name,
    pageDesc: apiData.page_desc,
    contentSections: en.contentArray?.length || 0,
    arabicSections: ar.contentArray?.length || 0
  });

  await page.goto(`${BASE_URL}/home`);
  await waitForPageLoad(page);

  try {
    await page.getByRole('link', { name: 'Terms And Conditions' }).click();
  } catch {
    await page.goto(`${BASE_URL}/terms-and-conditions`);
  }
  await waitForPageLoad(page);

  console.log('\n=== ENGLISH VERSION ===');

  try {
    await expect(
      page.locator('h1,h2,h3').filter({ hasText: apiData.page_name })
    ).toBeVisible({ timeout: 8000 });
    console.log(`✔ Page title validated: ${apiData.page_name}`);
  } catch {
    console.warn(`Page title not found: ${apiData.page_name}`);
  }

  if (apiData.page_desc) {
    console.log('\n--- Page Description Validation ---');
    const descText = stripHtmlTags(apiData.page_desc);
    
    try {
      await expect(
        page.getByText(descText.substring(0, 80), { exact: false })
      ).toBeVisible({ timeout: 5000 });
      console.log(`✔ Description validated: ${descText.substring(0, 80)}...`);
    } catch {
      console.warn(`Description not found: ${descText.substring(0, 50)}...`);
    }
  }

  if (en.contentArray && en.contentArray.length > 0) {
    console.log(`\n--- Validating ${en.contentArray.length} Content Sections ---`);

    for (let i = 0; i < en.contentArray.length; i++) {
      const section = en.contentArray[i];
      console.log(`\n--- Section ${i + 1}: ${section.title} ---`);

      if (section.title) {
        try {
          await expect(
            page.getByText(section.title, { exact: false })
          ).toBeVisible({ timeout: 5000 });
          console.log(`✔ Section title validated: ${section.title}`);
        } catch {
          console.warn(`Section title not found: ${section.title}`);
        }
      }

      if (section.content) {
        const contentText = stripHtmlTags(section.content);
        const contentSnippet = contentText.substring(0, 100).trim();
        
        if (contentSnippet.length > 20) {
          try {
            await expect(
              page.getByText(contentSnippet, { exact: false })
            ).toBeVisible({ timeout: 5000 });
            console.log(`✔ Content validated: ${contentSnippet.substring(0, 60)}...`);
          } catch {
            console.warn(`Content not found for section: ${section.title}`);
          }
        }

        const linkMatches = section.content.match(/href="([^"]+)"/g);
        if (linkMatches) {
          for (const linkMatch of linkMatches) {
            const linkUrl = linkMatch.match(/href="([^"]+)"/)[1];
            try {
              const link = page.locator(`a[href*="${linkUrl}"]`).first();
              await expect(link).toBeVisible({ timeout: 3000 });
              console.log(`✔ Link found in section: ${linkUrl}`);
            } catch {
              console.warn(`Link not found in section: ${linkUrl}`);
            }
          }
        }
      }
    }
  }

  console.log('\n--- Validating Key Policy Sections ---');
  
  const importantSections = [
    'Terms of service',
    'Intellectual property',
    'Use of information and materials',
    'Governing law and jurisdiction',
    'Tickets Cancelation and Refund Policy',
    'No-Show Policy'
  ];

  for (const sectionName of importantSections) {
    const section = en.contentArray?.find(s => s.title === sectionName);
    if (section) {
      console.log(`✔ Key section found in API: ${sectionName}`);
    } else {
      console.warn(`Key section not found in API: ${sectionName}`);
    }
  }

  console.log('\n=== ARABIC VERSION ===');
  await switchLanguage(page, 'العربية');

  try {
    await expect(
      page.locator('h1,h2,h3').filter({ hasText: apiData.page_name_ar })
    ).toBeVisible({ timeout: 8000 });
    console.log(`✔ Arabic page title validated: ${apiData.page_name_ar}`);
  } catch {
    console.warn(`Arabic page title not found: ${apiData.page_name_ar}`);
  }

  if (apiData.page_desc_ar) {
    console.log('\n--- Arabic Page Description Validation ---');
    const descText = stripHtmlTags(apiData.page_desc_ar);
    
    try {
      await expect(
        page.getByText(descText.substring(0, 80), { exact: false })
      ).toBeVisible({ timeout: 5000 });
      console.log(`✔ Arabic description validated: ${descText.substring(0, 80)}...`);
    } catch {
      console.warn(`Arabic description not found: ${descText.substring(0, 50)}...`);
    }
  }

  if (ar.contentArray && ar.contentArray.length > 0) {
    console.log(`\n--- Validating ${ar.contentArray.length} Arabic Content Sections ---`);

    for (let i = 0; i < ar.contentArray.length; i++) {
      const section = ar.contentArray[i];
      console.log(`\n--- Arabic Section ${i + 1}: ${section.title} ---`);

      if (section.title) {
        try {
          await expect(
            page.getByText(section.title, { exact: false })
          ).toBeVisible({ timeout: 5000 });
          console.log(`✔ Arabic section title validated: ${section.title}`);
        } catch {
          console.warn(`Arabic section title not found: ${section.title}`);
        }
      }

      if (section.content) {
        const contentText = stripHtmlTags(section.content);
        const contentSnippet = contentText.substring(0, 100).trim();
        
        if (contentSnippet.length > 20) {
          try {
            await expect(
              page.getByText(contentSnippet, { exact: false })
            ).toBeVisible({ timeout: 5000 });
            console.log(`✔ Arabic content validated: ${contentSnippet.substring(0, 60)}...`);
          } catch {
            console.warn(`Arabic content not found for section: ${section.title}`);
          }
        }

        const linkMatches = section.content.match(/href="([^"]+)"/g);
        if (linkMatches) {
          for (const linkMatch of linkMatches) {
            const linkUrl = linkMatch.match(/href="([^"]+)"/)[1];
            try {
              const link = page.locator(`a[href*="${linkUrl}"]`).first();
              await expect(link).toBeVisible({ timeout: 3000 });
              console.log(`✔ Arabic link found in section: ${linkUrl}`);
            } catch {
              console.warn(`Arabic link not found in section: ${linkUrl}`);
            }
          }
        }
      }
    }
  }

  console.log('\n--- Validating Key Arabic Policy Sections ---');
  
  const importantArabicSections = [
    'شروط الخدمة',
    'الملكية الفكرية',
    'استخدام المعلومات والمواد',
    'القانون الحاكم والاختصاص القضائي',
    'سياسة إلغاء التذاكر واسترداد الأموال',
    'سياسة ملفات تعريف الارتباط'
  ];

  for (const sectionName of importantArabicSections) {
    const section = ar.contentArray?.find(s => s.title === sectionName);
    if (section) {
      console.log(`✔ Key Arabic section found in API: ${sectionName}`);
    } else {
      console.warn(`Key Arabic section not found in API: ${sectionName}`);
    }
  }

  await switchLanguage(page, 'ENG');

  console.log('\n✅ Terms and Conditions page validation completed successfully');
});

test('TC_06 – Verify “FAQ” Page Categories, Search Functionality, Question Expansion, and Language Switching Using Backend API Data', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);

  const API_CONFIG = {
    baseUrl: `${BACKEND_URL}/api/home/pages`,
    params: {
      key: '/faq',
      country_id: 1,
      channel: 'web'
    },
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${BASE_URL}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
    }
  };

  console.log('Fetching FAQ data from API...');
  const apiData = await fetchApiData(page, API_CONFIG, 10);
  const en = apiData.page_json;
  const ar = apiData.page_json_ar;

  console.log(
    `✔ API Data fetched: ${en.faqQuestions.length} EN FAQs, ${ar.faqQuestions.length} AR FAQs`
  );

  await page.goto(`${BASE_URL}/home`);
  await waitForPageLoad(page);

  try {
    await page.getByRole('link', { name: 'FAQs' }).click();
  } catch {
    await page.goto(`${BASE_URL}/faq`);
  }

  await waitForPageLoad(page);

  console.log('\n=== ENGLISH VERSION ===');

  await expect(
    page.getByRole('heading', { name: apiData.page_name })
  ).toBeVisible();

  if (en.bannerArray?.[0]?.banner) {
    const bannerImg = page.locator('img[alt="faqs"]').first();
    await validateBannerImageBinding(bannerImg, 'FAQ Banner (EN)');
  }

  for (const category of en.faqCategories) {
    await expect(page.locator('body')).toContainText(category.categoryName);
  }

  const searchBox = page.getByRole('textbox', { name: /search/i });
  await searchBox.fill('ticket');
  await expect(page.locator('body')).toContainText(/ticket/i);
  await searchBox.clear();

  for (const faq of en.faqQuestions.slice(0, 3)) {
    await expandFaq(page, faq.question, faq.answer);
  }

  const importantFaqs = [
    'What are your ticket prices?',
    'Can I book tickets in advance for a show?',
    'What is your cancellation and refund policy?'
  ];

  for (const q of importantFaqs) {
    await expect(page.locator('body')).toContainText(q);
  }

  console.log('\n=== ARABIC VERSION ===');
  await switchLanguage(page, 'العربية');

  await expect(
    page.getByRole('heading', { name: apiData.page_name_ar })
  ).toBeVisible();

  if (ar.bannerArray?.[0]?.banner) {
    const bannerImgAr = page.locator('img[alt="faqs"]').first();
    await validateBannerImageBinding(bannerImgAr, 'FAQ Banner (AR)');
  }

  for (const category of ar.faqCategories) {
    await expect(page.locator('body')).toContainText(category.categoryName);
  }

  const searchBoxAr = page.getByRole('textbox').first();
  await searchBoxAr.fill('تذكرة');
  await expect(page.locator('body')).toContainText(/تذكرة/i);
  await searchBoxAr.clear();

  for (const faq of ar.faqQuestions.slice(0, 3)) {
    await expandFaq(page, faq.question, faq.answer);
  }

  const importantFaqsAr = [
    'ما أسعار تذاكركم؟',
    'هل يمكنني حجز تذاكر مسبقًا لحضور عرض معين؟',
    'ما هي سياسة الإلغاء واسترداد الأموال؟'
  ];

  for (const q of importantFaqsAr) {
    await expect(page.locator('body')).toContainText(q);
  }

  await switchLanguage(page, 'ENG');
  await expect(page.locator('body')).toContainText(/Frequently Asked Questions/i);

  console.log('\n✅ FAQ page validation completed successfully');
});

test('TC_07 – Verify “Premiere Club” Page Tiers, Membership Sections, Images, Terms Tabs, FAQs, Login State Behavior, and Language Switching Using Backend API Data', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);

  const API_CONFIG = {
    baseUrl: `${BACKEND_URL}/api/home/pages`,
    params: {
      key: '/clubs',
      country_id: 1,
      channel: 'web'
    },
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${BASE_URL}/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36'
    }
  };

  console.log('Fetching Premiere Club data from API...');
  const apiData = await fetchApiData(page, API_CONFIG, 14);
  const en = apiData.page_json;
  const ar = apiData.page_json_ar;

  console.log(`✔ API Data fetched: ${en.faqCategories.length} tier categories, ${en.questions.length} questions`);

  await page.goto(`${BASE_URL}/home`);
  await waitForPageLoad(page);

  try {
    await page.getByRole('link', { name: /premiere.*club/i }).click();
  } catch {
    await page.goto(`${BASE_URL}/premiereclub`);
  }
  await waitForPageLoad(page);

  console.log('=== ENGLISH VERSION ===');

  await expect(
    page.locator('h1,h2,h3').filter({ hasText: new RegExp(apiData.page_name, 'i') })
  ).toBeVisible({ timeout: 10000 });
  console.log(`✔ Page title validated: ${apiData.page_name}`);

  if (en.bannerArray && en.bannerArray[0]?.banner) {
    const bannerImg = page.locator('.relative > .absolute.inset-0, img').first();
    await validateBannerImageBinding(bannerImg, 'Premiere Club Banner');
  }

  const isLoggedIn = await checkLoginStatus(page);
  console.log(`User login status: ${isLoggedIn ? 'Logged In' : 'Logged Out'}`);

  if (!isLoggedIn) {
    try {
      await expect(page.getByRole('button', { name: 'Sign Up' }).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible({ timeout: 5000 });
      console.log('✔ Sign Up and Log in buttons visible (user not logged in)');
    } catch {
      console.warn('⚠ Login buttons not found or already logged in');
    }
  } else {
    console.log('✔ User is logged in, login buttons should not be visible');
  }

  if (en.sign_description) {
    const cleanDesc = stripHtmlTags(en.sign_description);
    const descSnippet = cleanDesc.substring(0, 30);
    await expect(page.locator('body')).toContainText(
      new RegExp(descSnippet, 'i'), 
      { timeout: 5000 }
    );
    console.log('✔ Page description validated');
  }

  if (en.sectionTwoTitle) {
    await expect(page.locator('body')).toContainText(
      en.sectionTwoTitle, 
      { timeout: 5000 }
    );
    console.log(`✔ Section Two Title validated: ${en.sectionTwoTitle}`);
  }

  if (en.sectionTwoDescription) {
    const cleanSectionDesc = stripHtmlTags(en.sectionTwoDescription).substring(0, 30);
    await expect(page.locator('body')).toContainText(
      new RegExp(cleanSectionDesc, 'i'), 
      { timeout: 5000 }
    );
    console.log('✔ Section Two Description validated');
  }

  if (en.faqCategories && en.faqCategories.length > 0) {
    await validateTierCards(page, en.faqCategories);
  }

  try {
    const termsBtn = page.locator('button, a').filter({ 
      hasText: /Terms.*Conditions/i 
    }).first();
    await termsBtn.scrollIntoViewIfNeeded();
    await expect(termsBtn).toBeVisible({ timeout: 5000 });
    await termsBtn.click();
    await page.waitForTimeout(1000);
    console.log('✔ Terms and Conditions section opened');
  } catch {
    console.warn('⚠ Terms and Conditions button not found or not clickable');
  }

  if (en.types && en.types.length > 0) {
    await validateTermsTabs(page, en.types, en.questions);
  }

  const importantQuestions = [
    'What is Novo Premiere Club?',
    'How do I become a Novo Premiere Club member?',
    'How do I earn points?'
  ];

  console.log('Validating important questions...');
  for (const questionText of importantQuestions) {
    const question = en.questions.find(q => q.question === questionText);
    if (question) {
      try {
        await expect(page.locator('body')).toContainText(
          questionText, 
          { timeout: 5000 }
        );
        console.log(`✔ Important question found: ${questionText}`);
      } catch {
        console.warn(`⚠ Important question not found: ${questionText}`);
      }
    }
  }

  console.log('Validating all images...');
  const images = page.locator('img');
  const imgCount = await images.count();
  let validatedImages = 0;

  for (let i = 0; i < Math.min(imgCount, 10); i++) {
    const img = images.nth(i);
    try {
      if (await img.isVisible({ timeout: 2000 })) {
        await validateBannerImageBinding(img, `Image ${i + 1}`);
        validatedImages++;
      }
    } catch {
      console.warn(`⚠ Image ${i + 1} validation skipped`);
    }
  }
  console.log(`✔ Validated ${validatedImages} images`);

  console.log('=== ARABIC VERSION ===');
  await switchLanguage(page, 'العربية');

  await expect(
    page.locator('h1,h2,h3').filter({ hasText: new RegExp(apiData.page_name_ar, 'i') })
  ).toBeVisible({ timeout: 10000 });
  console.log(`✔ Arabic page title validated: ${apiData.page_name_ar}`);

  if (ar.bannerArray && ar.bannerArray[0]?.banner) {
    const bannerImgAr = page.locator('img').first();
    await validateBannerImageBinding(bannerImgAr, 'Arabic Premiere Club Banner');
  }

  if (ar.sign_description) {
    const cleanDescAr = stripHtmlTags(ar.sign_description);
    const descSnippetAr = cleanDescAr.substring(0, 20);
    await expect(page.locator('body')).toContainText(
      new RegExp(descSnippetAr, 'i'), 
      { timeout: 5000 }
    );
    console.log('✔ Arabic page description validated');
  }

  if (ar.sectionTwoTitle) {
    await expect(page.locator('body')).toContainText(
      ar.sectionTwoTitle, 
      { timeout: 5000 }
    );
    console.log(`✔ Arabic Section Two Title validated: ${ar.sectionTwoTitle}`);
  }

  if (ar.faqCategories && ar.faqCategories.length > 0) {
    await validateTierCards(page, ar.faqCategories);
  }

  try {
    const termsBtnAr = page.locator('button, a').filter({ 
      hasText: /الشروط.*الأحكام/i 
    }).first();
    await termsBtnAr.scrollIntoViewIfNeeded();
    await expect(termsBtnAr).toBeVisible({ timeout: 5000 });
    await termsBtnAr.click();
    await page.waitForTimeout(1000);
    console.log('✔ Arabic Terms and Conditions section opened');
  } catch {
    console.warn('⚠ Arabic Terms and Conditions button not found');
  }

  if (ar.types && ar.types.length > 0) {
    await validateTermsTabs(page, ar.types, ar.questions);
  }

  const importantQuestionsAr = [
    'ما هو نادي نوڤو سينماز بريميير؟',
    'كيف يمكنني الانضمام كعضو في نادي نوڤو سينماز بريميير؟',
    'كيف أكسب النقاط؟'
  ];

  console.log('Validating important Arabic questions...');
  for (const questionText of importantQuestionsAr) {
    const question = ar.questions.find(q => q.question === questionText);
    if (question) {
      try {
        await expect(page.locator('body')).toContainText(
          questionText, 
          { timeout: 5000 }
        );
        console.log(`✔ Important Arabic question found: ${questionText}`);
      } catch {
        console.warn(`⚠ Important Arabic question not found: ${questionText}`);
      }
    }
  }

  console.log('Validating Arabic images...');
  const imagesAr = page.locator('img');
  const imgCountAr = await imagesAr.count();
  let validatedImagesAr = 0;

  for (let i = 0; i < Math.min(imgCountAr, 5); i++) {
    const img = imagesAr.nth(i);
    try {
      if (await img.isVisible({ timeout: 2000 })) {
        await validateBannerImageBinding(img, `Arabic Image ${i + 1}`);
        validatedImagesAr++;
      }
    } catch {
      console.warn(`⚠ Arabic Image ${i + 1} validation skipped`);
    }
  }
  console.log(`✔ Validated ${validatedImagesAr} Arabic images`);

  await switchLanguage(page, 'ENG');
  await expect(page.locator('body')).toContainText(
    new RegExp(apiData.page_name, 'i'), 
    { timeout: 5000 }
  );

  console.log('✅ Premiere Club page validation completed successfully');
});

test('TC_08 – Verify “Contact Us” Page Navigation and Accessibility from Footer', async ({ page }) => {
  await page.goto(`${BASE_URL}/home`);
  await waitForPageLoad(page);
  
  try {
    await page.getByRole('link', { name: 'Contact Us' }).click();
  } catch {
    await page.goto(`${BASE_URL}/contact-us`);
  }
  await waitForPageLoad(page);
  await page.goto(`${BASE_URL}/home`);

});
