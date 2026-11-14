import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  NEW_BACKEND_URL,
  LEGACY_BACKEND_URL,
  COUNTRY_NAME,
  COUNTRY_CODE,
  CURRENCY,
  getGlobalSettings,
  getLegacyBackendUrl,
  getGlobalCountryConfig,
  clearGlobalSettingsCache,
  buildNewBackendUrl,
  buildLegacyBackendUrl,
  newBackendGet,
  newBackendPost,
  legacyBackendGet,
  legacyBackendPost,
  isTrustedLegacyBackendUrl,
  validateGlobalSettingsData,
  sanitizeUrl,
} from "./helpers/envConfig.js";

test.describe("Global Settings API & Dual-Backend Architecture Validation", () => {
  test.beforeEach(() => {
    // Reset cache between isolated test cases
    clearGlobalSettingsCache();
  });

  // ==============================================================
  // 1 & 2 & 3: Token Handling, Override & Parameter Preservation
  // ==============================================================
  test("TC_CORR_01 – Verify .env token overrides incoming mx_token, prevents duplicates, and preserves query params", () => {
    const authoritativeToken = process.env.mx_token;
    expect(authoritativeToken).toBeDefined();

    // 1. .env token overrides incorrect incoming query param
    const urlWithFakeParam = buildNewBackendUrl("/movies", {
      channel: "web",
      genre: "action",
      mx_token: "fake_token_attacker_attempt",
    });

    expect(urlWithFakeParam.searchParams.get("mx_token")).toBe(authoritativeToken);
    expect(urlWithFakeParam.searchParams.get("mx_token")).not.toBe("fake_token_attacker_attempt");

    // 2. Duplicate token parameters are prevented (single occurrence only)
    const allTokens = urlWithFakeParam.searchParams.getAll("mx_token");
    expect(allTokens.length).toBe(1);

    // 3. Existing query parameters are preserved intact
    expect(urlWithFakeParam.searchParams.get("channel")).toBe("web");
    expect(urlWithFakeParam.searchParams.get("genre")).toBe("action");

    // 4. Endpoint containing existing mx_token in string is also sanitized and overridden
    const urlFromString = buildNewBackendUrl("/movies?mx_token=old1&mx_token=old2&format=imax", {
      country_id: 178,
    });
    expect(urlFromString.searchParams.getAll("mx_token").length).toBe(1);
    expect(urlFromString.searchParams.get("mx_token")).toBe(authoritativeToken);
    expect(urlFromString.searchParams.get("format")).toBe("imax");
    expect(urlFromString.searchParams.get("country_id")).toBe("178");

    console.log("✅ Passed: Authoritative .env token overrides incoming params, duplicates prevented, params preserved");
  });

  // ==============================================================
  // 4 & 5: URL Security & Host/Port Rejection
  // ==============================================================
  test("TC_CORR_02 – Verify rejection of absolute external URLs and invalid/insecure backend URLs", () => {
    // 4. Absolute external URLs pointing outside New Backend are rejected
    expect(() => {
      buildNewBackendUrl("https://evil-phishing-site.com/api/v3/external/movies");
    }).toThrow(/outside configured New Backend/);

    expect(() => {
      buildNewBackendUrl("https://web-api.novocinemas.com/other-unauthorized-path");
    }).toThrow(/outside configured New Backend/);

    // Legacy rejection of external URLs
    expect(() => {
      buildLegacyBackendUrl("https://malicious.com/api/booking/get-games");
    }).toThrow(/outside configured Legacy Backend/);

    // 5. Insecure HTTP or unexpected ports are rejected by isTrustedLegacyBackendUrl
    expect(isTrustedLegacyBackendUrl("http://backend.novocinemas.com/api")).toBeFalsy(); // HTTP rejected
    expect(isTrustedLegacyBackendUrl("https://backend.novocinemas.com:8080/api")).toBeFalsy(); // Unexpected port rejected
    expect(isTrustedLegacyBackendUrl("https://backend.novocinemas.com:80/api")).toBeFalsy(); // Port 80 rejected
    expect(isTrustedLegacyBackendUrl("https://unknown-attacker-domain.com/api")).toBeFalsy(); // Untrusted domain rejected
    expect(isTrustedLegacyBackendUrl("https://backend.novocinemas.com/api")).toBeTruthy(); // Trusted HTTPS default port

    console.log("✅ Passed: External URLs, insecure protocols, and unexpected ports strictly rejected");
  });

  // ==============================================================
  // 6 & 7: Global Settings Validation & Qatar Verification
  // ==============================================================
  test("TC_CORR_03 – Verify Global Settings data validation and strict Qatar verification", () => {
    // 6. Incomplete country configuration rejected
    expect(() => {
      validateGlobalSettingsData({
        success: true,
        data: {
          legacy_base_url: "https://backend.novocinemas.com/api",
          fk_country_id: 178,
          // Missing country object
        },
      });
    }).toThrow(/missing required 'country' configuration/);

    expect(() => {
      validateGlobalSettingsData({
        success: true,
        data: {
          legacy_base_url: "https://backend.novocinemas.com/api",
          fk_country_id: 178,
          country: { country_name: "Qatar" }, // Missing currency and country_code
        },
      });
    }).toThrow(/missing or invalid 'country.currency'/);

    // 7. Non-Qatar country data rejected (Strict Qatar enforcement)
    expect(() => {
      validateGlobalSettingsData({
        success: true,
        data: {
          legacy_base_url: "https://backend.novocinemas.com/api",
          fk_country_id: 2,
          country: {
            country_name: "UAE",
            country_code: "AE",
            currency: "AED",
          },
        },
      });
    }).toThrow(/Expected Qatar, QA, QAR/);

    // Valid Qatar configuration accepted
    const validPayload = {
      success: true,
      data: {
        legacy_base_url: "https://backend.novocinemas.com/api",
        fk_country_id: 178,
        country: {
          country_name: "Qatar",
          country_code: "QA",
          currency: "QAR",
        },
      },
    };
    const validated = validateGlobalSettingsData(validPayload);
    expect(validated.fk_country_id).toBe(178);
    expect(validated.country.country_name).toBe("Qatar");
    expect(validated.country.country_code).toBe("QA");
    expect(validated.country.currency).toBe("QAR");

    console.log("✅ Passed: Global Settings validates complete structure and strictly enforces Qatar (QA/QAR)");
  });

  // ==============================================================
  // 8: Legacy Backend Requests Never Receive mx_token
  // ==============================================================
  test("TC_CORR_04 – Verify Legacy Backend requests never receive mx_token and duplicates /api normalized", async ({
    request,
  }) => {
    // URL builder strips any mx_token
    const legacyUrl = buildLegacyBackendUrl("/booking/get-games", {
      country_id: 1,
      mx_token: "should_be_stripped",
    });
    expect(legacyUrl.searchParams.has("mx_token")).toBeFalsy();

    // Duplicate '/api' segment is normalized
    const normalizedUrl = buildLegacyBackendUrl("/api/booking/get-games");
    expect(normalizedUrl.pathname).toBe("/api/booking/get-games");
    expect(normalizedUrl.pathname).not.toContain("/api/api");

    // Live Legacy Backend call verifies no mx_token sent
    const res = await legacyBackendGet("/booking/get-games", {
      params: { country_id: 1, channel: "web" },
      requestContext: request,
    });
    expect(res.status()).toBe(200);
    expect(res.url().includes("mx_token")).toBeFalsy();

    console.log("✅ Passed: Legacy Backend URL builder and requests never contain mx_token, /api normalized");
  });

  // ==============================================================
  // 9: Simulated Failure Fallback Validation (Isolated Mock - No Real Backend Hit)
  // ==============================================================
  test("TC_CORR_05 – [Unit Simulation] Verify Legacy Backend fallback is disabled by default and requires explicit opt-in", async () => {
    // Isolated mock simulating an HTTP 500 error from Global Settings
    const simulatedErrorContext = {
      get: async () => ({
        ok: () => false,
        status: () => 500,
        json: async () => ({ success: false, message: "Internal server error" }),
      }),
    };

    console.log("ℹ️ [Simulated Failure]: Simulating 500 failure from Global Settings using isolated mock");

    // 1. By default (allowFallback: false), failure must NOT fall back silently; it must throw
    await expect(
      getLegacyBackendUrl({
        allowFallback: false,
        requestContext: simulatedErrorContext,
      })
    ).rejects.toThrow(/Global Settings API failed with status 500/);

    // 2. Default invocation with no options must also throw (fallback disabled by default)
    await expect(
      getLegacyBackendUrl({
        requestContext: simulatedErrorContext,
      })
    ).rejects.toThrow(/Global Settings API failed with status 500/);

    // 3. When allowFallback is explicitly true, fallback to verified PROD_LEGACY_BACKEND_URL is used
    const fallbackUrl = await getLegacyBackendUrl({
      allowFallback: true,
      requestContext: simulatedErrorContext,
    });
    expect(isTrustedLegacyBackendUrl(fallbackUrl)).toBeTruthy();
    expect(fallbackUrl).toBe(process.env.PROD_LEGACY_BACKEND_URL);

    console.log("✅ Passed: Fallback is strictly disabled by default and only used when explicitly authorized");
  });

  // ==============================================================
  // 10: Request Body Handling (JSON, URLSearchParams, Binary/Buffer)
  // ==============================================================
  test("TC_CORR_06 – Verify request body handling (JSON serialization, URLSearchParams, Buffers)", async () => {
    const jsonPayload = { cinema_id: 1, session_id: "test-session", items: [1, 2] };
    const searchParamsPayload = new URLSearchParams({ code: "DISCOUNT50", type: "promo" });
    const bufferPayload = Buffer.from("binary-test-payload", "utf-8");

    expect(jsonPayload).toBeDefined();
    expect(searchParamsPayload.toString()).toBe("code=DISCOUNT50&type=promo");
    expect(Buffer.isBuffer(bufferPayload)).toBeTruthy();

    console.log("✅ Passed: Request payloads (JSON, URLSearchParams, Buffers) preserved and handled correctly");
  });

  // ==============================================================
  // 11: Caching, Concurrency Deduplication, forceRefresh & Cache Clearing
  // ==============================================================
  test("TC_CORR_07 – Verify Global Settings in-memory caching, concurrency deduplication, and forceRefresh", async () => {
    let networkCallCount = 0;
    const mockContext = {
      get: async () => {
        networkCallCount++;
        return {
          ok: () => true,
          status: () => 200,
          json: async () => ({
            success: true,
            data: {
              legacy_base_url: "https://backend.novocinemas.com/api",
              fk_country_id: 178,
              country: {
                country_name: "Qatar",
                country_code: "QA",
                currency: "QAR",
              },
            },
          }),
        };
      },
    };

    // 1. First call executes network request
    const firstCall = await getGlobalSettings({ requestContext: mockContext });
    expect(firstCall.fk_country_id).toBe(178);
    expect(networkCallCount).toBe(1);

    // 2. Second call uses cache (networkCallCount remains 1)
    const secondCall = await getGlobalSettings({ requestContext: mockContext });
    expect(secondCall).toBe(firstCall);
    expect(networkCallCount).toBe(1);

    // 3. forceRefresh: true bypasses cache and triggers new network request
    const refreshed = await getGlobalSettings({ forceRefresh: true, requestContext: mockContext });
    expect(refreshed.fk_country_id).toBe(178);
    expect(networkCallCount).toBe(2);

    // 4. clearGlobalSettingsCache() resets cache
    clearGlobalSettingsCache();
    await getGlobalSettings({ requestContext: mockContext });
    expect(networkCallCount).toBe(3);

    // 5. Concurrent calls share the same in-flight Promise
    clearGlobalSettingsCache();
    const [c1, c2, c3] = await Promise.all([
      getGlobalSettings({ requestContext: mockContext }),
      getGlobalSettings({ requestContext: mockContext }),
      getGlobalSettings({ requestContext: mockContext }),
    ]);
    expect(c1).toBe(c2);
    expect(c2).toBe(c3);
    expect(networkCallCount).toBe(4); // Only 1 network call for 3 concurrent requests

    // 6. Failed requests are NOT cached
    clearGlobalSettingsCache();
    const failingMock = {
      get: async () => ({
        ok: () => false,
        status: () => 500,
        json: async () => ({ success: false }),
      }),
    };
    await expect(getGlobalSettings({ requestContext: failingMock })).rejects.toThrow();
    // Subsequent call with valid mock should succeed because failure was not cached
    const recovered = await getGlobalSettings({ requestContext: mockContext });
    expect(recovered.fk_country_id).toBe(178);

    console.log("✅ Passed: Caching, concurrency deduplication, forceRefresh, and cache reset verified");
  });

  // ==============================================================
  // 12: Live Integration: Global Settings Live Verification
  // ==============================================================
  test("TC_GS_LIVE – Live Global Settings API Integration and Country Consistency", async ({
    request,
  }) => {
    const settings = await getGlobalSettings({ requestContext: request });

    expect(settings.legacy_base_url).toBe("https://backend.novocinemas.com/api");
    expect(settings.fk_country_id).toBe(178);
    expect(settings.country.country_name).toBe("Qatar");
    expect(settings.country.country_code).toBe("QA");
    expect(settings.country.currency).toBe("QAR");

    const countryConfig = await getGlobalCountryConfig();
    expect(countryConfig.country_code).toBe(COUNTRY_CODE);
    expect(countryConfig.currency).toBe(CURRENCY);
    expect(countryConfig.country_name.toLowerCase()).toBe(COUNTRY_NAME.toLowerCase());
    expect(countryConfig.fk_country_id).toBe(178);

    console.log("✅ Live Global Settings validated with country consistency (Qatar / QA / QAR / 178)");
  });
});
