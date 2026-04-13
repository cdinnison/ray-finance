import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "./config.js";
import { formatCurrencyAmount, getDisplayCurrency } from "./currency.js";

const ORIGINAL_LOCALE = config.displayLocale;
const ORIGINAL_CURRENCY = config.displayCurrency;

describe("currency helpers", () => {
  afterEach(() => {
    config.displayLocale = ORIGINAL_LOCALE;
    config.displayCurrency = ORIGINAL_CURRENCY;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("respects an explicit display currency override", () => {
    config.displayCurrency = "EUR";
    expect(getDisplayCurrency()).toBe("EUR");
  });

  it("falls back to timezone-aware currency inference", () => {
    config.displayLocale = "en-US";
    config.displayCurrency = "";
    const realDateTimeFormat = Intl.DateTimeFormat;

    vi.spyOn(Intl, "DateTimeFormat").mockImplementation((...args: any[]) => {
      if (args.length > 0) {
        return new (realDateTimeFormat as any)(...args);
      }

      return {
        resolvedOptions: () => ({ locale: "en-US", timeZone: "Europe/Paris" }),
      } as Intl.DateTimeFormat;
    });

    expect(getDisplayCurrency()).toBe("EUR");
  });

  it("formats localized currency strings", () => {
    config.displayLocale = "fr-FR";
    config.displayCurrency = "EUR";

    expect(formatCurrencyAmount(1234.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toContain("€");
  });
});
