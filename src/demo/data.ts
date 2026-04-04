import { LOGOS } from "./logos.js";

// ─── Date Helpers ─── //

const now = new Date();

function today(): string {
  return now.toISOString().slice(0, 10);
}

function yesterday(): string {
  return daysAgo(1);
}

function daysAgo(n: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** First of the month, N months ago (0 = this month) */
function monthStart(monthsAgo: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return d.toISOString().slice(0, 10);
}

/** Specific day of the month, N months ago. For current month (0), clamps to today. */
function monthDay(monthsAgo: number, day: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, day);
  if (monthsAgo === 0 && d > now) {
    // Clamp future current-month dates to recent past
    return daysAgo(Math.max(1, day % (now.getDate()) + 1));
  }
  return d.toISOString().slice(0, 10);
}

/** Date N months from now */
function monthsFromNow(n: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() + n, now.getDate());
  return d.toISOString().slice(0, 10);
}

/** Date N years ago */
function yearsAgo(n: number): string {
  const d = new Date(now.getFullYear() - n, now.getMonth(), now.getDate());
  return d.toISOString().slice(0, 10);
}

// ─── Institutions ─── //

export const institutions = [
  { item_id: "demo-chase", access_token: "demo-access-chase", name: "Chase", products: '["transactions","liabilities"]', logo: LOGOS.chase, primary_color: "#003087" },
  { item_id: "demo-robinhood", access_token: "demo-access-robinhood", name: "Robinhood", products: '["transactions","investments"]', logo: LOGOS.robinhood, primary_color: "#00C805" },
  { item_id: "demo-schwab", access_token: "demo-access-schwab", name: "Charles Schwab", products: '["transactions","investments"]', logo: LOGOS.schwab, primary_color: "#00A0DF" },
  { item_id: "demo-amex", access_token: "demo-access-amex", name: "American Express", products: '["transactions","liabilities"]', logo: LOGOS.amex, primary_color: "#006FCF" },
];

// ─── Accounts ─── //

export const accounts = [
  { account_id: "demo-chase-checking", item_id: "demo-chase", name: "Total Checking", official_name: "Chase Total Checking", type: "depository", subtype: "checking", mask: "4521", current_balance: 4200, available_balance: 4200, currency: "USD", balance_limit: null },
  { account_id: "demo-chase-savings", item_id: "demo-chase", name: "Chase Savings", official_name: "Chase Savings", type: "depository", subtype: "savings", mask: "7890", current_balance: 12500, available_balance: 12500, currency: "USD", balance_limit: null },
  { account_id: "demo-robinhood-brokerage", item_id: "demo-robinhood", name: "Individual", official_name: "Robinhood Individual", type: "investment", subtype: "brokerage", mask: "3344", current_balance: 34000, available_balance: null, currency: "USD", balance_limit: null },
  { account_id: "demo-schwab-401k", item_id: "demo-schwab", name: "401(k)", official_name: "Schwab 401(k)", type: "investment", subtype: "401k", mask: "9012", current_balance: 67000, available_balance: null, currency: "USD", balance_limit: null },
  { account_id: "demo-amex-gold", item_id: "demo-amex", name: "Gold Card", official_name: "American Express Gold Card", type: "credit", subtype: "credit card", mask: "1008", current_balance: 1830, available_balance: 13170, currency: "USD", balance_limit: 15000 },
  { account_id: "demo-chase-mortgage", item_id: "demo-chase", name: "Home Mortgage", official_name: "Chase Home Mortgage", type: "loan", subtype: "mortgage", mask: "6601", current_balance: 285000, available_balance: null, currency: "USD", balance_limit: null },
  { account_id: "demo-chase-home", item_id: "demo-chase", name: "Primary Residence", official_name: null, type: "other", subtype: "property", mask: null, current_balance: 425000, available_balance: null, currency: "USD", balance_limit: null },
];

// ─── Transactions ─── //

let txCounter = 0;
function txId(): string {
  return `demo-tx-${++txCounter}`;
}

const CHK = "demo-chase-checking";
const AMEX = "demo-amex-gold";

export const transactions = [
  // ── Income (negative = inflow in Plaid) ──
  { transaction_id: txId(), account_id: CHK, amount: -4250, date: monthDay(0, 1), name: "Payroll - Acme Corp", merchant_name: "Acme Corp", category: "INCOME", subcategory: "INCOME_WAGES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: -4250, date: monthDay(0, 15), name: "Payroll - Acme Corp", merchant_name: "Acme Corp", category: "INCOME", subcategory: "INCOME_WAGES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: -4250, date: monthDay(1, 1), name: "Payroll - Acme Corp", merchant_name: "Acme Corp", category: "INCOME", subcategory: "INCOME_WAGES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: -4250, date: monthDay(1, 15), name: "Payroll - Acme Corp", merchant_name: "Acme Corp", category: "INCOME", subcategory: "INCOME_WAGES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: -4250, date: monthDay(2, 1), name: "Payroll - Acme Corp", merchant_name: "Acme Corp", category: "INCOME", subcategory: "INCOME_WAGES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: -4250, date: monthDay(2, 15), name: "Payroll - Acme Corp", merchant_name: "Acme Corp", category: "INCOME", subcategory: "INCOME_WAGES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: -800, date: monthDay(1, 20), name: "Wire Transfer - Client LLC", merchant_name: "Client LLC", category: "INCOME", subcategory: "INCOME_OTHER", pending: 0, payment_channel: "online" },

  // ── Rent (3 months) ──
  { transaction_id: txId(), account_id: CHK, amount: 1850, date: monthDay(0, 1), name: "Rent Payment", merchant_name: null, category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_RENT", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 1850, date: monthDay(1, 1), name: "Rent Payment", merchant_name: null, category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_RENT", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 1850, date: monthDay(2, 1), name: "Rent Payment", merchant_name: null, category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_RENT", pending: 0, payment_channel: "online" },

  // ── Utilities ──
  { transaction_id: txId(), account_id: CHK, amount: 138.42, date: monthDay(0, 15), name: "PG&E", merchant_name: "PG&E", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 125.80, date: monthDay(1, 15), name: "PG&E", merchant_name: "PG&E", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 142.15, date: monthDay(2, 15), name: "PG&E", merchant_name: "PG&E", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 79.99, date: monthDay(0, 12), name: "Comcast Internet", merchant_name: "Comcast", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_INTERNET_AND_CABLE", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 79.99, date: monthDay(1, 12), name: "Comcast Internet", merchant_name: "Comcast", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_INTERNET_AND_CABLE", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 79.99, date: monthDay(2, 12), name: "Comcast Internet", merchant_name: "Comcast", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_INTERNET_AND_CABLE", pending: 0, payment_channel: "online" },

  // ── Food & Drink (this month — targeting ~$450 spend) ──
  { transaction_id: txId(), account_id: AMEX, amount: 89.42, date: monthDay(0, 3), name: "Whole Foods Market", merchant_name: "Whole Foods", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_GROCERIES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 52.18, date: monthDay(0, 7), name: "Trader Joe's", merchant_name: "Trader Joe's", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_GROCERIES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 34.67, date: monthDay(0, 14), name: "Safeway", merchant_name: "Safeway", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_GROCERIES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 67.30, date: monthDay(0, 5), name: "Olive Garden", merchant_name: "Olive Garden", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_RESTAURANTS", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 42.80, date: monthDay(0, 10), name: "Thai Kitchen", merchant_name: "Thai Kitchen", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_RESTAURANTS", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 12.45, date: monthDay(0, 8), name: "Chipotle", merchant_name: "Chipotle", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_FAST_FOOD", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 6.50, date: yesterday(), name: "Starbucks", merchant_name: "Starbucks", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_COFFEE", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 5.75, date: today(), name: "Blue Bottle Coffee", merchant_name: "Blue Bottle", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_COFFEE", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 78.50, date: monthDay(0, 18), name: "Whole Foods Market", merchant_name: "Whole Foods", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_GROCERIES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 58.35, date: daysAgo(3), name: "Sushi Roku", merchant_name: "Sushi Roku", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_RESTAURANTS", pending: 0, payment_channel: "in store" },

  // ── Food & Drink (last month) ──
  { transaction_id: txId(), account_id: AMEX, amount: 92.10, date: monthDay(1, 5), name: "Whole Foods Market", merchant_name: "Whole Foods", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_GROCERIES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 48.75, date: monthDay(1, 12), name: "Trader Joe's", merchant_name: "Trader Joe's", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_GROCERIES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 55.20, date: monthDay(1, 18), name: "Nobu", merchant_name: "Nobu", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_RESTAURANTS", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 14.30, date: monthDay(1, 22), name: "Chipotle", merchant_name: "Chipotle", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_FAST_FOOD", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 6.50, date: monthDay(1, 8), name: "Starbucks", merchant_name: "Starbucks", category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_COFFEE", pending: 0, payment_channel: "in store" },

  // ── Shopping (this month — large Apple purchase triggers alert) ──
  { transaction_id: txId(), account_id: AMEX, amount: 34.99, date: daysAgo(12), name: "Amazon", merchant_name: "Amazon", category: "GENERAL_MERCHANDISE", subcategory: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: AMEX, amount: 67.23, date: daysAgo(8), name: "Target", merchant_name: "Target", category: "GENERAL_MERCHANDISE", subcategory: "GENERAL_MERCHANDISE_SUPERSTORES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 29.99, date: daysAgo(4), name: "Uniqlo", merchant_name: "Uniqlo", category: "GENERAL_MERCHANDISE", subcategory: "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 849.99, date: today(), name: "Apple Store", merchant_name: "Apple", category: "GENERAL_MERCHANDISE", subcategory: "GENERAL_MERCHANDISE_ELECTRONICS", pending: 0, payment_channel: "in store" },

  // ── Shopping (last month) ──
  { transaction_id: txId(), account_id: AMEX, amount: 299.99, date: monthDay(1, 10), name: "Best Buy", merchant_name: "Best Buy", category: "GENERAL_MERCHANDISE", subcategory: "GENERAL_MERCHANDISE_ELECTRONICS", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: AMEX, amount: 42.50, date: monthDay(1, 16), name: "Amazon", merchant_name: "Amazon", category: "GENERAL_MERCHANDISE", subcategory: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", pending: 0, payment_channel: "online" },

  // ── Transportation (this month — targeting ~$100) ──
  { transaction_id: txId(), account_id: CHK, amount: 52.40, date: monthDay(0, 6), name: "Shell", merchant_name: "Shell", category: "TRANSPORTATION", subcategory: "TRANSPORTATION_GAS", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: CHK, amount: 18.75, date: monthDay(0, 11), name: "Uber", merchant_name: "Uber", category: "TRANSPORTATION", subcategory: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 24.30, date: yesterday(), name: "Uber", merchant_name: "Uber", category: "TRANSPORTATION", subcategory: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", pending: 0, payment_channel: "online" },

  // ── Transportation (last month) ──
  { transaction_id: txId(), account_id: CHK, amount: 48.90, date: monthDay(1, 8), name: "Shell", merchant_name: "Shell", category: "TRANSPORTATION", subcategory: "TRANSPORTATION_GAS", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: CHK, amount: 35.00, date: monthDay(1, 14), name: "Clipper Card", merchant_name: "BART", category: "TRANSPORTATION", subcategory: "TRANSPORTATION_PUBLIC_TRANSIT", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 22.15, date: monthDay(1, 25), name: "Uber", merchant_name: "Uber", category: "TRANSPORTATION", subcategory: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", pending: 0, payment_channel: "online" },

  // ── Entertainment (this month — targeting ~$85) ──
  { transaction_id: txId(), account_id: CHK, amount: 15.99, date: monthDay(0, 2), name: "Netflix", merchant_name: "Netflix", category: "ENTERTAINMENT", subcategory: "ENTERTAINMENT_TV_AND_MOVIES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 10.99, date: monthDay(0, 2), name: "Spotify", merchant_name: "Spotify", category: "ENTERTAINMENT", subcategory: "ENTERTAINMENT_MUSIC_AND_AUDIO", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 28.50, date: monthDay(0, 16), name: "AMC Theaters", merchant_name: "AMC", category: "ENTERTAINMENT", subcategory: "ENTERTAINMENT_TV_AND_MOVIES", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: CHK, amount: 49.99, date: daysAgo(5), name: "Steam", merchant_name: "Steam", category: "ENTERTAINMENT", subcategory: "ENTERTAINMENT_GAMES", pending: 0, payment_channel: "online" },

  // ── Entertainment (last month) ──
  { transaction_id: txId(), account_id: CHK, amount: 15.99, date: monthDay(1, 2), name: "Netflix", merchant_name: "Netflix", category: "ENTERTAINMENT", subcategory: "ENTERTAINMENT_TV_AND_MOVIES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 10.99, date: monthDay(1, 2), name: "Spotify", merchant_name: "Spotify", category: "ENTERTAINMENT", subcategory: "ENTERTAINMENT_MUSIC_AND_AUDIO", pending: 0, payment_channel: "online" },

  // ── Personal Care ──
  { transaction_id: txId(), account_id: CHK, amount: 35.00, date: monthDay(0, 17), name: "Supercuts", merchant_name: "Supercuts", category: "PERSONAL_CARE", subcategory: "PERSONAL_CARE_HAIR_AND_BEAUTY", pending: 0, payment_channel: "in store" },
  { transaction_id: txId(), account_id: CHK, amount: 22.47, date: daysAgo(2), name: "CVS Pharmacy", merchant_name: "CVS", category: "MEDICAL", subcategory: "MEDICAL_PHARMACIES_AND_SUPPLEMENTS", pending: 0, payment_channel: "in store" },

  // ── Loan Payments ──
  { transaction_id: txId(), account_id: CHK, amount: 2100, date: monthDay(0, 1), name: "Chase Mortgage Payment", merchant_name: "Chase", category: "LOAN_PAYMENTS", subcategory: "LOAN_PAYMENTS_MORTGAGE_PAYMENT", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 2100, date: monthDay(1, 1), name: "Chase Mortgage Payment", merchant_name: "Chase", category: "LOAN_PAYMENTS", subcategory: "LOAN_PAYMENTS_MORTGAGE_PAYMENT", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 2100, date: monthDay(2, 1), name: "Chase Mortgage Payment", merchant_name: "Chase", category: "LOAN_PAYMENTS", subcategory: "LOAN_PAYMENTS_MORTGAGE_PAYMENT", pending: 0, payment_channel: "online" },

  // ── Gym ──
  { transaction_id: txId(), account_id: CHK, amount: 95, date: monthDay(0, 5), name: "Equinox", merchant_name: "Equinox", category: "PERSONAL_CARE", subcategory: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 95, date: monthDay(1, 5), name: "Equinox", merchant_name: "Equinox", category: "PERSONAL_CARE", subcategory: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", pending: 0, payment_channel: "online" },

  // ── Car Insurance ──
  { transaction_id: txId(), account_id: CHK, amount: 145, date: monthDay(0, 20), name: "GEICO", merchant_name: "GEICO", category: "GENERAL_SERVICES", subcategory: "GENERAL_SERVICES_INSURANCE", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 145, date: monthDay(1, 20), name: "GEICO", merchant_name: "GEICO", category: "GENERAL_SERVICES", subcategory: "GENERAL_SERVICES_INSURANCE", pending: 0, payment_channel: "online" },

  // ── iCloud ──
  { transaction_id: txId(), account_id: CHK, amount: 2.99, date: monthDay(0, 3), name: "Apple iCloud", merchant_name: "Apple", category: "GENERAL_SERVICES", subcategory: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", pending: 0, payment_channel: "online" },
  { transaction_id: txId(), account_id: CHK, amount: 2.99, date: monthDay(1, 3), name: "Apple iCloud", merchant_name: "Apple", category: "GENERAL_SERVICES", subcategory: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", pending: 0, payment_channel: "online" },
];

// ─── Securities ─── //

export const securities = [
  { security_id: "demo-sec-aapl", name: "Apple Inc", ticker: "AAPL", type: "equity", close_price: 227.50, close_price_as_of: daysAgo(1) },
  { security_id: "demo-sec-tsla", name: "Tesla Inc", ticker: "TSLA", type: "equity", close_price: 172.30, close_price_as_of: daysAgo(1) },
  { security_id: "demo-sec-voo", name: "Vanguard S&P 500 ETF", ticker: "VOO", type: "etf", close_price: 532.80, close_price_as_of: daysAgo(1) },
  { security_id: "demo-sec-vtsax", name: "Vanguard Total Stock Market Index", ticker: "VTSAX", type: "mutual fund", close_price: 118.45, close_price_as_of: daysAgo(1) },
  { security_id: "demo-sec-vbtlx", name: "Vanguard Total Bond Market Index", ticker: "VBTLX", type: "mutual fund", close_price: 10.82, close_price_as_of: daysAgo(1) },
  { security_id: "demo-sec-vttvx", name: "Vanguard Target Retirement 2035", ticker: "VTTVX", type: "mutual fund", close_price: 28.15, close_price_as_of: daysAgo(1) },
];

// ─── Holdings ─── //

export const holdings = [
  { account_id: "demo-robinhood-brokerage", security_id: "demo-sec-aapl", quantity: 50, value: 11375, cost_basis: 8500, price: 227.50, price_as_of: daysAgo(1), vested_value: null, vested_quantity: null },
  { account_id: "demo-robinhood-brokerage", security_id: "demo-sec-tsla", quantity: 35, value: 6030.50, cost_basis: 7000, price: 172.30, price_as_of: daysAgo(1), vested_value: null, vested_quantity: null },
  { account_id: "demo-robinhood-brokerage", security_id: "demo-sec-voo", quantity: 31, value: 16516.80, cost_basis: 14200, price: 532.80, price_as_of: daysAgo(1), vested_value: null, vested_quantity: null },
  { account_id: "demo-schwab-401k", security_id: "demo-sec-vtsax", quantity: 280, value: 33166, cost_basis: 28000, price: 118.45, price_as_of: daysAgo(1), vested_value: 33166, vested_quantity: 280 },
  { account_id: "demo-schwab-401k", security_id: "demo-sec-vbtlx", quantity: 1200, value: 12984, cost_basis: 12500, price: 10.82, price_as_of: daysAgo(1), vested_value: 12984, vested_quantity: 1200 },
  { account_id: "demo-schwab-401k", security_id: "demo-sec-vttvx", quantity: 740, value: 20831, cost_basis: 18500, price: 28.15, price_as_of: daysAgo(1), vested_value: 20831, vested_quantity: 740 },
];

// ─── Liabilities ─── //

export const liabilities = [
  {
    account_id: "demo-amex-gold", type: "credit", interest_rate: 24.99, origination_date: null,
    original_balance: null, current_balance: 1830, minimum_payment: 35,
    next_payment_due: monthDay(0, 28), last_payment_amount: 500, last_payment_date: monthDay(1, 25),
    credit_limit: 15000, last_statement_issue_date: monthDay(1, 28), is_overdue: 0,
    apr_type: "variable", maturity_date: null, loan_type: null, property_address: null,
    escrow_balance: null, loan_status: null, loan_name: null, repayment_plan: null,
    expected_payoff_date: null, ytd_interest_paid: null, ytd_principal_paid: null,
  },
  {
    account_id: "demo-chase-mortgage", type: "mortgage", interest_rate: 6.875,
    origination_date: yearsAgo(3), original_balance: 320000, current_balance: 285000,
    minimum_payment: 2100, next_payment_due: monthDay(-1, 1),
    last_payment_amount: 2100, last_payment_date: monthDay(0, 1),
    credit_limit: null, last_statement_issue_date: null, is_overdue: 0,
    apr_type: "fixed", maturity_date: monthsFromNow(27 * 12), loan_type: "conventional",
    property_address: "123 Main St, San Francisco, CA 94102",
    escrow_balance: 4200, loan_status: "active", loan_name: "30yr Fixed",
    repayment_plan: null, expected_payoff_date: monthsFromNow(27 * 12),
    ytd_interest_paid: 6125, ytd_principal_paid: 2175,
  },
];

// ─── Recurring ─── //

export const recurring = [
  { stream_id: "demo-rec-salary", account_id: CHK, merchant_name: "Acme Corp", description: "Payroll - Acme Corp", frequency: "BIWEEKLY", category: "INCOME", subcategory: "INCOME_WAGES", avg_amount: -4250, last_amount: -4250, first_date: yearsAgo(2), last_date: monthDay(0, 15), is_active: 1, status: "MATURE", stream_type: "inflow" },
  { stream_id: "demo-rec-freelance", account_id: CHK, merchant_name: "Client LLC", description: "Wire Transfer - Client LLC", frequency: "MONTHLY", category: "INCOME", subcategory: "INCOME_OTHER", avg_amount: -800, last_amount: -800, first_date: yearsAgo(1), last_date: monthDay(1, 20), is_active: 1, status: "MATURE", stream_type: "inflow" },
  { stream_id: "demo-rec-rent", account_id: CHK, merchant_name: null, description: "Rent Payment", frequency: "MONTHLY", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_RENT", avg_amount: 1850, last_amount: 1850, first_date: yearsAgo(2), last_date: monthDay(0, 1), is_active: 1, status: "MATURE", stream_type: "outflow" },
  { stream_id: "demo-rec-netflix", account_id: CHK, merchant_name: "Netflix", description: "Netflix", frequency: "MONTHLY", category: "ENTERTAINMENT", subcategory: "ENTERTAINMENT_TV_AND_MOVIES", avg_amount: 15.99, last_amount: 15.99, first_date: yearsAgo(3), last_date: monthDay(0, 2), is_active: 1, status: "MATURE", stream_type: "outflow" },
  { stream_id: "demo-rec-spotify", account_id: CHK, merchant_name: "Spotify", description: "Spotify Premium", frequency: "MONTHLY", category: "ENTERTAINMENT", subcategory: "ENTERTAINMENT_MUSIC_AND_AUDIO", avg_amount: 10.99, last_amount: 10.99, first_date: yearsAgo(2), last_date: monthDay(0, 2), is_active: 1, status: "MATURE", stream_type: "outflow" },
  { stream_id: "demo-rec-electric", account_id: CHK, merchant_name: "PG&E", description: "PG&E Electric", frequency: "MONTHLY", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", avg_amount: 135, last_amount: 138.42, first_date: yearsAgo(2), last_date: monthDay(0, 15), is_active: 1, status: "MATURE", stream_type: "outflow" },
  { stream_id: "demo-rec-internet", account_id: CHK, merchant_name: "Comcast", description: "Comcast Internet", frequency: "MONTHLY", category: "RENT_AND_UTILITIES", subcategory: "RENT_AND_UTILITIES_INTERNET_AND_CABLE", avg_amount: 79.99, last_amount: 79.99, first_date: yearsAgo(2), last_date: monthDay(0, 12), is_active: 1, status: "MATURE", stream_type: "outflow" },
  { stream_id: "demo-rec-mortgage", account_id: CHK, merchant_name: "Chase", description: "Mortgage Payment", frequency: "MONTHLY", category: "LOAN_PAYMENTS", subcategory: "LOAN_PAYMENTS_MORTGAGE_PAYMENT", avg_amount: 2100, last_amount: 2100, first_date: yearsAgo(3), last_date: monthDay(0, 1), is_active: 1, status: "MATURE", stream_type: "outflow" },
  { stream_id: "demo-rec-gym", account_id: CHK, merchant_name: "Equinox", description: "Equinox Membership", frequency: "MONTHLY", category: "PERSONAL_CARE", subcategory: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", avg_amount: 95, last_amount: 95, first_date: yearsAgo(1), last_date: monthDay(0, 5), is_active: 1, status: "MATURE", stream_type: "outflow" },
  { stream_id: "demo-rec-icloud", account_id: CHK, merchant_name: "Apple", description: "iCloud Storage", frequency: "MONTHLY", category: "GENERAL_SERVICES", subcategory: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", avg_amount: 2.99, last_amount: 2.99, first_date: yearsAgo(4), last_date: monthDay(0, 3), is_active: 1, status: "MATURE", stream_type: "outflow" },
];

// ─── Budgets ─── //

export const budgets = [
  { category: "FOOD_AND_DRINK", monthly_limit: 600, period: "monthly" },
  { category: "GENERAL_MERCHANDISE", monthly_limit: 400, period: "monthly" },
  { category: "ENTERTAINMENT", monthly_limit: 150, period: "monthly" },
  { category: "TRANSPORTATION", monthly_limit: 200, period: "monthly" },
];

// ─── Goals ─── //

export const goals = [
  { name: "Emergency Fund", target_amount: 15000, current_amount: 6200, target_date: monthsFromNow(8), status: "active" },
  { name: "Japan Vacation", target_amount: 5000, current_amount: 2800, target_date: monthsFromNow(5), status: "active" },
  { name: "New Car Down Payment", target_amount: 8000, current_amount: 1200, target_date: monthsFromNow(14), status: "active" },
];

// ─── Daily Scores (14 days, building streaks) ─── //

export const dailyScores = [
  { date: daysAgo(13), score: 72, restaurant_count: 1, shopping_count: 0, food_spend: 55.20, total_spend: 180.40, zero_spend: 0, no_restaurant_streak: 0, no_shopping_streak: 1, on_pace_streak: 1 },
  { date: daysAgo(12), score: 68, restaurant_count: 0, shopping_count: 1, food_spend: 12.30, total_spend: 210.50, zero_spend: 0, no_restaurant_streak: 1, no_shopping_streak: 0, on_pace_streak: 0 },
  { date: daysAgo(11), score: 75, restaurant_count: 0, shopping_count: 0, food_spend: 0, total_spend: 95.00, zero_spend: 0, no_restaurant_streak: 2, no_shopping_streak: 1, on_pace_streak: 1 },
  { date: daysAgo(10), score: 92, restaurant_count: 0, shopping_count: 0, food_spend: 0, total_spend: 0, zero_spend: 1, no_restaurant_streak: 3, no_shopping_streak: 2, on_pace_streak: 2 },
  { date: daysAgo(9), score: 78, restaurant_count: 1, shopping_count: 0, food_spend: 42.80, total_spend: 120.30, zero_spend: 0, no_restaurant_streak: 0, no_shopping_streak: 3, on_pace_streak: 3 },
  { date: daysAgo(8), score: 65, restaurant_count: 0, shopping_count: 1, food_spend: 6.50, total_spend: 250.00, zero_spend: 0, no_restaurant_streak: 1, no_shopping_streak: 0, on_pace_streak: 0 },
  { date: daysAgo(7), score: 80, restaurant_count: 0, shopping_count: 0, food_spend: 34.67, total_spend: 34.67, zero_spend: 0, no_restaurant_streak: 2, no_shopping_streak: 1, on_pace_streak: 1 },
  { date: daysAgo(6), score: 85, restaurant_count: 0, shopping_count: 0, food_spend: 0, total_spend: 15.99, zero_spend: 0, no_restaurant_streak: 3, no_shopping_streak: 2, on_pace_streak: 2 },
  { date: daysAgo(5), score: 70, restaurant_count: 0, shopping_count: 0, food_spend: 0, total_spend: 49.99, zero_spend: 0, no_restaurant_streak: 4, no_shopping_streak: 3, on_pace_streak: 3 },
  { date: daysAgo(4), score: 82, restaurant_count: 0, shopping_count: 0, food_spend: 29.99, total_spend: 29.99, zero_spend: 0, no_restaurant_streak: 5, no_shopping_streak: 4, on_pace_streak: 4 },
  { date: daysAgo(3), score: 74, restaurant_count: 1, shopping_count: 0, food_spend: 58.35, total_spend: 58.35, zero_spend: 0, no_restaurant_streak: 0, no_shopping_streak: 5, on_pace_streak: 5 },
  { date: daysAgo(2), score: 83, restaurant_count: 0, shopping_count: 0, food_spend: 22.47, total_spend: 22.47, zero_spend: 0, no_restaurant_streak: 1, no_shopping_streak: 6, on_pace_streak: 6 },
  { date: yesterday(), score: 88, restaurant_count: 0, shopping_count: 0, food_spend: 6.50, total_spend: 30.80, zero_spend: 0, no_restaurant_streak: 2, no_shopping_streak: 7, on_pace_streak: 7 },
  { date: today(), score: 76, restaurant_count: 0, shopping_count: 0, food_spend: 5.75, total_spend: 855.74, zero_spend: 0, no_restaurant_streak: 3, no_shopping_streak: 8, on_pace_streak: 0 },
];

// ─── Achievements ─── //

export const achievements = [
  { key: "on_pace_7", name: "Clean Week", description: "7 consecutive days with all budgets on pace", unlocked_at: yesterday() },
  { key: "no_shopping_7", name: "Window Shopper", description: "7 days with zero shopping purchases", unlocked_at: daysAgo(2) },
  { key: "no_restaurant_7", name: "Kitchen Hero", description: "7-day no-restaurant streak", unlocked_at: daysAgo(5) },
  { key: "zero_hero", name: "Zero Hero", description: "A zero-spend day", unlocked_at: daysAgo(10) },
];

// ─── Net Worth History (30 days) ─── //

export const netWorthHistory: { date: string; total_assets: number; total_liabilities: number; net_worth: number }[] = [];
{
  const baseAssets = 539000;
  const baseLiabilities = 287200;
  for (let i = 29; i >= 0; i--) {
    const jitter = Math.sin(i * 0.7) * 150 + (29 - i) * 130;
    const assets = Math.round((baseAssets + jitter) * 100) / 100;
    const liabJitter = Math.sin(i * 0.5) * 50 - (29 - i) * 8;
    const liab = Math.round((baseLiabilities + liabJitter) * 100) / 100;
    netWorthHistory.push({
      date: daysAgo(i),
      total_assets: assets,
      total_liabilities: liab,
      net_worth: Math.round((assets - liab) * 100) / 100,
    });
  }
}

// ─── Investment Transactions ─── //

export const investmentTransactions = [
  { investment_transaction_id: "demo-inv-tx-1", account_id: "demo-robinhood-brokerage", security_id: "demo-sec-aapl", date: daysAgo(30), name: "Buy AAPL", quantity: 5, amount: -1100.75, price: 220.15, fees: 0, type: "buy", subtype: "buy", iso_currency_code: "USD" },
  { investment_transaction_id: "demo-inv-tx-2", account_id: "demo-robinhood-brokerage", security_id: "demo-sec-voo", date: daysAgo(45), name: "Buy VOO", quantity: 10, amount: -5284.00, price: 528.40, fees: 0, type: "buy", subtype: "buy", iso_currency_code: "USD" },
  { investment_transaction_id: "demo-inv-tx-3", account_id: "demo-robinhood-brokerage", security_id: "demo-sec-voo", date: daysAgo(15), name: "Dividend VOO", quantity: 0, amount: -32.50, price: 0, fees: 0, type: "cash", subtype: "dividend", iso_currency_code: "USD" },
  { investment_transaction_id: "demo-inv-tx-4", account_id: "demo-schwab-401k", security_id: "demo-sec-vtsax", date: daysAgo(14), name: "401k Contribution", quantity: 8.5, amount: -1006.83, price: 118.45, fees: 0, type: "buy", subtype: "contribution", iso_currency_code: "USD" },
  { investment_transaction_id: "demo-inv-tx-5", account_id: "demo-schwab-401k", security_id: "demo-sec-vtsax", date: daysAgo(28), name: "401k Contribution", quantity: 8.5, amount: -1006.83, price: 118.45, fees: 0, type: "buy", subtype: "contribution", iso_currency_code: "USD" },
  { investment_transaction_id: "demo-inv-tx-6", account_id: "demo-schwab-401k", security_id: "demo-sec-vbtlx", date: daysAgo(20), name: "Dividend VBTLX", quantity: 0, amount: -18.40, price: 0, fees: 0, type: "cash", subtype: "dividend", iso_currency_code: "USD" },
];

// ─── Recurring Bills ─── //

export const recurringBills = [
  { name: "Rent", amount: 1850, day_of_month: 1, type: "housing", account_id: CHK },
  { name: "Mortgage", amount: 2100, day_of_month: 1, type: "housing", account_id: CHK },
  { name: "Electric", amount: 135, day_of_month: 15, type: "utility", account_id: CHK },
  { name: "Internet", amount: 79.99, day_of_month: 12, type: "utility", account_id: CHK },
  { name: "Car Insurance", amount: 145, day_of_month: 20, type: "insurance", account_id: CHK },
];

// ─── Memories ─── //

export const memories = [
  { content: "User prefers index fund investing and dollar-cost averaging", category: "preference" },
  { content: "User is saving for a trip to Japan next year", category: "goal" },
];
