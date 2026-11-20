import { describe, it, expect, vi } from "vitest";
import { isValidRedfinUrl, scrapeRedfinEstimate } from "./property.js";

describe("isValidRedfinUrl", () => {
  it("accepts HTTPS redfin.com and subdomain URLs", () => {
    expect(isValidRedfinUrl("https://www.redfin.com/CA/San-Francisco/123-Main-St/home/12345")).toBe(true);
    expect(isValidRedfinUrl("https://redfin.com/home/12345")).toBe(true);
  });

  it("rejects non-HTTPS, lookalike hosts, credentials, and SSRF targets", () => {
    expect(isValidRedfinUrl("http://www.redfin.com/home/12345")).toBe(false);
    expect(isValidRedfinUrl("https://redfin.com.evil.example/home/12345")).toBe(false);
    expect(isValidRedfinUrl("https://evil-redfin.com/home/12345")).toBe(false);
    expect(isValidRedfinUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isValidRedfinUrl("http://127.0.0.1:9876/")).toBe(false);
    expect(isValidRedfinUrl("file:///etc/passwd")).toBe(false);
    expect(isValidRedfinUrl("https://user:pass@www.redfin.com/home/1")).toBe(false);
    expect(isValidRedfinUrl("not-a-url")).toBe(false);
  });
});

describe("scrapeRedfinEstimate", () => {
  it("refuses to fetch non-Redfin URLs", async () => {
    const fetchMock = vi.fn();
    const res = await scrapeRedfinEstimate("http://169.254.169.254/latest/meta-data/", fetchMock as unknown as typeof fetch);
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses off-domain redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://attacker.example/secret" } }),
    );
    const res = await scrapeRedfinEstimate("https://www.redfin.com/home/1", fetchMock as unknown as typeof fetch);
    expect(res).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("parses Redfin estimate from valid HTTPS response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(`<div>"estimatedValue": 825000</div>`, { status: 200 }),
    );
    const res = await scrapeRedfinEstimate("https://www.redfin.com/home/1", fetchMock as unknown as typeof fetch);
    expect(res).toBe(825000);
  });
});
