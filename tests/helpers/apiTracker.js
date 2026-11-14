// tests/helpers/apiTracker.js

/**
 * Tracks backend API calls per test case.
 */
let currentTestApiState = {
  tcId: "N/A",
  testTitle: "",
  verificationApis: [], // APIs called directly by tests (test fixtures / APIRequestContext / fetch)
  browserApis: [],      // APIs called by the browser page
};

/**
 * Classifies an API URL as New Backend, Legacy Backend, or External.
 *
 * @param {string|URL} url - The URL to inspect
 * @returns {Object|null}
 */
export function classifyBackendApi(url) {
  if (!url) return null;
  const urlStr = typeof url === "string" ? url : url.toString();

  const isNewBackend =
    urlStr.includes("web-api.novocinemas.com") ||
    urlStr.includes("/api/v3/external") ||
    (process.env.PROD_NEW_BACKEND_URL &&
      urlStr.includes(process.env.PROD_NEW_BACKEND_URL));

  const isLegacyBackend =
    urlStr.includes("backend.novocinemas.com") ||
    (process.env.PROD_LEGACY_BACKEND_URL &&
      urlStr.includes(process.env.PROD_LEGACY_BACKEND_URL)) ||
    (process.env.PROD_BACKEND_URL &&
      urlStr.includes(process.env.PROD_BACKEND_URL));

  if (isNewBackend) {
    return {
      type: "NEW_BACKEND",
      label: "🟢 NEW BACKEND API (v3/external)",
      shortLabel: "🟢 NEW BACKEND API",
      url: urlStr,
    };
  }

  if (isLegacyBackend) {
    return {
      type: "LEGACY_BACKEND",
      label: "🟡 LEGACY BACKEND API",
      shortLabel: "🟡 LEGACY BACKEND API",
      url: urlStr,
    };
  }

  return null;
}

/**
 * Starts tracking for a new test case.
 */
export function startTestApiTracking(tcId, testTitle) {
  currentTestApiState = {
    tcId: tcId || "N/A",
    testTitle: testTitle || "",
    verificationApis: [],
    browserApis: [],
  };
}

/**
 * Extracts pathname + search from a URL string safely.
 */
function getEndpointPath(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return urlStr;
  }
}

/**
 * Logs and tracks an API call used for test verification data.
 *
 * @param {string} method - HTTP Method (GET, POST, etc.)
 * @param {string} urlStr - Destination URL
 * @param {string} [contextLabel] - Source context label
 */
export function trackAndLogVerificationApi(method, urlStr, contextLabel = "Verification API") {
  if (!urlStr) return;

  const backend = classifyBackendApi(urlStr);
  const endpoint = getEndpointPath(urlStr);

  const entry = {
    type: backend ? backend.type : "EXTERNAL",
    label: backend ? backend.label : "EXTERNAL API",
    method: (method || "GET").toUpperCase(),
    endpoint,
    fullUrl: urlStr,
  };

  currentTestApiState.verificationApis.push(entry);

  if (backend) {
    console.log(`📡 [API VERIFICATION DATA]`);
    console.log(`   Backend Type : ${backend.label}`);
    console.log(`   Method       : ${entry.method}`);
    console.log(`   Endpoint     : ${endpoint}`);
    console.log(`   Full URL     : ${urlStr}\n`);
  } else if (!urlStr.includes("facebook.com") && !urlStr.includes("instagram.com") && !urlStr.includes("youtube.com")) {
    console.log(`📡 [API VERIFICATION DATA]`);
    console.log(`   Backend Type : ⚪ EXTERNAL / THIRD-PARTY`);
    console.log(`   Method       : ${entry.method}`);
    console.log(`   Endpoint     : ${endpoint}\n`);
  }
}

/**
 * Tracks an API request made by the browser page during navigation/user actions.
 */
export function trackBrowserApiCall(method, urlStr) {
  if (!urlStr) return;

  // Skip static images, fonts, stylesheets
  if (/\.(png|jpe?g|svg|webp|gif|css|woff2?|ttf|eot|ico)(\?.*)?$/i.test(urlStr)) {
    return;
  }

  const backend = classifyBackendApi(urlStr);
  if (!backend) return;

  const endpoint = getEndpointPath(urlStr);

  const isDuplicate = currentTestApiState.browserApis.some(
    (b) => b.method === method && b.endpoint === endpoint
  );

  if (!isDuplicate) {
    currentTestApiState.browserApis.push({
      type: backend.type,
      label: backend.shortLabel,
      method: (method || "GET").toUpperCase(),
      endpoint,
      fullUrl: urlStr,
    });
  }
}

/**
 * Returns formatted summary of APIs used during the test.
 */
export function getTestApiSummary() {
  const vList = currentTestApiState.verificationApis;
  const bList = currentTestApiState.browserApis;

  const vNew = vList.filter((a) => a.type === "NEW_BACKEND");
  const vLegacy = vList.filter((a) => a.type === "LEGACY_BACKEND");

  let verificationSummary = "ℹ️ UI-Only (No direct verification API called)";
  if (vNew.length > 0 && vLegacy.length > 0) {
    verificationSummary = `🟢 NEW BACKEND (${vNew.length} calls) + 🟡 LEGACY BACKEND (${vLegacy.length} calls)`;
  } else if (vNew.length > 0) {
    const endpoints = [...new Set(vNew.map((a) => a.endpoint.split("?")[0]))].join(", ");
    verificationSummary = `🟢 NEW BACKEND API (v3) [${endpoints}]`;
  } else if (vLegacy.length > 0) {
    const endpoints = [...new Set(vLegacy.map((a) => a.endpoint.split("?")[0]))].join(", ");
    verificationSummary = `🟡 LEGACY BACKEND API [${endpoints}]`;
  }

  const bNew = bList.filter((a) => a.type === "NEW_BACKEND");
  const bLegacy = bList.filter((a) => a.type === "LEGACY_BACKEND");

  let browserSummary = "None";
  if (bNew.length > 0 && bLegacy.length > 0) {
    browserSummary = "🟢 NEW BACKEND + 🟡 LEGACY BACKEND";
  } else if (bNew.length > 0) {
    browserSummary = "🟢 NEW BACKEND API (v3)";
  } else if (bLegacy.length > 0) {
    browserSummary = "🟡 LEGACY BACKEND API";
  }

  return {
    verification: verificationSummary,
    browser: browserSummary,
    hasVerificationApi: vList.length > 0,
    hasBrowserApi: bList.length > 0,
  };
}

/**
 * Wraps Playwright APIRequestContext to intercept .get(), .post(), etc.
 */
export function wrapRequestContext(apiContext, contextLabel = "API Request") {
  if (!apiContext || apiContext.__isWrapped) return apiContext;

  const targetMethods = new Set(["get", "post", "put", "patch", "delete", "head", "fetch"]);

  return new Proxy(apiContext, {
    get(target, prop, receiver) {
      if (prop === "__isWrapped") return true;

      const orig = Reflect.get(target, prop, receiver);
      if (targetMethods.has(prop) && typeof orig === "function") {
        return async function (urlOrRequest, ...rest) {
          const urlStr =
            typeof urlOrRequest === "string"
              ? urlOrRequest
              : urlOrRequest?.url?.() || (urlOrRequest?.url ? String(urlOrRequest.url) : "");

          trackAndLogVerificationApi(prop.toUpperCase(), urlStr, contextLabel);

          return orig.call(target, urlOrRequest, ...rest);
        };
      }
      return orig;
    },
  });
}
