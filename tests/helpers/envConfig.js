const BASE_URL = process.env.PROD_FRONTEND_URL;
const NEW_BACKEND_URL =
  process.env.PROD_NEW_BACKEND_URL || "https://web-api.novocinemas.com/api/v3/external";
const LEGACY_BACKEND_URL =
  process.env.PROD_LEGACY_BACKEND_URL || "https://backend.novocinemas.com/api";
const BACKEND_URL = process.env.PROD_BACKEND_URL || "https://backend.novocinemas.com";

if (!BASE_URL) {
  throw new Error("❌ Missing PROD_FRONTEND_URL in .env");
}

if (!process.env.mx_token) {
  throw new Error("❌ Missing required mx_token in environment variables (.env)");
}

let COUNTRY_ID = 1;
const NEW_BACKEND_COUNTRY_ID = 178;
let COUNTRY_NAME = process.env.COUNTRY_NAME || "QATAR";
const COUNTRY_CODE = process.env.COUNTRY_CODE || "QA";
let CURRENCY = process.env.CURRENCY || "QAR";
let FEATURES = {
  games: true,
  directFnb: true,
};

if (BASE_URL.includes("qatar") || BASE_URL.includes("qa")) {
  COUNTRY_ID = 1;
  COUNTRY_NAME = "QATAR";
  CURRENCY = "QAR";
} else {
  throw new Error("❌ Unable to detect country from BASE_URL");
}

console.log(
  `🌍 Running tests for ${COUNTRY_NAME} | country_id=${COUNTRY_ID} (new_backend_country_id=${NEW_BACKEND_COUNTRY_ID})`
);

export {
  BASE_URL,
  NEW_BACKEND_URL,
  LEGACY_BACKEND_URL,
  BACKEND_URL,
  COUNTRY_ID,
  NEW_BACKEND_COUNTRY_ID,
  COUNTRY_NAME,
  COUNTRY_CODE,
  CURRENCY,
  FEATURES,
};

export {
  getGlobalSettings,
  getLegacyBackendUrl,
  getGlobalCountryConfig,
  clearGlobalSettingsCache,
  sanitizeUrl,
  isTrustedLegacyBackendUrl,
  validateGlobalSettingsData,
} from "./api/globalSettings.js";

export {
  buildNewBackendUrl,
  newBackendRequest,
  newBackendGet,
  newBackendPost,
} from "./api/newBackendRequest.js";

export {
  buildLegacyBackendUrl,
  legacyBackendRequest,
  legacyBackendGet,
  legacyBackendPost,
} from "./api/legacyBackendRequest.js";

