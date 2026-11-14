import dotenv from "dotenv";
import { sanitizeUrl, isTrustedLegacyBackendUrl } from "./globalSettings.js";
import { trackAndLogVerificationApi } from "../apiTracker.js";

dotenv.config();

/**
 * Builds a full, safe URL for the Legacy Backend.
 *
 * Rules:
 * 1. Strictly does NOT append mx_token. Any incoming mx_token parameter is removed.
 * 2. Normalizes trailing slashes.
 * 3. Prevents duplicate '/api' path segments if base already ends with '/api'.
 * 4. Rejects unexpected absolute endpoint URLs pointing outside the configured Legacy Backend.
 * 5. Requires HTTPS for secure communication.
 *
 * @param {string} endpoint - Path, partial URL, or same-origin URL
 * @param {Object} [queryParams={}] - Query parameters as key-value pairs
 * @param {string} [customBaseUrl] - Optional base URL override (e.g. resolved from Global Settings)
 * @returns {URL} Safe Legacy Backend URL object
 */
export function buildLegacyBackendUrl(endpoint, queryParams = {}, customBaseUrl = null) {
  const base =
    customBaseUrl ||
    process.env.PROD_LEGACY_BACKEND_URL ||
    (process.env.PROD_BACKEND_URL
      ? (process.env.PROD_BACKEND_URL.endsWith("/api")
          ? process.env.PROD_BACKEND_URL
          : `${process.env.PROD_BACKEND_URL}/api`)
      : "https://backend.novocinemas.com/api");

  let baseParsed;
  try {
    baseParsed = new URL(base);
  } catch (err) {
    throw new Error(`❌ Invalid Legacy Backend base URL: ${err.message}`);
  }

  // Require HTTPS strictly
  if (baseParsed.protocol !== "https:") {
    throw new Error(
      `❌ Insecure Legacy Backend base URL protocol (HTTPS required): ${baseParsed.protocol}`
    );
  }

  const baseNormalized = base.endsWith("/") ? base : `${base}/`;
  const basePath = baseParsed.pathname.replace(/\/$/, "");

  let fullUrl;
  const isAbsolute = /^https?:\/\//i.test(endpoint);

  if (isAbsolute) {
    let endpointParsed;
    try {
      endpointParsed = new URL(endpoint);
    } catch (err) {
      throw new Error(`❌ Invalid absolute endpoint URL: ${err.message}`);
    }

    if (
      endpointParsed.origin !== baseParsed.origin ||
      !endpointParsed.pathname.startsWith(basePath)
    ) {
      throw new Error(
        `❌ Absolute endpoint URL points outside configured Legacy Backend: ${sanitizeUrl(endpoint)}`
      );
    }

    fullUrl = endpointParsed;
  } else {
    let cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;

    // Prevent duplicate '/api' segment if base URL already ends with '/api'
    if (basePath.endsWith("/api") && (cleanEndpoint === "api" || cleanEndpoint.startsWith("api/"))) {
      cleanEndpoint = cleanEndpoint.replace(/^api\/?/, "");
    }

    try {
      fullUrl = new URL(cleanEndpoint, baseNormalized);
    } catch (err) {
      throw new Error(`❌ Failed to construct Legacy Backend URL: ${err.message}`);
    }
  }

  // Ensure request stays strictly within configured legacy backend path
  if (
    fullUrl.origin !== baseParsed.origin ||
    !fullUrl.pathname.startsWith(basePath)
  ) {
    throw new Error(
      `❌ Resulting URL points outside configured Legacy Backend path: ${sanitizeUrl(fullUrl)}`
    );
  }

  // Append queryParams if provided
  if (queryParams && typeof queryParams === "object") {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        fullUrl.searchParams.set(key, String(value));
      }
    }
  }

  // Legacy backend must NEVER receive mx_token
  if (fullUrl.searchParams.has("mx_token")) {
    fullUrl.searchParams.delete("mx_token");
  }

  return fullUrl;
}

/**
 * Helper to normalize and prepare request body and headers.
 * Ensures JSON, FormData, URLSearchParams, and Buffers/Blobs are preserved correctly.
 */
function prepareRequestBodyAndHeaders(data, headers = {}) {
  const normalizedHeaders = { ...headers };

  if (data === undefined || data === null) {
    return { body: undefined, headers: normalizedHeaders };
  }

  // 1. FormData handling: do NOT set Content-Type header (browser/fetch must add multipart boundary)
  const isFormData =
    (typeof FormData !== "undefined" && data instanceof FormData) ||
    (data && typeof data.append === "function" && typeof data.getHeaders === "function");

  if (isFormData) {
    if (typeof data.getHeaders === "function") {
      Object.assign(normalizedHeaders, data.getHeaders());
    } else {
      delete normalizedHeaders["Content-Type"];
      delete normalizedHeaders["content-type"];
    }
    return { body: data, headers: normalizedHeaders };
  }

  // 2. URLSearchParams handling
  if (data instanceof URLSearchParams) {
    if (!normalizedHeaders["Content-Type"] && !normalizedHeaders["content-type"]) {
      normalizedHeaders["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    }
    return { body: data.toString(), headers: normalizedHeaders };
  }

  // 3. Buffer, Blob, ArrayBuffer handling
  const isBinary =
    (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) ||
    (typeof Blob !== "undefined" && data instanceof Blob) ||
    (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer);

  if (isBinary) {
    return { body: data, headers: normalizedHeaders };
  }

  // 4. Plain Object / Array handling -> JSON serialize
  if (typeof data === "object") {
    if (!normalizedHeaders["Content-Type"] && !normalizedHeaders["content-type"]) {
      normalizedHeaders["Content-Type"] = "application/json";
    }
    return { body: JSON.stringify(data), headers: normalizedHeaders };
  }

  // 5. String or other primitive
  return { body: data, headers: normalizedHeaders };
}

/**
 * Executes a request to the Legacy Backend.
 * Strictly does NOT append mx_token.
 * Supports both Playwright APIRequestContext and native fetch.
 *
 * @param {string} endpoint - Path, partial URL, or same-origin URL
 * @param {Object} [options={}] - Request options
 * @param {string} [options.method='GET'] - HTTP Method
 * @param {Object} [options.params] - Query parameters
 * @param {Object} [options.headers] - Request headers (e.g. Authorization Bearer)
 * @param {*} [options.data] - Request body
 * @param {string} [options.baseUrl] - Optional custom base URL
 * @param {Object} [options.requestContext] - Playwright APIRequestContext (optional)
 * @returns {Promise<Response|import('@playwright/test').APIResponse>} Response object
 */
export async function legacyBackendRequest(endpoint, options = {}) {
  const {
    method = "GET",
    params = {},
    headers = {},
    data = undefined,
    baseUrl = null,
    requestContext = null,
    ...restOptions
  } = options;

  const url = buildLegacyBackendUrl(endpoint, params, baseUrl);
  const defaultHeaders = {
    Accept: "application/json, text/plain, */*",
    ...headers,
  };

  const { body, headers: preparedHeaders } = prepareRequestBodyAndHeaders(data, defaultHeaders);

  if (requestContext && typeof requestContext.fetch === "function") {
    const playwrightOptions = {
      method,
      headers: preparedHeaders,
      ...restOptions,
    };
    if (data !== undefined && data !== null) {
      playwrightOptions.data = data;
    }
    return requestContext.fetch(url.toString(), playwrightOptions);
  }

  const fetchOptions = {
    method,
    headers: preparedHeaders,
    ...restOptions,
  };

  if (body !== undefined) {
    fetchOptions.body = body;
  }

  trackAndLogVerificationApi(method, url.toString(), "legacyBackendRequest");

  try {
    return await fetch(url.toString(), fetchOptions);
  } catch (err) {
    throw new Error(
      `❌ Legacy Backend request failed to ${sanitizeUrl(url)}: ${err.message}`
    );
  }
}

/**
 * Convenience helper for GET requests to the Legacy Backend.
 */
export async function legacyBackendGet(endpoint, options = {}) {
  return legacyBackendRequest(endpoint, { ...options, method: "GET" });
}

/**
 * Convenience helper for POST requests to the Legacy Backend.
 */
export async function legacyBackendPost(endpoint, data, options = {}) {
  return legacyBackendRequest(endpoint, { ...options, method: "POST", data });
}
