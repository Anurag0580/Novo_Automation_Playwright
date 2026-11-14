import dotenv from "dotenv";

dotenv.config();

let cachedSettings = null;
let inFlightPromise = null;

// Approved Legacy Backend Hostnames
const APPROVED_LEGACY_HOSTS = [
  "backend.novocinemas.com",
  "qa-backend.novocinemas.com",
];

// Approved Legacy Domains for dynamically configured environments (e.g. UAT/preprod)
const APPROVED_LEGACY_DOMAINS = [
  "novocinemas.com",
  "enpointe.io",
];

/**
 * Strips sensitive query parameters (especially mx_token) from a URL string for safe logging.
 * @param {string|URL} url
 * @returns {string} Sanitized URL string
 */
export function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("mx_token")) {
      parsed.searchParams.set("mx_token", "[REDACTED]");
    }
    return parsed.toString();
  } catch {
    return String(url).replace(/mx_token=[^&]+/g, "mx_token=[REDACTED]");
  }
}

/**
 * Validates whether a legacy backend URL belongs to an allowed and trusted host.
 *
 * Rules:
 * 1. Requires HTTPS protocol strictly (HTTP is rejected).
 * 2. Requires standard HTTPS port (port must be empty or '443'; unexpected ports rejected).
 * 3. Hostname must be in APPROVED_LEGACY_HOSTS or match an approved domain from env.
 *
 * @param {string} urlString
 * @returns {boolean} True if trusted and secure
 */
export function isTrustedLegacyBackendUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    return false;
  }

  try {
    const parsed = new URL(urlString.trim());

    // 1. Require HTTPS strictly
    if (parsed.protocol !== "https:") {
      return false;
    }

    // 2. Validate port: reject unexpected ports
    if (parsed.port && parsed.port !== "443" && parsed.port !== "") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // 3. Check approved hosts list
    if (APPROVED_LEGACY_HOSTS.includes(hostname)) {
      return true;
    }

    // 4. Check if host belongs to approved legacy domains
    const matchesApprovedDomain = APPROVED_LEGACY_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!matchesApprovedDomain) {
      return false;
    }

    // If matches domain, ensure it corresponds to an explicitly configured env URL
    const envLegacyUrl = process.env.PROD_LEGACY_BACKEND_URL || process.env.PROD_BACKEND_URL;
    if (envLegacyUrl) {
      try {
        const envParsed = new URL(envLegacyUrl);
        if (envParsed.hostname.toLowerCase() === hostname) {
          return true;
        }
      } catch {
        // invalid env URL, fall through
      }
    }

    return APPROVED_LEGACY_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Validates the raw Global Settings response payload and confirms Qatar configuration.
 * Throws a descriptive Error if validation fails.
 *
 * @param {Object} responseData - The parsed JSON response
 * @returns {Object} Validated data object
 */
export function validateGlobalSettingsData(responseData) {
  if (!responseData || typeof responseData !== "object") {
    throw new Error("❌ Global Settings API returned an empty or non-object response");
  }

  if (responseData.success === false) {
    const msg = responseData.message || "Request failed according to response payload";
    throw new Error(`❌ Global Settings API reported failure: ${msg}`);
  }

  const data = responseData.data;
  if (!data || typeof data !== "object") {
    throw new Error("❌ Global Settings response missing required 'data' object");
  }

  // 1. Validate legacy_base_url
  if (!data.legacy_base_url || typeof data.legacy_base_url !== "string") {
    throw new Error("❌ Global Settings response missing or invalid 'legacy_base_url'");
  }

  if (!isTrustedLegacyBackendUrl(data.legacy_base_url)) {
    throw new Error(
      `❌ Untrusted or insecure legacy backend URL returned by Global Settings: ${data.legacy_base_url}`
    );
  }

  // 2. Validate country object
  if (!data.country || typeof data.country !== "object") {
    throw new Error("❌ Global Settings response missing required 'country' configuration");
  }

  const { currency, country_code, country_name } = data.country;

  if (!currency || typeof currency !== "string") {
    throw new Error("❌ Global Settings response missing or invalid 'country.currency'");
  }

  if (!country_code || typeof country_code !== "string") {
    throw new Error("❌ Global Settings response missing or invalid 'country.country_code'");
  }

  if (!country_name || typeof country_name !== "string") {
    throw new Error("❌ Global Settings response missing or invalid 'country.country_name'");
  }

  // 3. Validate fk_country_id (New Backend Country ID, distinct from legacy COUNTRY_ID=1)
  if (typeof data.fk_country_id !== "number" || isNaN(data.fk_country_id)) {
    throw new Error("❌ Global Settings response missing or invalid 'fk_country_id'");
  }

  // 4. Confirm Qatar country configuration specifically
  const normalizedCountryName = country_name.trim().toLowerCase();
  const normalizedCountryCode = country_code.trim().toUpperCase();
  const normalizedCurrency = currency.trim().toUpperCase();

  if (
    normalizedCountryName !== "qatar" ||
    normalizedCountryCode !== "QA" ||
    normalizedCurrency !== "QAR"
  ) {
    throw new Error(
      `❌ Global Settings returned non-Qatar country data: ` +
        `name='${country_name}', code='${country_code}', currency='${currency}'. ` +
        `Expected Qatar, QA, QAR.`
    );
  }

  return data;
}

/**
 * Fetches Global Settings from the New Backend using authoritative mx_token.
 *
 * Rules:
 * 1. Concurrency-safe: concurrent callers await the same in-flight Promise to avoid duplicate HTTP requests.
 * 2. Caches only successfully validated settings.
 * 3. Enforces Qatar configuration (Qatar / QA / QAR / fk_country_id: 178).
 *
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh=false] - Ignore cache and fetch fresh
 * @param {Object} [options.requestContext] - Optional Playwright APIRequestContext
 * @returns {Promise<Object>} The validated Global Settings data object
 */
export async function getGlobalSettings(options = {}) {
  const { forceRefresh = false, requestContext = null } = options;

  if (cachedSettings && !forceRefresh) {
    return cachedSettings;
  }

  if (inFlightPromise && !forceRefresh) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    const token = process.env.mx_token;
    if (!token || typeof token !== "string" || !token.trim()) {
      throw new Error("❌ Missing required mx_token in environment variables (.env)");
    }

    const newBackendBase =
      process.env.PROD_NEW_BACKEND_URL || "https://web-api.novocinemas.com/api/v3/external";

    let url;
    try {
      url = new URL(
        newBackendBase.endsWith("/")
          ? `${newBackendBase}home/global-settings`
          : `${newBackendBase}/home/global-settings`
      );
    } catch (e) {
      throw new Error(`❌ Invalid PROD_NEW_BACKEND_URL configuration: ${e.message}`);
    }

    if (url.protocol !== "https:") {
      throw new Error(`❌ Insecure New Backend protocol (HTTPS required): ${url.protocol}`);
    }

    // Always use authoritative mx_token
    url.searchParams.delete("mx_token");
    url.searchParams.set("mx_token", token);

    let responseData;
    let status;

    if (requestContext && typeof requestContext.get === "function") {
      const res = await requestContext.get(url.toString(), {
        headers: { Accept: "application/json, text/plain, */*" },
      });
      status = res.status();
      if (!res.ok()) {
        throw new Error(
          `❌ Global Settings API failed with status ${status} at ${sanitizeUrl(url)}`
        );
      }
      responseData = await res.json();
    } else {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json, text/plain, */*" },
      });
      status = res.status;
      if (!res.ok) {
        throw new Error(
          `❌ Global Settings API failed with status ${status} at ${sanitizeUrl(url)}`
        );
      }
      responseData = await res.json();
    }

    // Strict validation of the returned structure & Qatar verification
    const validatedData = validateGlobalSettingsData(responseData);

    // Cache ONLY successfully validated settings
    cachedSettings = validatedData;
    return validatedData;
  })();

  try {
    const result = await inFlightPromise;
    return result;
  } finally {
    inFlightPromise = null;
  }
}

/**
 * Clears the cached Global Settings (useful for isolated unit testing).
 */
export function clearGlobalSettingsCache() {
  cachedSettings = null;
  inFlightPromise = null;
}

/**
 * Resolves the legacy backend URL from Global Settings.
 *
 * Rules:
 * 1. Fallback is DISABLED by default (allowFallback: false).
 * 2. If Global Settings fails and allowFallback is false, re-throws the actual sanitized error.
 * 3. Fallback is used ONLY when allowFallback is explicitly true AND the fallback URL is verified trusted.
 *
 * @param {Object} [options]
 * @param {boolean} [options.allowFallback=false] - Whether to permit fallback if Global Settings fails
 * @param {Object} [options.requestContext] - Optional Playwright APIRequestContext
 * @returns {Promise<string>} Validated Legacy Backend URL
 */
export async function getLegacyBackendUrl(options = {}) {
  const { allowFallback = false, requestContext = null } = options;

  try {
    const settings = await getGlobalSettings({ requestContext });
    return settings.legacy_base_url;
  } catch (error) {
    if (allowFallback) {
      const fallback = process.env.PROD_LEGACY_BACKEND_URL;
      if (fallback && isTrustedLegacyBackendUrl(fallback)) {
        console.warn(
          `⚠️ Global Settings failed; using explicitly enabled and verified fallback: ${fallback}`
        );
        return fallback;
      }
      throw new Error(
        `❌ Global Settings failed and configured fallback URL is invalid or untrusted. Error: ${error.message}`
      );
    }
    // Fallback is disabled by default: report actual error
    throw error;
  }
}

/**
 * Returns Qatar country details from validated Global Settings.
 * Note: fk_country_id is the New Backend identifier (178), NOT legacy COUNTRY_ID (1).
 *
 * @param {Object} [options]
 * @returns {Promise<{ currency: string, country_code: string, country_name: string, fk_country_id: number }>}
 */
export async function getGlobalCountryConfig(options = {}) {
  const settings = await getGlobalSettings(options);
  return {
    currency: settings.country.currency,
    country_code: settings.country.country_code,
    country_name: settings.country.country_name,
    fk_country_id: settings.fk_country_id,
  };
}
