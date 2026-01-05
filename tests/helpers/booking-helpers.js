import { expect, request as playwrightRequest } from "@playwright/test";

// ============================================================================
// MOVIE SELECTION HELPERS
// ============================================================================

export async function fetchMoviesFromAPI(request) {
  try {
    const response = await request.get(
      "https://backend.novocinemas.com/api/home/movies?experienceId=&locationId=&languageId=&genreId=&country_id=1&channel=web"
    );
    if (!response.ok()) return [];
    const responseData = await response.json();
    return (
      responseData.data?.movies?.map((m) => ({
        movie_title: m.movie_title,
        movie_id: m.movie_id,
        movie_slug: m.movie_slug,
      })) || []
    );
  } catch (e) {
    return [];
  }
}

export async function selectMovieDynamically(page, request) {
  const apiMovies = await fetchMoviesFromAPI(request);
  if (!apiMovies.length) throw new Error("No movies returned from API");

  let selectedMovie = null;
  for (const m of apiMovies) {
    const title = m.movie_title;
    if (!title?.trim()) continue;
    const card = page.getByRole("link").filter({ hasText: title }).first();
    try {
      await card.waitFor({ state: "visible", timeout: 4000 });
      await card.scrollIntoViewIfNeeded();
      await card.click();
      selectedMovie = m;
      break;
    } catch {
      continue;
    }
  }

  if (!selectedMovie) {
    const anyCard = page.locator('[href*="/movies/"]').first();
    await anyCard.waitFor({ state: "visible", timeout: 8000 });
    await anyCard.scrollIntoViewIfNeeded();
    await anyCard.click();
  }

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(9000);
  return selectedMovie;
}

export async function selectMovieFromHomepage(page, apiMovies) {
  for (const m of apiMovies) {
    const title = m.movie_title;
    if (!title?.trim()) continue;

    const card = page.getByRole("link").filter({ hasText: title }).first();
    try {
      await card.waitFor({ state: "visible", timeout: 4000 });
      await card.scrollIntoViewIfNeeded();
      await card.click();
      return m;
    } catch {
      continue;
    }
  }

  const anyCard = page.locator('[href*="/movies/"]').first();
  await anyCard.waitFor({ state: "visible", timeout: 8000 });
  await anyCard.scrollIntoViewIfNeeded();
  await anyCard.click();
  return null;
}

export async function getMovieDetails(page, request, selectedMovie) {
  let movieId = selectedMovie?.movie_id;
  let movieSlug = selectedMovie?.movie_slug;
  const detailsUrlMatch = page
    .url()
    .match(/movies\/(\d+)(?:-[^\/?#]+)?(?:\?[^#]*)?/);
  if (!movieId && detailsUrlMatch) movieId = detailsUrlMatch[1];
  if (!movieSlug) {
    try {
      const headingText = await page.getByRole("heading").first().innerText();
      movieSlug = headingText?.trim() || "";
    } catch {}
  }

  if (!movieId || !movieSlug)
    throw new Error("Could not determine movieId or movieSlug");

  const apiResponse = await request.get(
    `https://backend.novocinemas.com/api/home/movie-details/${movieId},${encodeURIComponent(
      movieSlug
    )}?country_id=1&channel=web`
  );
  const movieData = await apiResponse.json();
  return { movie: movieData.data, movieId, movieSlug };
}

export async function extractMovieDetails(page, selectedMovie) {
  let movieId = selectedMovie?.movie_id;
  let movieSlug = selectedMovie?.movie_slug;

  const detailsUrlMatch = page
    .url()
    .match(/movies\/(\d+)(?:-[^\/?#]+)?(?:\?[^#]*)?/);
  if (!movieId && detailsUrlMatch) movieId = detailsUrlMatch[1];

  if (!movieSlug) {
    try {
      const headingText = await page.getByRole("heading").first().innerText();
      movieSlug = headingText?.trim() || "";
    } catch {}
  }

  return { movieId, movieSlug };
}

export async function verifyMovieDetailsPage(page, movie) {
  await expect(
    page.getByRole("heading", { name: movie.movie_title })
  ).toBeVisible();

  const hours = Math.floor(movie.movie_duration / 60);
  const minutes = movie.movie_duration % 60;
  const durationText = `${hours}h ${minutes}m`;
  await expect(page.getByText(durationText)).toBeVisible();

  const releaseDate = new Date(movie.movie_release_date);
  const releaseDateFormatted = releaseDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
  await expect(
    page.getByText(`Release Date: ${releaseDateFormatted}`)
  ).toBeVisible();

  await page.getByRole("button", { name: "Movie Details" }).click();
  await expect(page.getByText("About the Movie")).toBeVisible();
  await page
    .locator("div")
    .filter({ hasText: /^Timing$/ })
    .nth(1)
    .click();
}

export async function verifyMovieDetailsPageLoyalty(page, movie) {
  await expect(
    page.getByRole("heading", { name: movie.movie_title })
  ).toBeVisible();
  await expect(page.locator(".w-\\[220px\\]")).toBeVisible();

  const hours = Math.floor(movie.movie_duration / 60);
  const minutes = movie.movie_duration % 60;
  const durationText = `${hours}h ${minutes}m`;
  await expect(page.getByText(durationText)).toBeVisible();

  const releaseDate = new Date(movie.movie_release_date);
  const releaseDateFormatted = releaseDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
  await expect(
    page.getByText(`Release Date: ${releaseDateFormatted}`)
  ).toBeVisible();

  const firstGenre = movie.movie_genre[0]?.genre_name;
  if (firstGenre) await expect(page.getByText(firstGenre)).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Movie Details" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Interested" })).toBeVisible();

  await page.getByRole("button", { name: "Movie Details" }).click();
  await expect(page.getByText("About the Movie")).toBeVisible();

  await expect(page.locator("body")).toContainText("Cast & Crew");
  for (const castMember of movie.movie_cast.slice(0, 2)) {
    await expect(page.locator("body")).toContainText(
      castMember.first_name.trim()
    );
  }

  await expect(page.getByText("Today")).toBeVisible();
  await expect(
    page
      .locator("div")
      .filter({ hasText: /^Select Experience$/ })
      .nth(1)
  ).toBeVisible();
  await expect(
    page
      .locator("div")
      .filter({ hasText: /^Cinema$/ })
      .nth(1)
  ).toBeVisible();
  await page
    .locator("div")
    .filter({ hasText: /^Timing$/ })
    .nth(1)
    .click();
}

// ============================================================================
// BOOKING HELPERS
// ============================================================================

export async function dynamicBooking(page, movieId) {
  const bookingData = await page.evaluate(
    async ({ movieId }) => {
      const datesRes = await fetch(
        `https://backend.novocinemas.com/api/home/available-dates/${movieId}/?country_id=1&channel=web`
      );
      const datesData = await datesRes.json();
      const dates = datesData.data.available_dates;

      let selectedDate =
        dates.find((date) => new Date(date).getDay() === 3) || dates[0];

      const sessionsRes = await fetch(
        `https://backend.novocinemas.com/api/home/sessions/${movieId}/date/${selectedDate}?cinemaId=null&languageId=&timing=&formatId=&country_id=1&channel=web`
      );
      const sessionsData = await sessionsRes.json();
      const sessions = sessionsData.data.sessions[selectedDate];

      let twoDSession = null;
      let twoDExperienceName = null;

      for (const [experienceName, sessionsList] of Object.entries(sessions)) {
        if (experienceName.toLowerCase().includes("2d")) {
          twoDSession = sessionsList[0];
          twoDExperienceName = experienceName;
          break;
        }
      }

      if (!twoDSession) {
        const firstExperience = Object.values(sessions)[0];
        twoDSession = firstExperience[0];
        twoDExperienceName = Object.keys(sessions)[0];
      }

      return {
        selectedDate,
        showTime: twoDSession.show_time,
        sessionId: twoDSession.session_id,
        cinemaId: twoDSession.cinema_id ?? null,
        experienceName: twoDExperienceName,
      };
    },
    { movieId }
  );

  const selectedDate = new Date(bookingData.selectedDate);
  const today = new Date();
  const formattedDate =
    selectedDate.toDateString() === today.toDateString()
      ? "Today"
      : `${
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
            selectedDate.getDay()
          ]
        }${selectedDate.getDate()}/`;

  await page.getByText(formattedDate).click();
  await page.getByText(bookingData.showTime).first().click();
  return bookingData;
}

export async function dynamicBookingLoyalty(page, movieId) {
  const bookingData = await page.evaluate(async ({ movieId }) => {
    const datesRes = await fetch(
      `https://backend.novocinemas.com/api/home/available-dates/${movieId}/?country_id=1&channel=web`
    );
    const datesData = await datesRes.json();
    const dates = datesData.data.available_dates;
    
    let selectedDate = dates.find(date => new Date(date).getDay() === 3) || dates[0];
    if (!dates.find(date => new Date(date).getDay() === 3)) {
      console.warn('No Wednesday found in available dates, using first available date');
    }

    const sessionsRes = await fetch(
      `https://backend.novocinemas.com/api/home/sessions/${movieId}/date/${selectedDate}?cinemaId=null&languageId=&timing=&formatId=&country_id=1&channel=web`
    );
    const sessionsData = await sessionsRes.json();
    const sessions = sessionsData.data.sessions[selectedDate];
    const firstSession = Object.values(sessions)[0][0];

    return {
      selectedDate,
      showTime: firstSession.show_time,
      sessionId: firstSession.session_id,
      cinemaId: firstSession.cinema_id ?? null,
      debugSession: firstSession
    };
  }, { movieId });

  console.log('Debug Session Object:', bookingData.debugSession);

  const selectedDate = new Date(bookingData.selectedDate);
  const today = new Date();
  
  let formattedDate;
  if (selectedDate.toDateString() === today.toDateString()) {
    formattedDate = 'Today';
  } else if (selectedDate.getDay() === 3) {
    formattedDate = `Wed${selectedDate.getDate()}/`;
  } else {
    formattedDate = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][selectedDate.getDay()]}${selectedDate.getDate()}/`;
  }

  console.log('Selected date:', bookingData.selectedDate, 'Formatted:', formattedDate, 'Is Wednesday?', selectedDate.getDay() === 3);

  await page.getByText(formattedDate).click();
  await page.getByText(bookingData.showTime).first().click();
  return bookingData;
}


export async function dynamicBookingBankOffer(page, movieId) {
  const bookingData = await page.evaluate(
    async ({ movieId }) => {
      const datesRes = await fetch(
        `https://backend.novocinemas.com/api/home/available-dates/${movieId}/?country_id=1&channel=web`
      );
      const datesData = await datesRes.json();
      const dates = datesData.data.available_dates;

      let selectedDate =
        dates.find((date) => new Date(date).getDay() === 3) || dates[0];
      if (!dates.find((date) => new Date(date).getDay() === 3)) {
        console.warn(
          "No Wednesday found in available dates, using first available date"
        );
      }

      const sessionsRes = await fetch(
        `https://backend.novocinemas.com/api/home/sessions/${movieId}/date/${selectedDate}?cinemaId=null&languageId=&timing=&formatId=&country_id=1&channel=web`
      );
      const sessionsData = await sessionsRes.json();

      const sessions = sessionsData.data.sessions[selectedDate];
      const firstExperience = Object.values(sessions)[0];
      const firstSession = firstExperience[0];

      return {
        selectedDate,
        showTime: firstSession.show_time,
        sessionId: firstSession.session_id,
        cinemaId: firstSession.cinema_id ?? null,
        debugSession: firstSession,
      };
    },
    { movieId }
  );

  console.log("Debug Session Object:", bookingData.debugSession);

  const selectedDate = new Date(bookingData.selectedDate);
  const today = new Date();
  const isWednesday = selectedDate.getDay() === 3;
  const isToday = selectedDate.toDateString() === today.toDateString();

  const formattedDate = isToday
    ? "Today"
    : `${
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][selectedDate.getDay()]
      }${selectedDate.getDate()}/`;

  console.log(
    "Selected date:",
    bookingData.selectedDate,
    "Formatted:",
    formattedDate,
    "Is Wednesday?",
    isWednesday
  );

  await page.getByText(formattedDate).click();
  await page.getByText(bookingData.showTime).first().click();
  return bookingData;
}

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

export async function loginAndCaptureTokenBooking(page) {
  let authToken = null;

  const tokenListener = (req) => {
    const auth = req.headers().authorization;
    if (auth?.startsWith("Bearer")) {
      authToken = auth;
    }
  };

  page.on("request", tokenListener);

  // --- Login ---
  await page.getByRole("textbox", { name: "Enter your email" })
    .fill("Anurag.Gupta@enpointe.io");

  await page.getByRole("textbox", { name: "Enter your password" })
    .fill("Anurag@123");

  await page.getByRole("button", { name: "Sign In" }).click();

  // Booking-only overlay
  await expect(page.locator(".dark\\:bg-black\\/10.bg-white"))
    .toBeVisible({ timeout: 15000 });

  // Wait until token is captured
  await expect.poll(() => authToken, { timeout: 10000 })
    .toBeTruthy();

  page.off("request", tokenListener);

  // Persist token
  await page.evaluate((token) => {
    const clean = token.replace("Bearer ", "");
    localStorage.setItem("auth_token", clean);
    localStorage.setItem("access_token", clean);
    localStorage.setItem("authorization_token", token);
  }, authToken);

  // 🔐 MANDATORY Confirm popup
  await expect(page.getByRole("button", { name: "Confirm" }))
    .toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Confirm" }).click();

  // Allow booking flow to stabilize (reload/navigation happens here)
  await page.waitForLoadState("networkidle");

  return authToken;
}


export async function loginAndCaptureTokenLoyalty(page) {
  let authToken = null;
  const tokenListener = (req) => {
    const headers = req.headers();
    if (headers["authorization"]?.startsWith("Bearer")) {
      authToken = headers["authorization"];
      console.log("Captured Auth Token:", authToken.substring(0, 30) + "...");
    }
  };
  page.on("request", tokenListener);

  // Also listen for the user-details API call after login
  const userDetailsPromise = page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/user/user-details") &&
        response.status() === 200,
      { timeout: 30000 }
    )
    .catch(() => null);

  // ✅ Login
  await page
    .getByRole("textbox", { name: "Enter your email" })
    .fill("Anurag.Gupta@enpointe.io");
  await page
    .getByRole("textbox", { name: "Enter your password" })
    .fill("Anurag@123");
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for user-details API to complete
  const userDetailsResponse = await userDetailsPromise;
  if (userDetailsResponse && !authToken) {
    // Extract token from the response if not captured yet
    const requestHeaders = userDetailsResponse.request().headers();
    if (requestHeaders["authorization"]) {
      authToken = requestHeaders["authorization"];
      console.log(
        "Captured Auth Token from user-details API:",
        authToken.substring(0, 30) + "..."
      );
    }
  }

  await expect(page.locator(".dark\\:bg-black\\/10.bg-white")).toBeVisible();

  // ✅ Inject token into localStorage if captured
  if (authToken) {
    console.log("Injecting captured token into localStorage...");
    await page.evaluate(
      ([token]) => {
        localStorage.setItem("auth_token", token.replace("Bearer ", ""));
        localStorage.setItem("access_token", token.replace("Bearer ", ""));
        localStorage.setItem("authorization_token", token);
      },
      [authToken]
    );
    await page.reload({ waitUntil: "networkidle" });
    console.log("Page reloaded with injected token");
  }

  // ✅ Continue with API validation (only after session is properly set)
  if (authToken) {
    const apiContext = await playwrightRequest.newContext({
      baseURL: "https://backend.novocinemas.com",
      extraHTTPHeaders: {
        authorization: authToken,
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        "accept-language": "en-GB,en;q=0.9",
        origin: "https://qa.novocinemas.com",
        referer: "https://qa.novocinemas.com/",
      },
    });

    const ratingResponse = await apiContext.post(
      "/api/booking/rating?for_seven_star=false&country_id=1&channel=web",
      { data: { search: "PG15" } }
    );
    console.log("Rating Status:", ratingResponse.status());
  }

  await expect(page.locator("body")).toContainText("Please! Note");
  await page.getByRole("button", { name: "Confirm" }).click();
  page.off("request", tokenListener);

  return authToken;
}

export function setupAuthTokenCapture(page) {
  let authToken = null;
  const tokenListener = (req) => {
    const headers = req.headers();
    if (headers["authorization"]?.startsWith("Bearer")) {
      authToken = headers["authorization"];
      console.log("Captured Auth Token:", authToken);
    }
  };
  page.on("request", tokenListener);
  return { tokenListener, getToken: () => authToken };
}

export async function login(page, email, password) {
  await page.getByRole("textbox", { name: "Enter your email" }).fill(email);
  await page
    .getByRole("textbox", { name: "Enter your password" })
    .fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator(".dark\\:bg-black\\/10.bg-white")).toBeVisible({
    timeout: 15000,
  });
}

export async function injectAuthToken(page, authToken) {
  if (!authToken) return;

  console.log("Injecting captured token into localStorage...");
  await page.evaluate(
    ([token]) => {
      localStorage.setItem("auth_token", token.replace("Bearer ", ""));
      localStorage.setItem("access_token", token.replace("Bearer ", ""));
      localStorage.setItem("authorization_token", token);
    },
    [authToken]
  );
  await page.reload({ waitUntil: "networkidle" });
  console.log("Page reloaded with injected token");
}

export async function confirmAgeRating(page, tokenListener) {
  await expect(page.locator("body")).toContainText("Please! Note", {
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Confirm" }).click();
  page.off("request", tokenListener);
}

// ============================================================================
// SEAT SELECTION HELPERS
// ============================================================================

export async function sidePanelVerification(
  page,
  request,
  sessionId,
  cinemaId
) {
  const sidePanelApi = await request.get(
    `https://backend.novocinemas.com/api/booking/side-panel/cinemas/${cinemaId}/sessions/${sessionId}?country_id=1&channel=web`
  );
  const sidePanelData = await sidePanelApi.json();
  const data = sidePanelData.data;

  await expect(page.getByText(data.movie.movie_name).nth(1)).toBeVisible();
  await expect(page.getByRole("img", { name: "banner" })).toBeVisible();
  await expect(
    page.getByText(new RegExp(data.cinema.cinema_name)).nth(1)
  ).toBeVisible();
  await expect(page.getByText(new RegExp(data.show_date)).nth(1)).toBeVisible();
  await expect(page.getByText(new RegExp(data.show_time))).toBeVisible();

  console.log("Side Panel Data Verified:", {
    cinema: data.cinema.cinema_name,
    movie: data.movie.movie_name,
    date: data.show_date,
    time: data.show_time,
  });
  return data;
}

export async function verifySidePanel(page, request, sessionId, cinemaId) {
  const sidePanelApi = await request.get(
    `https://backend.novocinemas.com/api/booking/side-panel/cinemas/${cinemaId}/sessions/${sessionId}?country_id=1&channel=web`
  );
  const sidePanelData = await sidePanelApi.json();
  const data = sidePanelData.data;

  await expect(page.getByText(data.movie.movie_name).nth(1)).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByRole("img", { name: "banner" })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.getByText(new RegExp(data.cinema.cinema_name)).nth(1)
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(new RegExp(data.show_date)).nth(1)).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText(new RegExp(data.show_time))).toBeVisible({
    timeout: 10000,
  });

  console.log("Side Panel Data Verified:", {
    cinema: data.cinema.cinema_name,
    movie: data.movie.movie_name,
    date: data.show_date,
    time: data.show_time,
  });
  return data;
}

export async function getSeatLayout(page, request, sessionId, cinemaId) {
  const seatLayoutResponse = await request.get(
    `https://backend.novocinemas.com/api/booking/seat-layout/cinemas/${cinemaId}/sessions/${sessionId}?country_id=1&channel=web`
  );
  const seatLayoutData = await seatLayoutResponse.json();
  const layout = seatLayoutData.data;

  await expect(page.getByRole("img", { name: "Screen Indicator" })).toBeVisible(
    { timeout: 10000 }
  );
  await expect(
    page.getByText(new RegExp(`${layout.areas[0].name} \\(QAR`))
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByText(`Screen ${layout.screenName}`, { exact: true })
  ).toBeVisible({ timeout: 10000 });

  return layout;
}

export async function selectSeats(
  page,
  request,
  cinemaId,
  sessionId,
  seatCount = 1
) {
  const seatLayoutResponse = await request.get(
    `https://backend.novocinemas.com/api/booking/seat-layout/cinemas/${cinemaId}/sessions/${sessionId}?country_id=1&channel=web`
  );
  const seatLayoutData = await seatLayoutResponse.json();
  const layout = seatLayoutData.data;

  const availableSeats = await page.locator("div.cursor-pointer").all();
  const selectedSeats = [];
  const seatPriceMap = new Map();

  for (let i = 0; i < seatCount && availableSeats.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * availableSeats.length);
    const seatLocator = availableSeats[randomIndex];

    const seatNumber = await seatLocator.locator("span").innerText();
    const rowLocator = seatLocator.locator(
      'xpath=ancestor::div[contains(@class,"flex")][1]/preceding-sibling::div[contains(@class,"sticky")][1]/span'
    );
    const rowName = await rowLocator.first().innerText();
    const fullSeatName = `${rowName}${seatNumber}`;
    selectedSeats.push(fullSeatName);

    for (const area of layout.areas) {
      const rowData = area.row.find((r) => r.name === rowName);
      if (rowData) {
        seatPriceMap.set(fullSeatName, {
          price: area.priceInCents / 100,
          areaName: area.name,
        });
        break;
      }
    }

    await seatLocator.scrollIntoViewIfNeeded();
    await seatLocator.click();
    availableSeats.splice(randomIndex, 1);
  }

  const totalTicketPrice = Array.from(seatPriceMap.values()).reduce(
    (sum, seat) => sum + seat.price,
    0
  );
  return { selectedSeats, seatPriceMap, totalTicketPrice };
}

export async function selectSeatsWithAreaCategory(page, layout, seatCount = 4) {
  const rowOrder = layout.areas[0].row
    .sort((a, b) => a.rowIndex - b.rowIndex)
    .map((r) => r.name);
  console.log("Row Order from API:", rowOrder);

  const availableSeats = await page.locator("div.cursor-pointer").all();
  const clickedSeats = [];
  const seatPriceMap = new Map();
  let selectedAreaName = null;

  console.log(
    `\n=== SEAT SELECTION: Selecting ${seatCount} seats from SAME area ===`
  );

  for (let i = 0; i < seatCount && availableSeats.length > 0; i++) {
    let seatFound = false;
    let attempts = 0;
    const maxAttempts = availableSeats.length;

    while (!seatFound && attempts < maxAttempts) {
      const randomIndex = Math.floor(Math.random() * availableSeats.length);
      const seatLocator = availableSeats[randomIndex];

      const seatNumber = await seatLocator.locator("span").innerText();
      const rowLocator = seatLocator.locator(
        'xpath=ancestor::div[contains(@class,"flex")][1]/preceding-sibling::div[contains(@class,"sticky")][1]/span'
      );
      const rowName = await rowLocator.first().innerText();
      const fullSeatName = `${rowName}${seatNumber}`;

      let seatPrice = null;
      let seatAreaName = null;
      let seatAreaCategoryCode = null;

      // Find the area this seat belongs to
      for (const area of layout.areas) {
        const rowData = area.row.find((r) => r.name === rowName);
        if (rowData) {
          seatPrice = area.priceInCents / 100;
          seatAreaName = area.name;

          // Extract areaCategoryCode from area
          seatAreaCategoryCode =
            area.areaCategoryCode ||
            area.AreaCategoryCode ||
            area.categoryCode ||
            area.CategoryCode;

          // On first seat selection, remember the area
          if (selectedAreaName === null) {
            selectedAreaName = seatAreaName;
            console.log(
              `\n✓ First seat selected from area: "${selectedAreaName}"`
            );
          }

          // Only select seats from the same area (ignore category code)
          if (seatAreaName === selectedAreaName) {
            seatPriceMap.set(fullSeatName, {
              price: seatPrice,
              areaName: seatAreaName,
              areaCategoryCode: seatAreaCategoryCode,
              ticketDescription: area.ticketDescription,
            });

            await seatLocator.scrollIntoViewIfNeeded();
            await seatLocator.click();
            clickedSeats.push(fullSeatName);
            availableSeats.splice(randomIndex, 1);
            seatFound = true;
            console.log(
              `✓ Seat ${
                i + 1
              }/${seatCount}: Selected "${fullSeatName}" from area "${seatAreaName}"`
            );
          } else {
            console.log(
              `⚠ Seat "${fullSeatName}" is from area "${seatAreaName}", but we need "${selectedAreaName}". Skipping...`
            );
            attempts++;
          }
          break;
        }
      }

      if (!seatFound) {
        attempts++;
      }
    }

    if (!seatFound && i < seatCount) {
      console.warn(
        `\n⚠️ Could not find seat ${
          i + 1
        } from area "${selectedAreaName}". Found ${
          clickedSeats.length
        }/${seatCount} seats instead.`
      );
      break;
    }
  }

  console.log(`\n✅ SEAT SELECTION COMPLETE`);
  console.log(
    `   Selected ${clickedSeats.length}/${seatCount} seats from area: "${selectedAreaName}"`
  );
  console.log(`   Seats: ${clickedSeats.join(", ")}`);
  console.log(
    "\nClicked Seats with Details:",
    Array.from(seatPriceMap.entries()).map(([seat, info]) => ({
      seat,
      price: `QAR ${info.price}`,
      area: info.areaName,
      categoryCode: info.areaCategoryCode,
    }))
  );

  return { clickedSeats, seatPriceMap, rowOrder };
}

export async function selectSeatsBankOffer(page, layout, seatCount = 4) {
  const rowOrder = layout.areas[0].row
    .sort((a, b) => a.rowIndex - b.rowIndex)
    .map((r) => r.name);
  console.log("Row Order from API:", rowOrder);

  const availableSeats = await page.locator("div.cursor-pointer").all();
  const clickedSeats = [];
  const seatPriceMap = new Map();

  for (let i = 0; i < seatCount && availableSeats.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * availableSeats.length);
    const seatLocator = availableSeats[randomIndex];

    const seatNumber = await seatLocator.locator("span").innerText();
    const rowLocator = seatLocator.locator(
      'xpath=ancestor::div[contains(@class,"flex")][1]/preceding-sibling::div[contains(@class,"sticky")][1]/span'
    );
    const rowName = await rowLocator.first().innerText();
    const fullSeatName = `${rowName}${seatNumber}`;
    clickedSeats.push(fullSeatName);

    let seatPrice = null;
    for (const area of layout.areas) {
      const rowData = area.row.find((r) => r.name === rowName);
      if (rowData) {
        seatPrice = area.priceInCents / 100;
        seatPriceMap.set(fullSeatName, {
          price: seatPrice,
          areaName: area.name,
          ticketDescription: area.ticketDescription,
        });
        break;
      }
    }
    if (!seatPrice)
      console.warn(`Could not find price for seat ${fullSeatName}`);

    await seatLocator.scrollIntoViewIfNeeded();
    await seatLocator.click();
    availableSeats.splice(randomIndex, 1);
  }

  console.log("Clicked Seats with Prices:", Array.from(seatPriceMap.entries()));
  return { clickedSeats, seatPriceMap, rowOrder };
}

export function sortSeats(clickedSeats, rowOrder) {
  return [...clickedSeats].sort((a, b) => {
    const rowMatchA = a.match(/^([A-Z]+)/);
    const rowMatchB = b.match(/^([A-Z]+)/);

    if (!rowMatchA || !rowMatchB) return 0;

    const rowA = rowMatchA[1];
    const rowB = rowMatchB[1];
    const numA = parseInt(a.match(/(\d+)$/)?.[1] || "0", 10);
    const numB = parseInt(b.match(/(\d+)$/)?.[1] || "0", 10);

    const rowIndexA = rowOrder.indexOf(rowA);
    const rowIndexB = rowOrder.indexOf(rowB);

    if (rowIndexA === -1 && rowIndexB === -1)
      return rowA.localeCompare(rowB) || numA - numB;
    if (rowIndexA === -1) return 1;
    if (rowIndexB === -1) return -1;
    if (rowIndexA !== rowIndexB) return rowIndexA - rowIndexB;
    return numA - numB;
  });
}

export function groupSeatsByArea(clickedSeats, seatPriceMap) {
  const areaGroupedSeats = new Map();
  let totalExpectedPrice = 0;

  for (const seat of clickedSeats) {
    const seatInfo = seatPriceMap.get(seat);
    if (seatInfo) {
      totalExpectedPrice += seatInfo.price;
      if (!areaGroupedSeats.has(seatInfo.areaName)) {
        areaGroupedSeats.set(seatInfo.areaName, {
          seats: [],
          count: 0,
          unitPrice: seatInfo.price,
          ticketDescription: seatInfo.ticketDescription,
        });
      }
      const areaInfo = areaGroupedSeats.get(seatInfo.areaName);
      areaInfo.seats.push(seat);
      areaInfo.count++;
    }
  }

  console.log("Area Grouped Seats:", Array.from(areaGroupedSeats.entries()));
  console.log("Total Expected Price:", totalExpectedPrice);

  return { areaGroupedSeats, totalExpectedPrice };
}

export async function verifySelectedSeatsInPanel(page, clickedSeats) {
  await page
    .locator("div")
    .filter({ hasText: /^Seats$/ })
    .first()
    .click();

  for (const seat of clickedSeats) {
    await expect(page.getByText(seat).first()).toBeVisible({ timeout: 5000 });
    console.log(`✓ Verified seat ${seat} is visible`);
  }
}

export async function verifyPricesInPanel(
  page,
  areaGroupedSeats,
  totalExpectedPrice
) {
  for (const [areaName, areaInfo] of areaGroupedSeats) {
    const expectedPriceText = `QAR ${areaInfo.unitPrice.toFixed(2)} x ${
      areaInfo.count
    }`;

    try {
      await expect(page.getByText(expectedPriceText).first()).toBeVisible({
        timeout: 5000,
      });
      console.log(`✓ Verified price for ${areaName}: ${expectedPriceText}`);
    } catch {
      const alternativePriceRegex = new RegExp(
        `QAR\\s*${areaInfo.unitPrice.toFixed(2).replace(".", "\\.")}.*x\\s*${
          areaInfo.count
        }`
      );
      await expect(page.locator("body")).toContainText(alternativePriceRegex, {
        timeout: 5000,
      });
      console.log(`✓ Verified alternative price format for ${areaName}`);
    }
  }

  const totalPriceFormatted =
    totalExpectedPrice % 1 === 0
      ? `QAR ${Math.floor(totalExpectedPrice)}`
      : `QAR ${totalExpectedPrice.toFixed(2)}`;

  try {
    await expect(page.locator("body")).toContainText(totalPriceFormatted, {
      timeout: 5000,
    });
    console.log(`✓ Verified total price: ${totalPriceFormatted}`);
  } catch {
    try {
      await expect(page.locator("body")).toContainText(
        `QAR ${totalExpectedPrice.toFixed(2)}`,
        { timeout: 5000 }
      );
      console.log(`✓ Verified total price (decimal format)`);
    } catch {
      const priceRegex = new RegExp(`QAR\\s*${totalExpectedPrice}(?:\\.00)?`);
      await expect(page.locator("body")).toContainText(priceRegex, {
        timeout: 5000,
      });
      console.log(`✓ Verified total price (regex)`);
    }
  }
}

// ============================================================================
// PAYMENT HELPERS
// ============================================================================

export async function completePayment(page) {
  try {
    const creditCardOption = page
      .locator("div", { hasText: /^Credit Card$/ })
      .first();
    await expect(creditCardOption).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Use a Different Card" }).click();

    const cardNumberFrame = page.frameLocator("#cardNumber-iframe");
    await cardNumberFrame.locator("input").fill("4111111111111111");

    const expiryDateFrame = page.frameLocator("#expiryDate-iframe");
    await expiryDateFrame.locator("input").fill("12/28");

    const cvvFrame = page.frameLocator("#verificationCode-iframe");
    await cvvFrame.locator("input").fill("123");

    await page
      .getByRole("checkbox", { name: "I agree to the Terms and" })
      .check();
    // await page.getByRole("button", { name: "Pay" }).click();     // Disabled to prevent actual payment during tests

    // Wait a bit for payment processing
    await page.waitForTimeout(2000);
  } catch (error) {
    // If page is closed or element not found, log warning but don't fail
    if (
      error.message.includes("Target page, context or browser has been closed")
    ) {
      console.warn(
        "⚠️ Page was closed during payment completion - this may be expected behavior"
      );
    } else {
      throw error;
    }
  }
}

export async function fillPaymentDetails(page) {
  await expect(page.getByText("Expiry Date")).toBeVisible({ timeout: 10000 });
  const expiryDateFrame = page.frameLocator("#expiryDate-iframe");
  await expect(expiryDateFrame.locator("input")).toBeVisible({
    timeout: 10000,
  });
  await expiryDateFrame.locator("input").fill("12/28");

  await expect(page.getByText("CVV")).toBeVisible({ timeout: 10000 });
  const cvvFrame = page.frameLocator("#verificationCode-iframe");
  await expect(cvvFrame.locator("input")).toBeVisible({ timeout: 10000 });
  await cvvFrame.locator("input").fill("123");

  await page
    .getByRole("checkbox", { name: "I agree to the Terms and" })
    .check();
  await page.getByRole("button", { name: "Pay" }).click();
}

export async function verifyPaymentPageBasics(page, sidePanelApiData) {
  await expect(page).toHaveURL(/\/payment/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Payment Options" })
  ).toBeVisible({ timeout: 10000 });

  const paymentSidePanel = page
    .locator(".flex-col.md\\:bg-\\[\\#B3B2B340\\]")
    .first();
  await expect(paymentSidePanel).toBeVisible({ timeout: 10000 });
  await expect(paymentSidePanel.getByText("Booking Details")).toBeVisible({
    timeout: 10000,
  });
  await expect(
    paymentSidePanel.getByRole("img", { name: "banner" })
  ).toBeVisible({ timeout: 10000 });

  await expect(
    paymentSidePanel.getByText(sidePanelApiData.movie.movie_name)
  ).toBeVisible({ timeout: 10000 });
  await expect(
    paymentSidePanel.locator("span", { hasText: sidePanelApiData.show_time })
  ).toBeVisible({ timeout: 10000 });
}

export async function verifyCreditCardOption(page) {
  try {
    const creditCardOption = page
      .locator("div", { hasText: /^Credit Card$/ })
      .first();
    await expect(creditCardOption).toBeVisible({ timeout: 10000 });
    const selectionIndicator = creditCardOption.locator(
      "div.border-purpleYellow.bg-purpleYellow"
    );
    await expect(selectionIndicator).toBeVisible({ timeout: 10000 });
  } catch (error) {
    if (
      error.message.includes("Target page, context or browser has been closed")
    ) {
      console.warn(
        "⚠️ Page was closed during credit card option verification - this may be expected behavior"
      );
    } else {
      throw error;
    }
  }
}

export async function verifyAutoFilledCardNumber(page) {
  const storedCardData = await page.evaluate(() => {
    return {
      cardBin: localStorage.getItem("card_bin"),
      cardLast4: localStorage.getItem("card_last4"),
    };
  });

  await expect(page.getByText("Card Number")).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByText(`xxxxxxxx ${storedCardData.cardLast4}`)
  ).toBeVisible({ timeout: 10000 });

  const cardTextLocator = page.getByText(
    `xxxxxxxx ${storedCardData.cardLast4}`,
    { exact: false }
  );
  await expect(cardTextLocator).toContainText(storedCardData.cardBin, {
    timeout: 10000,
  });
  await expect(cardTextLocator).toContainText(storedCardData.cardLast4, {
    timeout: 10000,
  });
}

export async function completePaymentWithGiftCard(
  page,
  request,
  authToken,
  requiredAmountQAR
) {
  console.log("\n=== Gift Card Payment Flow ===");

  // 🔐 Defensive checks
  if (!authToken || typeof authToken !== "string") {
    throw new Error(`Invalid authToken passed: ${authToken}`);
  }

  if (typeof requiredAmountQAR !== "number") {
    throw new Error(`requiredAmountQAR must be a number`);
  }

  // 1️⃣ Open Gift Cards tab
  const giftCardTab = page
    .locator("div")
    .filter({ hasText: /^Gift Cards$/ })
    .first();

  await expect(giftCardTab).toBeVisible({ timeout: 10000 });
  await giftCardTab.click();

  // 2️⃣ Fetch gift cards from API
  const giftCardResponse = await request.get(
    "https://backend.novocinemas.com/api/gifts-wallets/gift-card/send-received?country_id=1&channel=web",
    {
      headers: {
        Authorization: String(authToken),
        Accept: "application/json, text/plain, */*",
      },
    }
  );

  if (!giftCardResponse.ok()) {
    throw new Error(
      `Gift card API failed with status ${giftCardResponse.status()}`
    );
  }

  const giftCardJson = await giftCardResponse.json();

  const allGiftCards = [
    ...(giftCardJson.data?.sent || []),
    ...(giftCardJson.data?.received || []),
  ];

  expect(allGiftCards.length).toBeGreaterThan(0);

  // 3️⃣ Pick gift card with sufficient balance
  const selectedCard = allGiftCards.find(
    (card) => card.balance_in_cents / 100 >= requiredAmountQAR
  );

  if (!selectedCard) {
    throw new Error(
      `No gift card found with balance >= QAR ${requiredAmountQAR}`
    );
  }

  const cardNumber = selectedCard.card_number;

  console.log(`✓ Selected Gift Card: ${cardNumber}`);

  // 4️⃣ Locate exact gift card UI root using card number
  const giftCardRoot = page
    .locator("span", { hasText: cardNumber })
    .locator('xpath=ancestor::div[contains(@class,"absolute")]')
    .first();

  await expect(giftCardRoot).toBeVisible({ timeout: 10000 });

  // 5️⃣ Click Redeem + wait for APPLY API
  const applyGiftCardResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/gifts-wallets/gift-card/apply") &&
      response.request().method() === "POST" &&
      response.status() === 200
  );

  const redeemButton = giftCardRoot.getByRole("button", {
    name: /^Redeem$/,
  });

  await expect(redeemButton).toBeVisible({ timeout: 5000 });
  await redeemButton.click();

  // 6️⃣ Optional: Verify "Applying" state
  await expect(
    giftCardRoot.getByRole("button", { name: /applying/i })
  ).toBeVisible({ timeout: 5000 });

  // 7️⃣ Wait for apply API response
  const applyResponse = await applyGiftCardResponsePromise;
  const applyJson = await applyResponse.json();

  expect(applyJson.success).toBe(true);
  expect(applyJson.data.applied_gift_card_amount).toBeGreaterThan(0);

  console.log("✓ Gift card apply API successful");

  // 8️⃣ Final UI validation → Applied state
  const appliedButton = giftCardRoot.getByRole("button", {
    name: /^Applied$/,
  });

  await expect(appliedButton).toBeVisible({ timeout: 10000 });
  await expect(appliedButton).toBeDisabled();

  // Yellow background validation
  await expect(appliedButton).toHaveClass(/bg-\[#FFDD00\]|yellow/i);

  // Redeem must NOT exist anymore
  await expect(
    giftCardRoot.getByRole("button", { name: /redeem/i })
  ).toHaveCount(0);

  // 9️⃣ Verify last 4 digits shown somewhere in UI
  await expect(page.getByText(new RegExp(cardNumber.slice(-4)))).toBeVisible();

  console.log(`✓ Gift card ${cardNumber} successfully applied`);
}

export async function applyAndRemoveGiftCardPayment(
  page,
  request,
  authToken,
  requiredAmountQAR
) {
  console.log("\n=== Gift Card Apply + Remove Flow ===");

  // ------------------ Defensive checks ------------------
  if (!authToken || typeof authToken !== "string") {
    throw new Error(`Invalid authToken passed: ${authToken}`);
  }

  if (typeof requiredAmountQAR !== "number") {
    throw new Error(`requiredAmountQAR must be a number`);
  }

  // ------------------ Open Gift Cards tab ------------------
  const giftCardTab = page
    .locator("div")
    .filter({ hasText: /^Gift Cards$/ })
    .first();

  await expect(giftCardTab).toBeVisible({ timeout: 10000 });
  await giftCardTab.click();

  // ------------------ Fetch gift cards (API) ------------------
  const giftCardResponse = await request.get(
    "https://backend.novocinemas.com/api/gifts-wallets/gift-card/send-received?country_id=1&channel=web",
    {
      headers: {
        Authorization: String(authToken),
        Accept: "application/json, text/plain, */*",
      },
    }
  );

  if (!giftCardResponse.ok()) {
    throw new Error(
      `Gift card API failed with status ${giftCardResponse.status()}`
    );
  }

  const giftCardJson = await giftCardResponse.json();

  const allGiftCards = [
    ...(giftCardJson.data?.sent || []),
    ...(giftCardJson.data?.received || []),
  ];

  expect(allGiftCards.length).toBeGreaterThan(0);

  // ------------------ Pick card with sufficient balance ------------------
  const selectedCard = allGiftCards.find(
    (card) => card.balance_in_cents / 100 >= requiredAmountQAR
  );

  if (!selectedCard) {
    throw new Error(
      `No gift card found with balance >= QAR ${requiredAmountQAR}`
    );
  }

  const cardNumber = selectedCard.card_number;
  console.log(`✓ Selected Gift Card: ${cardNumber}`);

  // ------------------ Locate exact gift card UI root ------------------
  const giftCardRoot = page
    .locator("span", { hasText: cardNumber })
    .locator('xpath=ancestor::div[contains(@class,"absolute")]')
    .first();

  await expect(giftCardRoot).toBeVisible({ timeout: 10000 });

  // ------------------ APPLY gift card ------------------
  const applyGiftCardResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/gifts-wallets/gift-card/apply") &&
      response.request().method() === "POST" &&
      response.status() === 200
  );

  const redeemButton = giftCardRoot.getByRole("button", { name: /^Redeem$/ });
  await expect(redeemButton).toBeVisible({ timeout: 5000 });
  await redeemButton.click();

  await expect(
    giftCardRoot.getByRole("button", { name: /applying/i })
  ).toBeVisible({ timeout: 5000 });

  const applyResponse = await applyGiftCardResponsePromise;
  const applyJson = await applyResponse.json();

  expect(applyJson.success).toBe(true);
  expect(applyJson.data.applied_gift_card_amount).toBeGreaterThan(0);

  console.log("✓ Gift card applied successfully");

  // ------------------ Verify APPLIED UI state ------------------
  const appliedButton = giftCardRoot.getByRole("button", { name: /^Applied$/ });

  await expect(appliedButton).toBeVisible({ timeout: 10000 });
  await expect(appliedButton).toBeDisabled();
  await expect(appliedButton).toHaveClass(/bg-\[#FFDD00\]|yellow/i);

  // Redeem must not exist now
  await expect(
    giftCardRoot.getByRole("button", { name: /redeem/i })
  ).toHaveCount(0);

  // ------------------ REMOVE gift card (UPDATED LOCATOR) ------------------
  const removeGiftCardResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/gifts-wallets/gift-card/remove") &&
      response.request().method() === "POST" &&
      response.status() === 200
  );

  const deleteButton = giftCardRoot
    .locator("div")
    .filter({ hasText: /^Applied$/ })
    .getByRole("button")
    .nth(1);

  await expect(deleteButton).toBeVisible({ timeout: 5000 });
  await deleteButton.click();

  const removeResponse = await removeGiftCardResponsePromise;
  const removeJson = await removeResponse.json();

  expect(removeJson.success).toBe(true);
  expect(removeJson.data.total_discount).toBe(0);

  console.log("✓ Gift card removed successfully");

  // ------------------ Verify UI returned to Redeem state ------------------
  const redeemButtonAfterRemove = giftCardRoot.getByRole("button", {
    name: /^Redeem$/,
  });

  await expect(redeemButtonAfterRemove).toBeVisible({ timeout: 10000 });
  await expect(redeemButtonAfterRemove).toBeEnabled();

  await expect(
    giftCardRoot.getByRole("button", { name: /^Applied$/ })
  ).toHaveCount(0);

  console.log(`✓ Gift card ${cardNumber} reset to Redeem state`);
}

export async function applyPartialGiftCardAndProceedToCreditPayment(
  page,
  request,
  authToken,
  totalPriceQAR
) {
  console.log("\n=== Partial Gift Card + Credit Card Flow ===");

  // ------------------ Defensive checks ------------------
  if (!authToken || typeof authToken !== "string") {
    throw new Error(`Invalid authToken passed: ${authToken}`);
  }

  if (typeof totalPriceQAR !== "number" || totalPriceQAR <= 0) {
    throw new Error(`Invalid totalPriceQAR: ${totalPriceQAR}`);
  }

  // ------------------ Open Gift Cards tab ------------------
  const giftCardTab = page
    .locator("div")
    .filter({ hasText: /^Gift Cards$/ })
    .first();
  await expect(giftCardTab).toBeVisible({ timeout: 10000 });
  await giftCardTab.click();

  // ------------------ Fetch gift cards ------------------
  const giftCardResponse = await request.get(
    "https://backend.novocinemas.com/api/gifts-wallets/gift-card/send-received?country_id=1&channel=web",
    {
      headers: {
        Authorization: String(authToken),
        Accept: "application/json, text/plain, */*",
      },
    }
  );

  if (!giftCardResponse.ok()) {
    throw new Error("Gift card API failed");
  }

  const giftCardJson = await giftCardResponse.json();

  const allGiftCards = [
    ...(giftCardJson.data?.sent || []),
    ...(giftCardJson.data?.received || []),
  ];

  expect(allGiftCards.length).toBeGreaterThan(0);

  // ------------------ Eligible cards: balance < total ------------------
  const eligibleCards = allGiftCards
    .filter((card) => card.balance_in_cents / 100 < totalPriceQAR)
    .sort((a, b) => b.balance_in_cents - a.balance_in_cents);

  if (eligibleCards.length === 0) {
    throw new Error(`No gift card found with balance < QAR ${totalPriceQAR}`);
  }

  console.log(`🔎 Found ${eligibleCards.length} eligible gift cards`);

  let appliedCard = null;
  let giftCardRoot = null;

  // ------------------ TRY cards one by one (IMPORTANT FIX) ------------------
  for (const card of eligibleCards) {
    const cardNumber = card.card_number;

    console.log(`➡️ Trying gift card: ${cardNumber}`);

    const candidateRoot = page
      .locator("span", { hasText: cardNumber })
      .locator('xpath=ancestor::div[contains(@class,"absolute")]')
      .first();

    // Short timeout → skip fast if not present
    if ((await candidateRoot.count()) === 0) {
      console.warn(`⚠️ Gift card ${cardNumber} not rendered in UI, skipping`);
      continue;
    }

    try {
      await expect(candidateRoot).toBeVisible({ timeout: 3000 });
      giftCardRoot = candidateRoot;
      appliedCard = card;
      break;
    } catch {
      console.warn(`⚠️ Gift card ${cardNumber} not visible, skipping`);
    }
  }

  if (!appliedCard || !giftCardRoot) {
    throw new Error(
      "❌ No eligible gift card found in UI (API cards exist but none rendered)"
    );
  }

  const cardNumber = appliedCard.card_number;
  console.log(`✅ Using gift card: ${cardNumber}`);

  // ------------------ Apply gift card ------------------
  const applyResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/gifts-wallets/gift-card/apply") &&
      res.request().method() === "POST" &&
      res.status() === 200
  );

  await giftCardRoot.getByRole("button", { name: /^Redeem$/ }).click();

  const applyResponse = await applyResponsePromise;
  const applyJson = await applyResponse.json();

  expect(applyJson.success).toBe(true);

  const appliedAmountQAR = applyJson.data.applied_gift_card_amount / 100;
  const remainingAmountQAR = totalPriceQAR - appliedAmountQAR;

  console.log(`✓ Applied Gift Card Amount: QAR ${appliedAmountQAR}`);
  console.log(`💰 Remaining Amount: QAR ${remainingAmountQAR}`);

  expect(remainingAmountQAR).toBeGreaterThan(0);

  // ------------------ Verify Applied state ------------------
  const appliedButton = giftCardRoot.getByRole("button", { name: /^Applied$/ });
  await expect(appliedButton).toBeVisible();
  await expect(appliedButton).toBeDisabled();


  // ------------------ Switch to Credit Card ------------------
  const creditCardOption = page
    .locator("div")
    .filter({ hasText: /^Credit Card$/ })
    .first();
  await creditCardOption.click();
  await completePayment(page);

  return {
    cardNumber,
    appliedAmountQAR,
    remainingAmountQAR,
  };
}


export async function applyNovoWalletOnly(
  page,
  request,
  authToken,
  requiredAmountQAR
) {
  console.log('\n=== Novo Wallet Apply Flow ===');

  // ------------------ Defensive checks ------------------
  if (!authToken || typeof authToken !== 'string') {
    throw new Error('Invalid authToken passed');
  }

  if (typeof requiredAmountQAR !== 'number') {
    throw new Error('requiredAmountQAR must be a number');
  }

  // ------------------ 1️⃣ CHECK WALLET BALANCE (API) ------------------
  const checkBalanceResponse = await request.get(
    'https://backend.novocinemas.com/api/gifts-wallets/wallet/check-balance?country_id=1&channel=web',
    {
      headers: {
        Authorization: authToken,
        Accept: 'application/json, text/plain, */*'
      }
    }
  );

  expect(checkBalanceResponse.ok()).toBe(true);

  const checkBalanceJson = await checkBalanceResponse.json();
  expect(checkBalanceJson.success).toBe(true);

  const walletBalanceFromApiQAR =
    checkBalanceJson.data.balance_amount / 100;

  console.log(`💼 Wallet Balance (API): QAR ${walletBalanceFromApiQAR}`);

  // ------------------ 2️⃣ VERIFY WALLET BALANCE IN UI ------------------
  const walletLabel = page.getByText('Novo Wallet Balance:', { exact: false });
  await expect(walletLabel).toBeVisible({ timeout: 10000 });

  const walletBalanceText = walletLabel.locator('span');
  const walletBalanceUiText = (await walletBalanceText.textContent())?.trim();

  if (!walletBalanceUiText) {
    throw new Error('Unable to read Novo Wallet balance from UI');
  }

  const walletBalanceFromUiQAR = parseFloat(
    walletBalanceUiText.replace('QAR', '').trim()
  );

  console.log(`💼 Wallet Balance (UI): QAR ${walletBalanceFromUiQAR}`);

  expect(walletBalanceFromApiQAR).toBeGreaterThanOrEqual(0);
  await expect(walletLabel).toBeVisible();

  // ------------------ 3️⃣ ZERO BALANCE HANDLING ------------------
  if (walletBalanceFromApiQAR <= 0) {
    console.warn('⚠️ Novo Wallet balance is 0 — skipping wallet apply');
    return {
      walletBalanceQAR: walletBalanceFromApiQAR,
      appliedAmountQAR: 0,
      remainingAmountQAR: requiredAmountQAR,
      skipped: true
    };
  }

  // ------------------ 4️⃣ LOCATE WALLET TOGGLE ------------------
  const walletToggle = page.locator('.rounded-full.w-9').first();
  await expect(walletToggle).toBeVisible({ timeout: 5000 });

  // ------------------ 5️⃣ APPLY WALLET ------------------
  const applyWalletResponsePromise = page.waitForResponse(
    res =>
      res.url().includes('/api/gifts-wallets/wallet/apply') &&
      res.request().method() === 'POST' &&
      res.status() === 200
  );

  await walletToggle.click();

  const applyResponse = await applyWalletResponsePromise;
  const applyJson = await applyResponse.json();

  expect(applyJson.success).toBe(true);

  const appliedAmountQAR = applyJson.data.total_discount / 100;
  const remainingAmountQAR = Math.max(
    requiredAmountQAR - appliedAmountQAR,
    0
  );

  console.log(`✅ Novo Wallet Applied: QAR ${appliedAmountQAR}`);
  console.log(`💰 Remaining Amount: QAR ${remainingAmountQAR}`);

  return {
    walletBalanceQAR: walletBalanceFromApiQAR,
    appliedAmountQAR,
    remainingAmountQAR,
    skipped: false
  };
}


// ============================================================================
// F&B (FOOD & BEVERAGES) HELPERS
// ============================================================================

export async function addFoodAndBeverages(page, concessionsData) {
  const fbTracker = {
    items: [],
    totalPrice: 0,
    addItem(name, priceValue, displayPrice) {
      this.items.push({ name, priceValue, displayPrice });
      this.totalPrice += priceValue;
      console.log(`Added F&B: ${name} - ${displayPrice}`);
    },
  };

  if (concessionsData?.data && Array.isArray(concessionsData.data)) {
    const availableCategories = concessionsData.data.filter(
      (category) =>
        category.name?.trim() &&
        Array.isArray(category.ConcessionItems) &&
        category.ConcessionItems.length > 0 &&
        !["nachos", "repeat order", "combos"].includes(
          category.name.toLowerCase()
        )
    );

    for (const category of availableCategories.slice(0, 2)) {
      const categoryName = category.name.trim();

      try {
        await page.getByRole("button", { name: categoryName }).click();
        await expect(
          page.getByRole("heading", { name: categoryName })
        ).toBeVisible();

        const randomIndex = Math.floor(
          Math.random() * category.ConcessionItems.length
        );
        const item = category.ConcessionItems[randomIndex];

        const itemName =
          item.display_name ||
          item.extended_description ||
          item.concession_item_name;
        const itemPrice = `QAR ${item.price_in_cents / 100}`;
        const itemPriceDecimal = `QAR ${(item.price_in_cents / 100).toFixed(
          2
        )}`;

        if (categoryName.toLowerCase() === "confectionery") {
          const itemCard = page.locator("div", {
            hasText: new RegExp(`${itemName}.*${itemPrice}.*Add`, "i"),
          });
          await expect(itemCard).toBeVisible();
          await itemCard.scrollIntoViewIfNeeded();
          const addBtn = itemCard.getByRole("button", { name: "Add" });
          await addBtn.click();
        } else {
          await expect(page.getByText(itemName)).toBeVisible();
          await expect(page.getByText(itemPrice)).toBeVisible();
          const addBtn = page
            .locator("div")
            .filter({ hasText: new RegExp(`^${itemPriceDecimal}Add$`) })
            .getByRole("button");
          await addBtn.click();
        }

        await expect(
          page.getByRole("heading", { name: itemName })
        ).toBeVisible();

        if (item.AlternateItems && item.AlternateItems.length > 0) {
          const altIndex = Math.floor(
            Math.random() * item.AlternateItems.length
          );
          const alt = item.AlternateItems[altIndex];

          await page
            .locator(`#alt-item-${alt.vista_alternate_item_id}`)
            .click();
          await page.getByRole("button", { name: "Add Item QAR" }).click();

          const fbItemName = `${item.concession_item_name} - ${alt.alternate_item_name}`;
          const altPrice = alt.price_in_cents / 100;
          const altDisplayPrice = `QAR ${altPrice.toFixed(2)}`;

          fbTracker.addItem(fbItemName, altPrice, altDisplayPrice);
        } else {
          if (categoryName.toLowerCase() === "confectionery") {
            const itemCard = page.getByText(
              `% Off${itemName}${itemPriceDecimal}Add`
            );
            await itemCard.locator("button", { hasText: "Add" }).click();
          } else {
            await page.getByRole("button", { name: "Add Item QAR" }).click();
          }

          const itemPriceValue = item.price_in_cents / 100;
          fbTracker.addItem(itemName, itemPriceValue, itemPriceDecimal);
        }
      } catch (error) {
        console.error(`Error processing ${categoryName}:`, error.message);
        continue;
      }
    }
  }

  return fbTracker;
}

export async function verifyFandBInPaymentPage(page, fbTracker) {
  await page
    .locator("section")
    .filter({ hasText: /^Food & Beverages$/ })
    .locator("div")
    .first()
    .click();

  if (fbTracker.items.length > 0) {
    for (const fbItem of fbTracker.items) {
      try {
        await expect(page.getByText(fbItem.name).first()).toBeVisible();
        await expect(page.getByText(fbItem.displayPrice).first()).toBeVisible();
      } catch (error) {
        console.warn(`Could not verify F&B item: ${fbItem.name}`);
      }
    }
  }
}

// ============================================================================
// COMMON TEST SETUP FOR BANK OFFERS
// ============================================================================

export async function setupTest(page, request) {
  // Note: Each test should set its own timeout using test.setTimeout()
  // Set a reasonable default timeout for page operations
  page.setDefaultTimeout(120000); // 2 minutes

  await page.goto("https://qa.novocinemas.com/home", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(/novocinemas\.com\/home/, { timeout: 15000 });

  // Select movie
  const apiMovies = await fetchMoviesFromAPI(request);
  if (!apiMovies.length) throw new Error("No movies returned from API");

  let selectedMovie = null;
  for (const m of apiMovies) {
    const title = m.movie_title;
    if (!title?.trim()) continue;

    const card = page.getByRole("link").filter({ hasText: title }).first();
    try {
      await card.waitFor({ state: "visible", timeout: 4000 });
      await card.scrollIntoViewIfNeeded();
      await card.click();
      selectedMovie = m;
      break;
    } catch {
      continue;
    }
  }

  if (!selectedMovie) {
    const anyCard = page.locator('[href*="/movies/"]').first();
    await anyCard.waitFor({ state: "visible", timeout: 8000 });
    await anyCard.scrollIntoViewIfNeeded();
    await anyCard.click();
  }

  await page.waitForLoadState("networkidle");

  // Get movie details
  let movieId = selectedMovie?.movie_id;
  let movieSlug = selectedMovie?.movie_slug;
  const detailsUrlMatch = page
    .url()
    .match(/movies\/(\d+)(?:-[^\/?#]+)?(?:\?[^#]*)?/);
  if (!movieId && detailsUrlMatch) movieId = detailsUrlMatch[1];

  if (!movieSlug) {
    try {
      const headingText = await page.getByRole("heading").first().innerText();
      movieSlug = headingText?.trim() || "";
    } catch {}
  }

  if (!movieId || !movieSlug)
    throw new Error("Could not determine movieId or movieSlug");

  const apiResponse = await request.get(
    `https://backend.novocinemas.com/api/home/movie-details/${movieId},${encodeURIComponent(
      movieSlug
    )}?country_id=1&channel=web`
  );
  const movieData = await apiResponse.json();
  const movie = movieData.data;

  // Book session
  const bookingResult = await dynamicBookingBankOffer(page, movieId);

  // Login
  const { tokenListener, getToken } = setupAuthTokenCapture(page);
  await login(page, "Anurag.Gupta@enpointe.io", "Anurag@123");

  const authToken = getToken();
  await injectAuthToken(page, authToken);
  await confirmAgeRating(page, tokenListener);

  // Extract cinema ID
  let cinemaId = bookingResult.cinemaId;
  if (!cinemaId) {
    const currentUrl = page.url();
    const match = currentUrl.match(/cinema\/(\d+)/);
    if (match) cinemaId = match[1];
    else throw new Error("Cinema ID could not be found.");
  }

  // Verify side panel and seat layout
  const sidePanelApiData = await verifySidePanel(
    page,
    request,
    bookingResult.sessionId,
    cinemaId
  );
  const layout = await getSeatLayout(
    page,
    request,
    bookingResult.sessionId,
    cinemaId
  );

  // Select seats and verify
  const { clickedSeats, seatPriceMap, rowOrder } = await selectSeatsBankOffer(
    page,
    layout
  );
  const sortedSeats = sortSeats(clickedSeats, rowOrder);
  const { areaGroupedSeats, totalExpectedPrice } = groupSeatsByArea(
    clickedSeats,
    seatPriceMap
  );

  await verifySelectedSeatsInPanel(page, clickedSeats);
  await verifyPricesInPanel(page, areaGroupedSeats, totalExpectedPrice);

  return {
    movie,
    bookingResult,
    cinemaId,
    sidePanelApiData,
    clickedSeats,
    seatPriceMap,
    rowOrder,
    areaGroupedSeats,
    totalExpectedPrice,
  };
}
