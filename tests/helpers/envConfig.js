const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

if (!BASE_URL || !BACKEND_URL) {
  throw new Error("❌ Missing PROD_FRONTEND_URL or PROD_BACKEND_URL in .env");
}

let COUNTRY_ID;
let COUNTRY_NAME;
let CURRENCY;
let FEATURES = {
  games: true,
  directFnb: true,
};

if (BASE_URL.includes("uae")) {
  COUNTRY_ID = 2;
  COUNTRY_NAME = "UAE";
  CURRENCY = "AED";
  FEATURES = {
    games: false,
    directFnb: false,
  };
} else if (BASE_URL.includes("qatar") || BASE_URL.includes("qa")) {
  COUNTRY_ID = 1;
  COUNTRY_NAME = "QATAR";
  CURRENCY = "QAR";
} else {
  throw new Error("❌ Unable to detect country from BASE_URL");
}

console.log(`🌍 Running tests for ${COUNTRY_NAME} | country_id=${COUNTRY_ID}`);

export { BASE_URL, BACKEND_URL, COUNTRY_ID, COUNTRY_NAME, CURRENCY, FEATURES };

