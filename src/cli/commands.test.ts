import { describe, it, expect } from "vitest";
import { getImportAppleBackfillWindow } from "./commands.js";

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
