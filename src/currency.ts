import { config } from "./config.js";

const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "USD";

const REGION_CURRENCY_MAP: Record<string, string> = {
  AT: "EUR",
  AU: "AUD",
  BE: "EUR",
  CA: "CAD",
  CH: "CHF",
  DE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GB: "GBP",
  IE: "EUR",
  IT: "EUR",
  JP: "JPY",
  LU: "EUR",
  NL: "EUR",
  NZ: "NZD",
  PT: "EUR",
  US: "USD",
};

const TIMEZONE_CURRENCY_MAP: Array<{ prefix: string; currency: string }> = [
  { prefix: "Europe/Paris", currency: "EUR" },
  { prefix: "Europe/Berlin", currency: "EUR" },
  { prefix: "Europe/Madrid", currency: "EUR" },
  { prefix: "Europe/Rome", currency: "EUR" },
  { prefix: "Europe/Amsterdam", currency: "EUR" },
  { prefix: "Europe/Brussels", currency: "EUR" },
  { prefix: "Europe/Lisbon", currency: "EUR" },
  { prefix: "Europe/Vienna", currency: "EUR" },
  { prefix: "Europe/Helsinki", currency: "EUR" },
  { prefix: "Europe/Dublin", currency: "EUR" },
  { prefix: "Europe/Luxembourg", currency: "EUR" },
  { prefix: "Europe/London", currency: "GBP" },
  { prefix: "Europe/Zurich", currency: "CHF" },
  { prefix: "America/", currency: "USD" },
  { prefix: "Australia/", currency: "AUD" },
  { prefix: "Pacific/Auckland", currency: "NZD" },
  { prefix: "Asia/Tokyo", currency: "JPY" },
];

function getResolvedLocale(): string {
  return (
    config.displayLocale ||
    process.env.RAY_DISPLAY_LOCALE ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    process.env.LC_ALL ||
    process.env.LC_MONETARY ||
    process.env.LANG ||
    DEFAULT_LOCALE
  );
}

function getLocaleRegion(locale: string): string | null {
  const normalized = locale.replace(/_/g, "-");
  const parts = normalized.split("-");
  const region = parts.find(part => /^[A-Z]{2}$/.test(part));
  return region || null;
}

function inferCurrencyFromLocale(locale: string): string {
  const region = getLocaleRegion(locale);
  if (!region) return DEFAULT_CURRENCY;
  return REGION_CURRENCY_MAP[region] || DEFAULT_CURRENCY;
}

function inferCurrencyFromTimeZone(timeZone: string): string | null {
  const match = TIMEZONE_CURRENCY_MAP.find(entry => timeZone.startsWith(entry.prefix));
  return match?.currency || null;
}

export function getDisplayLocale(): string {
  return getResolvedLocale();
}

export function getDisplayCurrency(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const localeCurrency = inferCurrencyFromLocale(getDisplayLocale());
  const timeZoneCurrency = inferCurrencyFromTimeZone(timeZone);

  return (
    config.displayCurrency ||
    process.env.RAY_DISPLAY_CURRENCY ||
    (timeZoneCurrency && localeCurrency === DEFAULT_CURRENCY ? timeZoneCurrency : localeCurrency)
  );
}

export function formatCurrencyAmount(
  amount: number,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  } = {},
): string {
  const locale = getDisplayLocale();
  const currency = getDisplayCurrency();

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits,
  }).format(Math.abs(amount));
}
