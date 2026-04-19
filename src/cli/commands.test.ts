import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getImportAppleBackfillWindow, parseMoneyStrict } from "./commands.js";

describe("getImportAppleBackfillWindow", () => {
  it("backs up to yesterday for same-day-only imports", () => {
    const window = getImportAppleBackfillWindow(
      {
        dateRange: { first: "2026-04-16", last: "2026-04-16" },
        replaceWindow: { first: "2026-04-16", last: "2026-04-16" },
      },
      {},
      new Date("2026-04-16T12:00:00Z")
    );

    expect(window).toEqual({ start: "2026-04-15", end: "2026-04-15" });
  });

  it("uses the wider replace window when replace-range is enabled", () => {
    const window = getImportAppleBackfillWindow(
      {
        dateRange: { first: "2026-04-10", last: "2026-04-10" },
        replaceWindow: { first: "2026-04-08", last: "2026-04-10" },
      },
      { replaceRange: true },
      new Date("2026-04-16T12:00:00Z")
    );

    expect(window).toEqual({ start: "2026-04-08", end: "2026-04-15" });
  });

  it("returns null when there is no imported date range", () => {
    const window = getImportAppleBackfillWindow(
      {
        dateRange: null,
        replaceWindow: null,
      },
      { replaceRange: true },
      new Date("2026-04-16T12:00:00Z")
    );

    expect(window).toBeNull();
  });
});

describe("parseMoneyStrict", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("returns undefined for a missing flag", () => {
    expect(parseMoneyStrict("balance", undefined, false)).toBeUndefined();
  });

  it("returns undefined for an empty string (falls through to prompt path)", () => {
    expect(parseMoneyStrict("balance", "", false)).toBeUndefined();
  });

  it("parses a plain integer", () => {
    expect(parseMoneyStrict("balance", "1234", false)).toBe(1234);
  });

  it("parses a decimal", () => {
    expect(parseMoneyStrict("balance", "1234.56", false)).toBe(1234.56);
  });

  it("strips $ and , from formatted input", () => {
    expect(parseMoneyStrict("balance", "$1,200.50", false)).toBe(1200.5);
  });

  it("accepts a negative value", () => {
    expect(parseMoneyStrict("balance", "-100", false)).toBe(-100);
  });

  it("rejects trailing junk (e.g. 123abc)", () => {
    expect(parseMoneyStrict("balance", "123abc", false)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--balance must be a number (got "123abc")')
    );
  });

  it("rejects leading junk (e.g. abc123)", () => {
    expect(parseMoneyStrict("limit", "abc123", false)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--limit must be a number (got "abc123")')
    );
  });

  it("rejects pure garbage", () => {
    expect(parseMoneyStrict("balance", "foo", false)).toBeNull();
  });

  it("rejects a double decimal", () => {
    expect(parseMoneyStrict("balance", "1.2.3", false)).toBeNull();
  });

  it("names the correct flag in the error message", () => {
    parseMoneyStrict("limit", "not-a-number", false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--limit must be a number (got "not-a-number")')
    );
  });
});
