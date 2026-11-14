import dotenv from "dotenv";
import { sanitizeUrl } from "./globalSettings.js";
import { trackAndLogVerificationApi } from "../apiTracker.js";

dotenv.config();

/**
 * Builds a full, safe URL for the New Backend with authoritative mx_token.
 *
 * Rules:
 * 1. Requires HTTPS.
 * 2. Uses process.env.mx_token as authoritative; incoming query parameters cannot override it.
 * 3. Prevents duplicate mx_token parameters.
 * 4. Preserves all other query parameters.
 * 5. Rejects absolute endpoint URLs pointing outside the configured New Backend origin and path.
 * 6. Ensures final URL remains strictly within configured origin and base path.
 *
 * @param {string} endpoint - Path, partial URL, or same-origin absolute URL
 * @param {Object} [queryParams={}] - Additional query parameters
 * @returns {URL} Safe URL object with authoritative mx_token
 */
export function buildNewBackendUrl(endpoint, queryParams = {}) {
  const token = process.env.mx_token;
  if (!token || typeof token !== "string" || !token.trim()) {
    throw new Error("❌ Missing required mx_token in environment variables (.env)");
  }

  const base =
    process.env.PROD_NEW_BACKEND_URL || "https://web-api.novocinemas.com/api/v3/external";

  let baseParsed;
  try {
    baseParsed = new URL(base);
  } catch (err) {
    throw new Error(`❌ Invalid PROD_NEW_BACKEND_URL configuration: ${err.message}`);
  }

  if (baseParsed.protocol !== "https:") {
    throw new Error(
      `❌ Insecure New Backend URL protocol (HTTPS required): ${baseParsed.protocol}`
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
        `❌ Absolute endpoint URL points outside configured New Backend: ${sanitizeUrl(endpoint)}`
      );
    }

    fullUrl = endpointParsed;
  } else {
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
    try {
      fullUrl = new URL(cleanEndpoint, baseNormalized);
    } catch (err) {
      throw new Error(`❌ Failed to construct New Backend URL: ${err.message}`);
    }
  }

  // Verify the resulting URL stays strictly within configured origin and base path
  if (
    fullUrl.origin !== baseParsed.origin ||
    !fullUrl.pathname.startsWith(basePath)
  ) {
    throw new Error(
      `❌ Resulting URL points outside configured New Backend path: ${sanitizeUrl(fullUrl)}`
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

  // Authoritative token handling: delete any existing mx_token entries (prevent duplicates)
  // and set to process.env.mx_token so incoming query params cannot override it
  fullUrl.searchParams.delete("mx_token");
  fullUrl.searchParams.set("mx_token", token);

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
    // If user passed a custom form-data instance with getHeaders()
    if (typeof data.getHeaders === "function") {
      Object.assign(normalizedHeaders, data.getHeaders());
    } else {
      // Native FormData: delete any manual Content-Type to avoid breaking boundary
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
 * Executes a request to the New Backend with automatic authoritative mx_token authentication.
 * Supports both Playwright APIRequestContext and native fetch.
 *
 * @param {string} endpoint - Path, partial URL, or same-origin URL
 * @param {Object} [options={}] - Request options
 * @param {string} [options.method='GET'] - HTTP Method
 * @param {Object} [options.params] - Additional query parameters
 * @param {Object} [options.headers] - Request headers
 * @param {*} [options.data] - Request body for POST/PUT/PATCH/DELETE
 * @param {Object} [options.requestContext] - Playwright APIRequestContext (optional)
 * @returns {Promise<Response|import('@playwright/test').APIResponse>} Response object
 */
export async function newBackendRequest(endpoint, options = {}) {
  const {
    method = "GET",
    params = {},
    headers = {},
    data = undefined,
    requestContext = null,
    ...restOptions
  } = options;

  const url = buildNewBackendUrl(endpoint, params);
  const defaultHeaders = {
    Accept: "application/json, text/plain, */*",
    ...headers,
  };

  const { body, headers: preparedHeaders } = prepareRequestBodyAndHeaders(data, defaultHeaders);

  // If Playwright APIRequestContext is provided, use it
  if (requestContext && typeof requestContext.fetch === "function") {
    const playwrightOptions = {
      method,
      headers: preparedHeaders,
      ...restOptions,
    };
    if (data !== undefined && data !== null) {
      // Playwright fetch handles objects, buffers, strings natively
      playwrightOptions.data = data;
    }
    return requestContext.fetch(url.toString(), playwrightOptions);
  }

  // Otherwise, use native fetch
  const fetchOptions = {
    method,
    headers: preparedHeaders,
    ...restOptions,
  };

  if (body !== undefined) {
    fetchOptions.body = body;
  }

  trackAndLogVerificationApi(method, url.toString(), "newBackendRequest");

  try {
    return await fetch(url.toString(), fetchOptions);
  } catch (err) {
    throw new Error(
      `❌ New Backend request failed to ${sanitizeUrl(url)}: ${err.message}`
    );
  }
}

/**
 * Convenience helper for GET requests to the New Backend.
 */
export async function newBackendGet(endpoint, options = {}) {
  return newBackendRequest(endpoint, { ...options, method: "GET" });
}

/**
 * Convenience helper for POST requests to the New Backend.
 */
export async function newBackendPost(endpoint, data, options = {}) {
  return newBackendRequest(endpoint, { ...options, method: "POST", data });
}
