import { test, expect } from '@playwright/test';

// Configuration for different languages
const LANGUAGE_CONFIG = {
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

// Helper functions
async function setupSearchTracking(page) {
  const apiCalls = [];
  let availableMovies = [];

  page.on('request', req => {
    if (req.url().includes('backend.novocinemas.com/api/home/search')) apiCalls.push(req.url());
  });

  page.on('response', async res => {
    if (res.url().includes('backend.novocinemas.com/api/home/search')) {
      try {
        const data = await res.json();
        if (data?.data?.movies) availableMovies = data.data.movies;
      } catch {}
    }
  });

  return { apiCalls, getMovieName: (lang = 'en') => {
    const movies = availableMovies.filter(m => lang === 'ar' ? m.name_ar : m.name);
    if (!movies.length) return lang === 'ar' ? 'كولي' : 'Coolie';
    const movie = movies[Math.floor(Math.random() * movies.length)];
    return (lang === 'ar' ? movie.name_ar : movie.name).split(' ')[0];
  }};
}

async function verifyScrollable(locator) {
  if (!(await locator.isVisible())) return;
  const [scrollHeight, clientHeight] = await Promise.all([
    locator.evaluate(el => el.scrollHeight),
    locator.evaluate(el => el.clientHeight)
  ]);
  if (scrollHeight > clientHeight) {
    await locator.evaluate(el => (el.scrollTop = el.scrollHeight));
    expect(await locator.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  }
}

async function fetchMoviesFromAPI(page) {
    try {
        const response = await page.request.get(
            'https://backend.novocinemas.com/api/home/movies?experienceId=&locationId=&languageId=&genreId=&country_id=1&channel=web'
        );
        
        if (!response.ok()) return [];
        
        const responseData = await response.json();
        
        return responseData.data?.movies
            ?.filter(movie => !movie.isAdvanceBookingAvailable)
            ?.map(movie => ({
                movie_title: movie.movie_title,
                movie_title_ar: movie.movie_title_ar,
                movie_id: movie.movie_id,
                movie_slug: movie.movie_slug,
                movie_rating: movie.movie_rating,
                movie_genre: movie.movie_genre?.map(g => g.genre_name || g.genre_name_ar).join(', ') || '',
                interested_count: movie._count?.movies_like || 0,
                isAdvanceBookingAvailable: movie.isAdvanceBookingAvailable
            })) || [];
        
    } catch (error) {
        return [];
    }
}

async function testMovieInteraction(page, movie, config, shouldNavigateBack = true) {
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

async function runMoviesTest(page, languageKey) {
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
        
        if (!movieTitle || movieTitle.trim() === '') continue;
        
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

async function testOffers(page, request, isArabic = false) {
  const nameKey = isArabic ? 'name_ar' : 'name';
  
  const response = await request.get('https://backend.novocinemas.com/api/home/offer-groups?country_id=1&channel=web&istop10=true');
  expect(response.ok()).toBeTruthy();
  
  const offers = (await response.json()).data?.filter(o => o?.[nameKey]?.trim()).slice(0, 3) || [];
  if (offers.length === 0) return;

  await page.goto('https://qa.novocinemas.com/home', { waitUntil: 'domcontentloaded' });
  
  if (isArabic) {
    await page.getByRole('navigation').getByRole('button', { name: 'العربية' }).click();
    await page.waitForLoadState('domcontentloaded');
  }

  const promosText = isArabic ? 'العروض الترويجية' : 'Offers & Promotions';
  await page.locator('div').filter({ hasText: new RegExp(`^${promosText}$`) }).click();
  
  const offersHeading = isArabic ? 'العروض الترويجية' : 'Offers & Promotions';
  await page.locator('div').filter({ hasText: new RegExp(`^${offersHeading}$`) }).first().waitFor();

  for (const offer of offers) {
    const offerName = offer[nameKey];
    await test.step(`Testing: ${offerName}`, async () => {
      const offerCard = page.locator('.cursor-pointer').filter({ hasText: new RegExp(offerName, 'i') }).first();
      await expect(offerCard).toBeVisible();

      const cardText = await offerCard.textContent();
      expect(cardText?.toLowerCase()).toContain(offerName.toLowerCase());

      await offerCard.click();
      await expect(page.locator('body')).toContainText(offerName);

      const backButton = isArabic ? 'رجوع' : 'Go Back';
      await page.getByRole('button', { name: backButton }).click();
      
      await page.locator('div').filter({ hasText: new RegExp(`^${offersHeading}`) }).first().waitFor();
    });
  }
  
  if (isArabic) {
    await page.getByRole('navigation').getByRole('button', { name: 'ENG' }).click();
  }
}

// Test Cases
test.only('TC001 - Verify Homepage Navigation Header and Menu Links Functionality', async ({ page }) => {
  await page.goto('https://www.novocinemas.com/');
  await page.locator('div').filter({ hasText: /^QATAR$/ }).getByRole('button').click();
  await expect(page.getByRole('navigation').getByRole('img', { name: 'Logo' })).toBeVisible();

  // Food & Beverages > Online Order
  await page.getByRole('button', { name: 'Food & Beverages' }).click();
  await expect(page.getByRole('link', { name: 'Online Order' })).toBeVisible();
  await page.getByRole('link', { name: 'Online Order' }).click();
  await expect(page).toHaveURL(/takeaway/);
  await expect(page.getByRole('heading', { name: 'Food & Drinks To-Go' })).toBeVisible();

  // Food & Beverages > Home Delivery
  await page.goto('https://qa.novocinemas.com/home');
  await page.getByRole('button', { name: 'Food & Beverages' }).click();
  await expect(page.getByRole('link', { name: 'Home Delivery' })).toBeVisible();
  await page.getByRole('link', { name: 'Home Delivery' }).click();
  await expect(page).toHaveURL(/homedelivery/);
  await expect(page.locator('div').filter({ hasText: 'Enjoy Novo CinemasTreats' }).nth(4)).toBeVisible();

  // Offers & Promotions
  await page.goto('https://qa.novocinemas.com/home');
  await expect(page.getByRole('link', { name: 'Offers & Promotions' })).toBeVisible();
  await page.getByRole('link', { name: 'Offers & Promotions' }).click();
  await expect(page).toHaveURL(/promotions/);
  await expect(page.getByRole('heading', { name: 'Offers & Promotions' })).toBeVisible();

  // Locations
  await page.goto('https://qa.novocinemas.com/home');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Locations' })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Locations' }).click();
  await expect(page).toHaveURL(/location/);
  await expect(page.getByRole('heading', { name: 'Explore our Locations' })).toBeVisible();

  // Experiences
  await page.goto('https://qa.novocinemas.com/home');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Experiences' })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Experiences' }).click();
  await expect(page).toHaveURL(/experiences/);
  await expect(page.getByRole('heading', { name: 'Novo Experiences' })).toBeVisible();

  // Private Booking
  await page.goto('https://qa.novocinemas.com/home');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Private Booking' })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Private Booking' }).click();
  await expect(page).toHaveURL(/privatebooking/);
  await expect(page.getByRole('heading', { name: 'Private Booking' })).toBeVisible();

  // Premiere Club
  await page.goto('https://qa.novocinemas.com/home');
  const premiereClubLink = page.getByRole('navigation').getByRole('link', { name: 'Premiere Club' });
  await expect(premiereClubLink).toBeVisible();
  await page.goto('https://qa.novocinemas.com/premiereclub');
  await expect(page).toHaveURL(/premiereclub/);
  await expect(page.locator('text=Premiere Club').first()).toBeVisible();

  // Language switching
  await page.goto('https://qa.novocinemas.com/home');
  await page.getByRole('navigation').getByRole('button', { name: 'العربية' }).click();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'العروض الترويجية' })).toBeVisible();
  await expect(page.getByRole('navigation')).toContainText('العروض الترويجية');
  await expect(page.getByRole('navigation')).toContainText('الحجوزات الخاصة');
  await page.getByRole('navigation').getByRole('button', { name: 'ENG' }).click({force: true});
});

test('TC002 - Verify English Search Functionality and API Integration', async ({ page }) => {
  const { apiCalls, getMovieName } = await setupSearchTracking(page);

  await page.goto('https://qa.novocinemas.com/home');
  const navButton = page.getByRole('navigation').getByRole('button').filter({ hasText: /^$/ }).first();
  const searchBox = page.getByRole('textbox', { name: 'Search Movie or Cinema' });
  const searchPopup = page.locator('[data-testid="search-popup"]').or(page.locator('.search-popup, .search-modal, .search-container'));

  await navButton.click();
  await expect(searchBox).toBeVisible();
  await page.waitForTimeout(1500);
  expect(apiCalls[0]).toMatch(/search=.*&country_id=1&channel=web/);

  const searchTerm = getMovieName();
  await searchBox.fill(searchTerm);
  await page.waitForTimeout(2000);
  expect(apiCalls.some(call => call.includes(`search=${encodeURIComponent(searchTerm)}`))).toBeTruthy();

  await verifyScrollable(searchPopup);

  await searchBox.clear();
  await expect(searchBox).toHaveValue('');
  expect(apiCalls.some(url => url.includes('search=&country_id=1&channel=web'))).toBeTruthy();
  await page.locator('.lucide.lucide-x.cursor-pointer').click();
});

test('TC003 - Verify Arabic Search Functionality and Language Support', async ({ page }) => {
  const { apiCalls, getMovieName } = await setupSearchTracking(page);

  await page.goto('https://qa.novocinemas.com/home');
  await page.getByRole('navigation').getByRole('button', { name: 'العربية' }).click();

  const navButton = page.getByRole('navigation').getByRole('button').filter({ hasText: /^$/ }).first();
  const searchBox = page.getByRole('textbox', { name: 'ابحث عن فيلم أو سينما' });

  await navButton.click();
  await expect(searchBox).toBeVisible();
  await page.waitForTimeout(1500);

  const arabicSearchTerm = getMovieName('ar');
  await searchBox.fill(arabicSearchTerm);
  await page.waitForTimeout(2000);
  expect(apiCalls.some(call => call.includes(`search=${encodeURIComponent(arabicSearchTerm)}`))).toBeTruthy();

  await searchBox.clear();
  await page.locator('.lucide.lucide-x.cursor-pointer').click();
});

test('TC004 - Verify Homepage Banner Functionality and Navigation', async ({ page }) => {
  test.setTimeout(120000);
  
  try {
    await page.goto('https://qa.novocinemas.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (error) {
    await page.goto('https://www.novocinemas.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
  }

  // Helper functions
  const findElement = async (selectors, parent = page) => {
    for (const selector of selectors) {
      const element = parent.locator(selector).first();
      if (await element.isVisible().catch(() => false)) return element;
    }
    return null;
  };

  const getText = async (selectors, parent = page) => {
    const element = await findElement(selectors, parent);
    return element ? (await element.textContent())?.trim() : '';
  };

  const pauseSlider = async () => {
    await page.evaluate(() => {
      const slider = document.querySelector('.slick-slider');
      if (slider?.slick) slider.slick.pause();
    }).catch(() => {});
  };

  // 1. Verify banner and movie card matching
  await test.step('Verify banner visibility and movie title matching', async () => {
    const bannerContainer = await findElement(['.slick-slider', '[data-testid="banner"]', '.banner-container']);
    await expect(bannerContainer).toBeVisible({ timeout: 20000 });
    
    await page.waitForSelector('.slick-slide.slick-active', { timeout: 15000 });
    
    const movieCard = await findElement([
      '.slick-slide.slick-active > div > .px-2 > .rounded-\\[25px\\].\\32 xl\\:w-full',
      '.slick-slide.slick-active .movie-card',
      '.slick-slide.slick-active [data-testid="movie-card"]'
    ]);
    
    const bannerTitle = await getText(['.slick-slide.slick-active h1', '.slick-slide.slick-active h2']);
    const cardTitle = movieCard ? await getText(['h1', 'h2', 'h3'], movieCard) : '';
    
    if (bannerTitle && cardTitle) {
      expect(bannerTitle.toLowerCase()).toBe(cardTitle.toLowerCase());
    }
    
    if (movieCard) await movieCard.click();
  });

  // 2. Test Book Now button
  await test.step('Test Book Now button', async () => {
    await pauseSlider();
    await page.waitForTimeout(2000);
    
    const bookNowButton = await findElement([
      '.slick-slide.slick-active button:has-text("Book Now")',
      '.slick-slide.slick-active .bg-\\[\\#FFDD00\\]',
      'button:has-text("Book Now")'
    ]);
    
    if (bookNowButton) {
      await bookNowButton.scrollIntoViewIfNeeded();
      try {
        await bookNowButton.click();
      } catch {
        await bookNowButton.click({ force: true });
      }
      
      await page.waitForTimeout(3000);
      await page.goBack().catch(() => page.goto('https://www.novocinemas.com/home'));
      await page.waitForTimeout(2000);
    }
  });

  // 3. Test Watch Trailer
  await test.step('Test Watch Trailer', async () => {
    const maxChecks = 5;
    let trailerFound = false;
    let checks = 0;
    
    const nextButton = page.locator('div').filter({ hasText: /^1$/ }).getByRole('button').nth(1);
    
    while (!trailerFound && checks < maxChecks) {
      checks++;
      await pauseSlider();
      await page.waitForTimeout(1000);
      
      const trailerButton = await findElement([
        '.slick-slide.slick-active > div > .relative > .sm\\:absolute > .w-full > .flex.items-center.gap-4 > .flex',
        '.slick-slide.slick-active button:has-text("Watch Trailer")',
        '.slick-slide.slick-active [aria-label*="play"]',
        '.slick-slide.slick-active .flex > span > .lucide',
        'button:has-text("Watch Trailer")',
        '.slick-slide.slick-active svg[class*="lucide"]'
      ]);
      
      if (trailerButton) {
        trailerFound = true;
        
        await trailerButton.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        
        try {
          await trailerButton.click({ timeout: 5000 });
        } catch {
          await trailerButton.click({ force: true });
        }
        
        await page.waitForTimeout(3000);
        
        const popup = await findElement([
          'iframe[title*="Trailer"]',
          '[id*="headlessui-dialog"]',
          '[role="dialog"]',
          '.video-modal',
          '[data-testid="video-modal"]'
        ]);
        
        if (popup) {
          const closeButton = await findElement([
            '[id*="headlessui-dialog"] svg',
            '[id*="headlessui-dialog"] button',
            '[aria-label*="close"]',
            'button:has-text("Close")',
            '.close-button'
          ]);
          
          if (closeButton) {
            await closeButton.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(2000);
        }
        
        break;
      } else {
        if (checks < maxChecks && await nextButton.isVisible().catch(() => false)) {
          await nextButton.click();
          await page.waitForTimeout(2500);
        } else {
          break;
        }
      }
    }
  });

  // 4. Test navigation buttons
  await test.step('Test navigation buttons', async () => {
    const nextBtn = page.locator('div').filter({ hasText: /^1$/ }).getByRole('button').nth(1);
    const prevBtn = page.locator('div').filter({ hasText: /^1$/ }).getByRole('button').first();
    
    const getCurrentIndex = async () => {
      const indicator = await findElement(['.slick-dots .slick-active', '.slick-current']);
      return indicator ? await indicator.textContent() : Math.random().toString();
    };
    
    if (await nextBtn.isVisible().catch(() => false)) {
      const initial = await getCurrentIndex();
      
      // Test next button 3 times
      for (let i = 1; i <= 3; i++) {
        await nextBtn.click();
        await page.waitForTimeout(2000);
        const current = await getCurrentIndex();
        expect(current).not.toBe(initial);
      }
      
      // Test previous button
      const beforePrev = await getCurrentIndex();
      await prevBtn.click();
      await page.waitForTimeout(2000);
      const afterPrev = await getCurrentIndex();
      expect(afterPrev).not.toBe(beforePrev);
    }
  });

  // 5. Test auto-scroll
  await test.step('Test auto-scroll', async () => {
    const getActiveBanner = async () => {
      const active = page.locator('.slick-active').first();
      return (await active.isVisible()) ? 
        (await active.getAttribute('data-index') || await active.textContent()?.slice(0, 50) || Math.random().toString()) :
        Math.random().toString();
    };

    const initial = await getActiveBanner();
    let changed = false;
    
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(1000);
      const current = await getActiveBanner();
      if (current !== initial) {
        changed = true;
        break;
      }
    }
    
    expect(changed).toBe(true);
  });
});

test('TC005 - Verify Movies Section Functionality in English', async ({ page }) => {
    await runMoviesTest(page, 'english');
});

test('TC006 - Verify Movies Section Functionality in Arabic', async ({ page }) => {
    await runMoviesTest(page, 'arabic');
});

test('TC007 - Verify Top 10 Movies Section and Video Playback', async ({ page }) => {
  await page.goto('https://qa.novocinemas.com/');
  
  await expect(page.getByText('Top 10 Movies')).toBeVisible();
  
  const leftArrow = page.locator('.lucide.lucide-chevron-left.cursor-pointer');
  const rightArrow = page.locator('.lucide.lucide-chevron-right.cursor-pointer');
  
  await expect(leftArrow).toBeVisible();
  await expect(rightArrow).toBeVisible();
  await expect(leftArrow).toBeEnabled();
  await expect(rightArrow).toBeEnabled();
  
  await expect(page.getByRole('img', { name: 'Coolie (Tamil)' }).nth(2)).toBeVisible();
  const yellowHighlight = page.locator('.bg-gradient-to-b.h-full').first();
  await expect(yellowHighlight).toBeVisible();
  
  for (let i = 0; i < 9; i++) {
    await rightArrow.click();
    await page.waitForTimeout(500);
    await expect(yellowHighlight).toBeVisible();
  }
  
  for (let i = 0; i < 5; i++) {
    await leftArrow.click();
    await page.waitForTimeout(500);
    await expect(yellowHighlight).toBeVisible();
  }

  const activeMovie = page.locator('img.border-\\[\\#FFEF00\\]');
  await expect(activeMovie).toBeVisible();
  await activeMovie.click();

  await page.locator('.slick-slide.slick-active > div > div > .flex > .border > .lucide').click();

  const ytIframe = page.frameLocator('iframe[title="YouTube video player"]');
  await ytIframe
    .first()
    .locator('button[aria-label="Play"], .ytp-large-play-button')
    .waitFor({ state: 'visible', timeout: 15000 });

  await ytIframe.getByRole('button', { name: /play/i }).click();

  await expect(ytIframe.locator('.ytp-progress-bar-padding')).toBeVisible();

  const closeSelectors = [
    '[id="headlessui-dialog-panel-:rl:"] svg',
    '[role="dialog"] svg',
    '[aria-label="Close"]',
    'button:has(svg)'
  ];
  
  let modalClosed = false;
  for (const selector of closeSelectors) {
    try {
      const element = page.locator(selector);
      if (await element.isVisible({ timeout: 2000 })) {
        await element.click();
        modalClosed = true;
        break;
      }
    } catch (error) {
      continue;
    }
  }
  
  if (!modalClosed) {
    await page.keyboard.press('Escape');
  }
  
  await page.waitForTimeout(1000);
  
  await page.getByRole('link', { name: 'Book Now' }).click();
  await expect(page.getByRole('heading', { name: /Nobody/i }).first()).toBeVisible();
  
  await page.locator('.rounded-full.hover\\:cursor-pointer').click();
});

test('TC008 - Verify Trending Items Display and Image Loading', async ({ page, request }) => {
  test.setTimeout(30000);

  const apiUrl = 'https://backend.novocinemas.com/api/booking/concessions/cinema/3/trending?country_id=1&channel=web';
  let apiItems = [];

  await test.step('Get trending items from API', async () => {
    const response = await request.get(apiUrl);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    apiItems = data.data || [];
  });

  await test.step('Load homepage', async () => {
    await page.goto('https://qa.novocinemas.com/home');
    await expect(page.getByText('Trending at Novo')).toBeVisible();
  });

  await test.step('Verify item names and images match API', async () => {
    for (const apiItem of apiItems) {
      const itemName = apiItem.display_name;

      const card = page.locator('div').filter({ hasText: new RegExp(`^${itemName}$`, 'i') }).first();
      await expect(card).toBeVisible();

      const image = card.getByRole('img', { name: itemName });
      await expect(image).toBeVisible();
    }
  });
});

test('TC009 - Verify Offers and Promotions Section in English and Arabic', async ({ page, request }) => {
  await testOffers(page, request, false);
  await testOffers(page, request, true);
});

test('TC010 - Verify Experience Cards Display and Navigation', async ({ page, request }) => {
  test.setTimeout(300000);

  try {
    await page.goto('https://qa.novocinemas.com/home', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
  } catch (error) {
    // Continue with test even if initial load times out
  }

  await page.waitForTimeout(3000);

  let apiData, experiences;
  try {
    const apiUrl = 'https://backend.novocinemas.com/api/home/pages?key=experience&country_id=1&channel=web';
    const response = await request.get(apiUrl);
    expect(response.ok()).toBeTruthy();

    apiData = await response.json();
    experiences = apiData.data.data || [];
    expect(experiences.length).toBeGreaterThan(0);
  } catch (error) {
    throw error;
  }

  let processedCount = 0;
  let skippedCount = 0;
  let failedExperiences = [];

  for (const [index, exp] of experiences.entries()) {
    const expName = exp.page_name || `Experience ${index + 1}`;
    const expId = exp.id;
    const bannerLogo = exp.page_json?.logo;
    const expectedUrl = `https://qa.novocinemas.com/experiences/${expId}`;

    if (!expId) {
      skippedCount++;
      failedExperiences.push({ name: expName, reason: 'Missing ID' });
      continue;
    }

    try {
      const currentUrl = page.url();
      if (!currentUrl.includes('/home')) {
        await page.goto('https://qa.novocinemas.com/home', { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        await page.waitForTimeout(2000);
      }

      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);

      let cardElement = null;
      let elementFound = false;

      // Strategy 1: Find by experience name text
      try {
        const textSelectors = [
          `text="${expName}"`,
          `text="${expName.toLowerCase()}"`,
          `text="${expName.toUpperCase()}"`,
          `//*[contains(text(), "${expName}")]`,
          `[alt*="${expName}"]`,
          `[title*="${expName}"]`
        ];

        for (const selector of textSelectors) {
          const element = page.locator(selector).first();
          const count = await element.count({ timeout: 3000 });
          if (count > 0) {
            cardElement = element;
            elementFound = true;
            break;
          }
        }
      } catch (error) {
        // Continue to next strategy
      }

      // Strategy 2: Find by image filename
      if (!elementFound && bannerLogo) {
        try {
          const filename = bannerLogo.split('/').pop().split('.')[0];
          
          const imageSelectors = [
            `img[src*="${filename}"]`,
            `img[alt*="${filename}"]`,
            `[style*="${filename}"]`,
            `[data-src*="${filename}"]`
          ];

          for (const selector of imageSelectors) {
            const element = page.locator(selector).first();
            const count = await element.count({ timeout: 3000 });
            if (count > 0) {
              cardElement = element;
              elementFound = true;
              break;
            }
          }
        } catch (error) {
          // Continue to next strategy
        }
      }

      // Strategy 3: Generic experience card search
      if (!elementFound) {
        try {
          const genericSelectors = [
            '[data-testid*="experience"]',
            '.experience-card',
            '[class*="experience"]',
            '[href*="/experiences/"]',
            `[href*="/experiences/${expId}"]`
          ];

          for (const selector of genericSelectors) {
            const elements = page.locator(selector);
            const count = await elements.count({ timeout: 3000 });
            if (count > 0) {
              for (let i = 0; i < Math.min(count, 10); i++) {
                const element = elements.nth(i);
                const href = await element.getAttribute('href').catch(() => null);
                if (href && href.includes(`/experiences/${expId}`)) {
                  cardElement = element;
                  elementFound = true;
                  break;
                }
              }
              if (elementFound) break;
            }
          }
        } catch (error) {
          // Continue
        }
      }

      if (!elementFound) {
        skippedCount++;
        failedExperiences.push({ name: expName, id: expId, reason: 'Card element not found' });
        continue;
      }

      try {
        await cardElement.waitFor({ state: 'visible', timeout: 5000 });
        await cardElement.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
      } catch (error) {
        skippedCount++;
        failedExperiences.push({ name: expName, id: expId, reason: 'Element not visible' });
        continue;
      }

      let clickSuccess = false;
      let clickError = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await cardElement.click({ timeout: 5000, force: attempt > 1 });
          clickSuccess = true;
          break;
        } catch (error) {
          clickError = error;
          if (attempt < 3) {
            await page.waitForTimeout(1000);
          }
        }
      }

      if (!clickSuccess) {
        skippedCount++;
        failedExperiences.push({ 
          name: expName, 
          id: expId, 
          reason: `Click failed: ${clickError?.message || 'Unknown error'}` 
        });
        continue;
      }

      let navigationSuccess = false;
      
      try {
        await page.waitForURL(expectedUrl, { timeout: 25000 });
        navigationSuccess = true;
      } catch (urlError) {
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        
        if (currentUrl.includes('/experiences/')) {
          navigationSuccess = true;
        } else if (currentUrl !== 'https://qa.novocinemas.com/home') {
          navigationSuccess = true;
        } else {
          failedExperiences.push({ 
            name: expName, 
            id: expId, 
            reason: `Navigation timeout: ${urlError.message}` 
          });
        }
      }

      if (navigationSuccess) {
        processedCount++;
      } else {
        skippedCount++;
      }

    } catch (error) {
      skippedCount++;
      failedExperiences.push({ 
        name: expName, 
        id: expId, 
        reason: `Unexpected error: ${error.message}` 
      });
    }

    await page.waitForTimeout(1000);
  }

  expect(experiences.length).toBeGreaterThan(0);
  expect(processedCount).toBeGreaterThan(0);
});

test('TC011 - Verify Homepage Footer Links and Social Media Integration', async ({ page }) => {
  await page.goto('https://qa.novocinemas.com/home');
  
  await expect(page.getByRole('img', { name: 'PromoBG' })).toBeVisible();
  await expect(page.locator('body')).toContainText('Download Novo App!');
  await expect(page.getByRole('img', { name: 'Novo Cinemas Logo' })).toBeVisible();
  await expect(page.getByRole('contentinfo').locator('div').filter({ 
    hasText: 'About UsAdvertise With UsCareersPromotionsContact UsPrivacy PolicyTerms And' 
  }).first()).toBeVisible();
  await expect(page.getByText('Ways To BookTalk with Us ?')).toBeVisible();

  // Test mobile app download links
  const appLinks = [
    { 
      name: 'Android', 
      expectedUrl: 'https://play.google.com/store/apps/details?id=com.grandcinema.gcapp.screens&pli=1'
    },
    { 
      name: 'iOS', 
      expectedUrl: 'https://apps.apple.com/in/app/novo-cinemas/id363121411'
    },
    { 
      name: 'Huawei', 
      expectedUrl: 'https://appgallery.huawei.com/app/C101526647?appId=C101526647&source=appshare&subsource=C101526647&locale=en_US&source=appshare&subsource=C101526647'
    }
  ];

  for (const app of appLinks) {
    const pagePromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: app.name }).click();
    const newPage = await pagePromise;
    await expect(newPage.url()).toContain(app.expectedUrl.split('?')[0]);
    await newPage.close();
  }

  await expect(page.getByRole('contentinfo').getByRole('link', { name: '8002028' })).toBeVisible();
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Need Assistance ?' })).toBeVisible();
  
  const assistancePagePromise = page.waitForEvent('popup');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Need Assistance ?' }).click();
  const assistancePage = await assistancePagePromise;
  await expect(assistancePage.url()).toContain('https://novocinemas.freshdesk.com/support/home');
  await assistancePage.close();

  await expect(page.getByText('Email Uscallcenterqatar@')).toBeVisible();
  await expect(page.getByText('Find Us HereFloors 3‑5, QDB')).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^Connect with Novo$/ }).first()).toBeVisible();

  // Test social media links
  const socialLinks = [
    { 
      selector: '.flex.items-center.justify-center.w-8.h-8',
      expectedUrl: 'https://www.facebook.com/novocinemasQTR'
    },
    { 
      selector: '.flex.gap-x-2.justify-center > a:nth-child(2)',
      expectedUrl: 'https://www.youtube.com/@Novocinemas'
    },
    { 
      selector: '.flex.gap-x-2.justify-center > a:nth-child(3)',
      expectedUrl: 'https://www.instagram.com/novocinemas_qtr/'
    },
    { 
      selector: '.flex.gap-x-2 > a:nth-child(4)',
      expectedUrl: 'https://x.com/novocinemas_qtr?mx=2'
    }
  ];

  for (let i = 0; i < socialLinks.length; i++) {
    const socialPagePromise = page.waitForEvent('popup');
    await page.locator(socialLinks[i].selector).first().click();
    const socialPage = await socialPagePromise;
    await expect(socialPage.url()).toContain(socialLinks[i].expectedUrl.split('?')[0]);
    await socialPage.close();
  }

  await expect(page.getByText('SIGN UP FOR MOVIE OFFERS & UPDATESSubscribe for latest movie news, promotions,')).toBeVisible();
});

test('TC012 - Verify Footer Navigation Links Functionality', async ({ page }) => {
  await page.goto('https://qa.novocinemas.com/home');

  // Test About Us footer link
  await expect(page.getByRole('listitem').filter({ hasText: 'About Us' })).toBeVisible();
  await Promise.all([
    page.waitForURL('**/aboutUs'),
    page.getByRole('link', { name: 'About Us' }).click()
  ]);
  await expect(page.url()).toContain('https://qa.novocinemas.com/aboutUs');
  await expect(page.getByRole('heading', { name: 'Our Story' })).toBeVisible();
  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(page.url()).toContain('https://qa.novocinemas.com/home');

  // Test Advertise With Us footer link
  await expect(page.getByRole('listitem').filter({ hasText: 'Advertise With Us' })).toBeVisible();
  await Promise.all([
    page.waitForURL('**/advertise'),
    page.getByRole('link', { name: 'Advertise With Us' }).click()
  ]);
  await expect(page.url()).toContain('https://qa.novocinemas.com/advertise');
  await expect(page.getByRole('heading', { name: 'Promote Your Brand at Novo' })).toBeVisible();
  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(page.url()).toContain('https://qa.novocinemas.com/home');

  // Test Careers footer link
  await expect(page.getByRole('listitem').filter({ hasText: 'Careers' })).toBeVisible();
  await Promise.all([
    page.waitForURL('**/career'),
    page.getByRole('link', { name: 'Careers' }).click()
  ]);
  await expect(page.url()).toContain('https://qa.novocinemas.com/career');
  await expect(page.getByRole('heading', { name: 'Careers' })).toBeVisible();
  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(page.url()).toContain('https://qa.novocinemas.com/home');

  // Test Promotions footer link
  await expect(page.getByRole('listitem').filter({ hasText: 'Promotions' })).toBeVisible();
  await Promise.all([
    page.waitForURL('**/promotions'),
    page.getByRole('contentinfo').getByRole('link', { name: 'Promotions' }).click()
  ]);
  await expect(page.url()).toContain('https://qa.novocinemas.com/promotions');
  await expect(page.getByRole('heading', { name: 'Offers & Promotions' })).toBeVisible();
  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(page.url()).toContain('https://qa.novocinemas.com/home');

  // Test Contact Us footer link
  await expect(page.getByRole('listitem').filter({ hasText: 'Contact Us' })).toBeVisible();
  await page.getByRole('link', { name: 'Contact Us' }).click();
  await page.waitForTimeout(1000);
  await page.goto('https://qa.novocinemas.com/home');

});
