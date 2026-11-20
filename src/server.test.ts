import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { isAllowedLocalOrigin } from "./server.js";

describe("isAllowedLocalOrigin", () => {
  it("allows exact localhost and 127.0.0.1 origins on the configured port", () => {
    expect(isAllowedLocalOrigin("http://localhost:9876", 9876)).toBe(true);
    expect(isAllowedLocalOrigin("http://127.0.0.1:9876", 9876)).toBe(true);
    expect(isAllowedLocalOrigin("http://localhost:9876/link/abc", 9876)).toBe(true);
    expect(isAllowedLocalOrigin("http://127.0.0.1:9876/oauth-return?oauth_state_id=1", 9876)).toBe(true);
  });

  it("rejects prefix-spoofed origins, wrong ports, wrong schemes, and missing headers", () => {
    expect(isAllowedLocalOrigin(undefined, 9876)).toBe(false);
    expect(isAllowedLocalOrigin("", 9876)).toBe(false);
    expect(isAllowedLocalOrigin("http://localhost:9876.evil.com", 9876)).toBe(false);
    expect(isAllowedLocalOrigin("http://127.0.0.1:9876.evil.com", 9876)).toBe(false);
    expect(isAllowedLocalOrigin("http://localhost:98760", 9876)).toBe(false);
    expect(isAllowedLocalOrigin("https://localhost:9876", 9876)).toBe(false);
    expect(isAllowedLocalOrigin("https://evil.example", 9876)).toBe(false);
    expect(isAllowedLocalOrigin("not-a-url", 9876)).toBe(false);
  });
});

describe("Plaid Link static HTML hardening", () => {
  const publicDir = resolve(process.cwd(), "src", "public");

  for (const filename of ["link.html", "oauth-return.html"]) {
    it(`${filename} avoids innerHTML and localStorage`, () => {
      const html = readFileSync(resolve(publicDir, filename), "utf-8");
      expect(html).not.toContain(".innerHTML");
      expect(html).not.toContain("localStorage");
    });
  }
});
