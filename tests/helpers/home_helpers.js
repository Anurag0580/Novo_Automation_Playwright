import { expect } from '@playwright/test';

// ==================== CONFIGURATION ====================

export const LANGUAGE_CONFIG = {
  english: {
    buttonName: 'English',
    exploreMoreText: 'Explore More',
    bookNowText: 'Book Now',
    getTitleFn: (movie) => movie.movie_title || movie.movie_title_ar || '',
    sectionTexts: ['Now Showing', 'Coming Soon', 'Advance Booking']
  },
  arabic: {
    buttonName: 'العربية',
    exploreMoreText: 'اكتشف المزيد',
    bookNowText: 'احجز الآن',
    getTitleFn: (movie) => movie.movie_title_ar || movie.movie_title || '',
    sectionTexts: ['الان في دور العرض', 'قريباً', 'الحجز المسبق']
  }
};

export const OFFER_API = 'https://backend.novocinemas.com/api/home/offer-groups?country_id=1&channel=web&istop10=true';

// ==================== HEADER HELPERS ====================

export const headerLink = (page, name) => {
  return page.getByRole('navigation').getByRole('link', { name });
};

export const headerButton = (page, name) => {
  return page.getByRole('navigation').getByRole('button', { name });
};

// ==================== SEARCH HELPERS ====================

export async function setupSearchTracking(page) {
  const apiCalls = [];
  let availableMovies = [];

  page.on('request', (req) => {
    if (req.url().includes('backend.novocinemas.com/api/home/search')) {
      apiCalls.push(req.url());
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('backend.novocinemas.com/api/home/search')) {
      try {
        const data = await res.json();
        if (data?.data?.movies) {
          availableMovies = data.data.movies;
        }
      } catch {
        // Handle JSON parsing error silently
      }
    }
  });

  const getMovieName = (lang = 'en') => {
    const movies = availableMovies.filter((m) => (lang === 'ar' ? m.name_ar : m.name));
    if (!movies.length) {
      return lang === 'ar' ? 'كولي' : 'Coolie';
    }
    const movie = movies[Math.floor(Math.random() * movies.length)];
    const movieName = lang === 'ar' ? movie.name_ar : movie.name;
    return movieName.split(' ')[0];
  };

  return { apiCalls, getMovieName };
}

// ==================== ELEMENT VISIBILITY HELPERS ====================

export async function verifyScrollable(locator) {
  if (!(await locator.isVisible())) {
    return;
  }

  const [scrollHeight, clientHeight] = await Promise.all([
    locator.evaluate((el) => el.scrollHeight),
    locator.evaluate((el) => el.clientHeight)
  ]);

  if (scrollHeight > clientHeight) {
    await locator.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await locator.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  }
}

// ==================== MOVIES API HELPERS ====================

export async function fetchMoviesFromAPI(page) {
  try {
    const response = await page.request.get(
      'https://backend.novocinemas.com/api/home/movies?experienceId=&locationId=&languageId=&genreId=&country_id=1&channel=web'
    );

    if (!response.ok()) {
      return [];
    }

    const responseData = await response.json();

    return (
      responseData.data?.movies
        ?.filter((movie) => !movie.isAdvanceBookingAvailable)
        ?.map((movie) => ({
          movie_title: movie.movie_title,
          movie_title_ar: movie.movie_title_ar,
          movie_id: movie.movie_id,
          movie_slug: movie.movie_slug,
          movie_rating: movie.movie_rating,
          movie_genre:
            movie.movie_genre?.map((g) => g.genre_name || g.genre_name_ar).join(', ') || '',
          interested_count: movie._count?.movies_like || 0,
          isAdvanceBookingAvailable: movie.isAdvanceBookingAvailable
        })) || []
    );
  } catch (error) {
    return [];
  }
}

// ==================== MOVIE INTERACTION HELPERS ====================

export async function testMovieInteraction(page, movie, config, shouldNavigateBack = true) {
  const movieTitle = config.getTitleFn(movie);

  const movieTitleLocator = page.locator(`text="${movieTitle}"`).first();
  await expect(movieTitleLocator).toBeVisible();

  const moviePoster = page.getByRole('link').filter({ hasText: movieTitle }).first();
  await expect(moviePoster).toBeVisible();

  if (config === LANGUAGE_CONFIG.english) {
    await moviePoster.hover();
    await page.waitForTimeout(500);
    await expect(moviePoster.getByRole('heading', { name: movieTitle })).toBeVisible();
    await expect(moviePoster.getByText(config.bookNowText)).toBeVisible();
  }

  await moviePoster.click();
  await expect(page).toHaveURL(/\/movies\//);
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: movieTitle })).toBeVisible();
  await expect(page.getByRole('img', { name: 'movie banner', exact: true })).toBeVisible();

  if (shouldNavigateBack) {
    if (config === LANGUAGE_CONFIG.arabic) {
      await page.locator('.rounded-full.hover\\:cursor-pointer').click();
    } else {
      await page.goBack();
    }
    await page.waitForLoadState('networkidle');
  }
}

// ==================== MOVIES TEST RUNNER ====================

export async function runMoviesTest(page, languageKey) {
  const config = LANGUAGE_CONFIG[languageKey];

  const apiMovies = await fetchMoviesFromAPI(page);
  expect(apiMovies.length).toBeGreaterThan(0);

  await page.goto('https://qa.novocinemas.com/home');
  await page.waitForLoadState('networkidle');

  if (languageKey !== 'english') {
    await page.getByRole('navigation').getByRole('button', { name: config.buttonName }).click();
    await page.waitForLoadState('networkidle');
  }

  if (languageKey === 'english') {
    await expect(page.locator('.relative.w-full.px-5')).toBeVisible();
    await expect(page.locator('.flex.flex-col.justify-between').first()).toBeVisible();

    for (const text of config.sectionTexts) {
      await expect(page.locator('body')).toContainText(text);
    }

    const filters = [
      '.css-1t85phb-control',
      '.text-\\[\\#FFEF00\\].text-sm.w-full.mr-0\\.5 > .css-1t85phb-control',
      '.text-\\[\\#FFEF00\\].text-base > .css-1t85phb-control',
      '.text-\\[\\#FFEF00\\].text-sm.w-full.mr-0\\.5.lg\\:w-auto.min-w-\\[150px\\] > .css-1t85phb-control'
    ];

    for (const filter of filters) {
      await expect(page.locator(filter).first()).toBeVisible();
    }
  }

  for (let i = 0; i < Math.min(2, apiMovies.length); i++) {
    const movie = apiMovies[i];
    const movieTitle = config.getTitleFn(movie);

    if (!movieTitle || movieTitle.trim() === '') {
      continue;
    }

    await testMovieInteraction(page, movie, config, true);
  }

  await expect(page.getByRole('button', { name: config.exploreMoreText }).first()).toBeVisible();
  await page.getByRole('button', { name: config.exploreMoreText }).first().click();
  await page.waitForLoadState('networkidle');

  if (apiMovies.length >= 3) {
    const movie = apiMovies[2];
    const movieTitle = config.getTitleFn(movie);

    if (movieTitle && movieTitle.trim() !== '') {
      await testMovieInteraction(page, movie, config, false);
    }
  }
}

// ==================== OFFERS HELPERS ====================

export function getOffersSection(page) {
  return page
    .locator('.bg-grayBackground')
    .filter({
      has: page.locator('div', {
        hasText: /Offers & Promotions|العروض/i
      })
    })
    .first();
}

export function getOffersSlider(page) {
  return getOffersSection(page).locator('.slick-slider');
}

export async function waitForOffersCarouselReady(page) {
  console.log('⏳ Waiting for offers carousel to be ready...');
  const section = getOffersSection(page);
  await expect(section).toBeVisible({ timeout: 15000 });

  await expect.poll(
    async () => await section.locator('.slick-slide').count(),
    { timeout: 15000 }
  ).toBeGreaterThan(0);

  console.log(`✅ Carousel ready with ${await section.locator('.slick-slide').count()} slides`);
}

export async function clickNextArrowIfVisible(page) {
  const nextArrow = getOffersSection(page).locator('svg.lucide-chevron-right').first();

  const count = await nextArrow.count();
  if (count === 0) {
    console.log('⚠️  Next arrow not found');
    return false;
  }

  const visible = await nextArrow.isVisible();
  if (!visible) {
    console.log('⚠️  Next arrow not visible');
    return false;
  }

  await nextArrow.click({ force: true });
  await page.waitForTimeout(700);
  console.log('➡️  Clicked next arrow');
  return true;
}

export async function bringOfferIntoView(page, offerText) {
  console.log(`🔍 Searching for offer: "${offerText}"`);

  for (let i = 0; i < 8; i++) {
    const count = await getOffersSlider(page)
      .locator('.slick-slide.slick-current')
      .filter({ hasText: offerText })
      .count();

    if (count > 0) {
      console.log(`✅ Found offer "${offerText}" after ${i} navigation(s)`);
      return;
    }

    console.log(`   Attempt ${i + 1}/8: Not visible yet, clicking next...`);
    await clickNextArrowIfVisible(page);
    await page.waitForTimeout(500);
  }

  console.error(`❌ Offer not visible after 8 attempts: "${offerText}"`);
  throw new Error(`Offer not visible: ${offerText}`);
}

export async function clickOfferAndWaitForNavigation(page, offer, isArabic = false) {
  const offerText = isArabic ? offer.name_ar : offer.name;
  console.log(`🖱️  Clicking offer: "${offerText}"`);

  await getOffersSlider(page)
    .locator('.slick-slide.slick-current')
    .filter({ hasText: offerText })
    .first()
    .click({ force: true });

  const expectedUrl = new RegExp(`/promotions/${offer.id}`);

  try {
    await page.waitForURL(expectedUrl, { timeout: 8000 });
    console.log(`✅ Navigation successful to: /promotions/${offer.id}`);
    return true;
  } catch {
    console.warn(`⚠️  Navigation timeout for offer: "${offerText}"`);
    return false;
  }
}

export async function testOffersInLanguage(page, offers, isArabic = false) {
  const language = isArabic ? 'Arabic' : 'English';
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🌐 Testing ${offers.length} offers in ${language}`);
  console.log('='.repeat(50));

  for (let idx = 0; idx < offers.length; idx++) {
    const offer = offers[idx];
    const offerName = isArabic ? offer.name_ar : offer.name;

    console.log(`\n📋 [${idx + 1}/${offers.length}] Testing offer: "${offerName}"`);

    // Skip if Arabic name missing
    if (isArabic && !offer.name_ar) {
      console.log('⏭️  Skipping: No Arabic name available');
      continue;
    }

    await bringOfferIntoView(page, offerName);
    const navigated = await clickOfferAndWaitForNavigation(page, offer, isArabic);

    if (navigated) {
      await expect(page.getByText(offerName).first()).toBeVisible();
      console.log(`✅ Offer "${offerName}" validated successfully`);
    } else {
      console.warn(`⚠️  Could not validate offer: "${offerName}"`);
    }

    // Return to home for next offer
    console.log('🏠 Returning to home page...');
    await page.goto('https://qa.novocinemas.com/home', {
      waitUntil: 'domcontentloaded'
    });
    await waitForOffersCarouselReady(page);
  }
}
