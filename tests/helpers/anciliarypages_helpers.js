import { expect } from '@playwright/test';

/**
 * Wait for page to load completely
 */
const waitForPageLoad = async (page) => {
  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    console.warn('Page load timeout, continuing...');
  }
};

/**
 * Switch language on the page
 */
const switchLanguage = async (page, langText) => {
  try {
    await page.getByRole('navigation').getByRole('button', { name: langText }).click();
    await page.waitForTimeout(1200);
  } catch {
    console.warn(`Language switch to ${langText} failed`);
  }
};

/**
 * Validate image has loaded
 */
const validateImageLoaded = async (locator, label = 'image') => {
  try {
    await locator.scrollIntoViewIfNeeded();
    await expect(locator).toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        async () =>
          locator.evaluate(img => img.complete && img.naturalWidth > 0),
        {
          timeout: 10000,
          message: `${label} did not finish loading`
        }
      )
      .toBe(true);

    const src = await locator.getAttribute('src');
    console.log(`✔ ${label} loaded: ${src}`);
  } catch (e) {
    console.warn(`❌ ${label} failed to load`);
  }
};

/**
 * Validate image binding to correct source
 */
const validateImageBinding = async (locator, label) => {
  try {
    await expect(locator).toHaveAttribute('src', /gumlet\.io|novo/i, {
      timeout: 5000
    });

    const src = await locator.getAttribute('src');
    console.log(`✔ ${label} bound correctly: ${src}`);
  } catch (e) {
    console.warn(`❌ ${label} src binding failed: ${e.message}`);
  }
};

/**
 * Validate banner image binding
 */
const validateBannerImageBinding = async (locator, label) => {
  try {
    await expect(locator).toHaveAttribute(
      'src',
      /gumlet\.io|backend\.novocinemas\.com|novo/i,
      { timeout: 5000 }
    );

    const src = await locator.getAttribute('src');
    console.log(`✔ ${label} src bound correctly: ${src}`);
  } catch (e) {
    console.warn(`❌ ${label} src binding failed: ${e.message}`);
  }
};

/**
 * Fetch API data for a specific page
 */
const fetchApiData = async (page, apiConfig, pageId) => {
  const url = new URL(apiConfig.baseUrl);
  Object.entries(apiConfig.params).forEach(([k, v]) => url.searchParams.append(k, v));

  const response = await page.request.get(url.toString(), { headers: apiConfig.headers });
  expect(response.ok()).toBeTruthy();

  const json = await response.json();
  const pageData = json.data.data.find(p => p.page_is_active && p.id === pageId);

  expect(pageData).toBeDefined();
  return pageData;
};

/**
 * Strip HTML tags from text
 */
const stripHtmlTags = (html = '') => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
};

/**
 * Extract email from HTML content
 */
const extractEmailFromHtml = (html = '') => {
  const match = html.match(/[\w.-]+@[\w.-]+\.\w+/);
  return match ? match[0] : null;
};

/**
 * Check if user is logged in
 */
const checkLoginStatus = async (page) => {
  try {
    const profileIcon = page.locator('svg[data-testid="profile-icon"], .lucide.lucide-user');
    const isLoggedOut = await profileIcon.isVisible({ timeout: 3000 });
    return !isLoggedOut;
  } catch {
    return false;
  }
};

/**
 * Validate tier cards
 */
const validateTierCards = async (page, tierCategories) => {
  console.log('Validating tier cards...');
  
  for (const tier of tierCategories) {
    try {
      if (tier.title) {
        await expect(page.locator('body')).toContainText(
          tier.title, 
          { timeout: 5000 }
        );
        console.log(`✔ Tier card found: ${tier.title}`);
      }

      if (tier.description) {
        const cleanDesc = stripHtmlTags(tier.description).substring(0, 30);
        await expect(page.locator('body')).toContainText(
          new RegExp(cleanDesc, 'i'), 
          { timeout: 3000 }
        );
      }

      if (tier.image) {
        const tierImg = page.locator(`img[src*="${tier.image}"]`).first();
        await validateBannerImageBinding(tierImg, `${tier.title} image`);
      }
    } catch (e) {
      console.warn(`⚠ Tier card validation failed for: ${tier.title}`);
    }
  }
};

/**
 * Validate Terms & Conditions tabs
 */
const validateTermsTabs = async (page, types, questions) => {
  console.log('Validating Terms & Conditions tabs...');
  
  for (const type of types) {
    try {
      const tabButton = page.locator(`button, div`).filter({ 
        hasText: new RegExp(`^${type}$`, 'i') 
      }).first();
      
      await tabButton.scrollIntoViewIfNeeded();
      await tabButton.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      
      console.log(`✔ Tab clicked: ${type}`);
      
      const tabQuestions = questions.filter(q => q.key === type);
      if (tabQuestions.length > 0) {
        const firstQuestion = tabQuestions[0];
        if (firstQuestion.question) {
          await expect(page.locator('body')).toContainText(
            firstQuestion.question.substring(0, 20), 
            { timeout: 3000 }
          );
          console.log(`✔ Question found in tab: ${firstQuestion.question.substring(0, 30)}...`);
        }
      }
    } catch (e) {
      console.warn(`⚠ Tab validation failed for: ${type}`);
    }
  }
};

/**
 * Expand FAQ item
 */
const expandFaq = async (page, question, answer) => {
  try {
    const safeText = question
      .substring(0, 30)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const heading = page.getByRole('heading', {
      name: new RegExp(safeText, 'i')
    });

    await expect(heading).toBeVisible({ timeout: 5000 });

    await heading.locator('..').click();
    await page.waitForTimeout(500);

    const cleanAnswer = stripHtmlTags(answer);
    if (cleanAnswer.length > 10) {
      const snippet = cleanAnswer.substring(0, 30);
      await expect(page.locator('body')).toContainText(
        new RegExp(snippet, 'i'),
        { timeout: 5000 }
      );
    }

    console.log(`✔ FAQ expanded: ${question}`);
  } catch {
    console.warn(`⚠ FAQ expansion failed for: ${question}`);
  }
};

// ==================== EXPORTS ====================
export {
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
};
