import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config.js", () => ({
  config: { userName: "John Smith" },
}));

vi.mock("./context.js", () => ({
  readContext: vi.fn().mockReturnValue(
    `## Family
- Partner: Jane Doe (wife)
- Max (son)

## Income
- $120k/year from Acme Corp

## Accounts
- Checking at Chase
`
  ),
}));

import { redact, unredact } from "./redactor.js";

describe("redact", () => {
  it("redacts user full name", () => {
    expect(redact("John Smith earned $100")).toBe("[USER] earned $100");
  });

  it("redacts user first and last name separately", () => {
    expect(redact("Hi John, Mr. Smith")).toBe("Hi [USER_FIRST], Mr. [USER_LAST]");
  });

  it("redacts partner name", () => {
    expect(redact("Jane Doe said hello")).toBe("[PARTNER] said hello");
  });

  it("redacts employer", () => {
    expect(redact("Works at Acme Corp")).toBe("Works at [EMPLOYER]");
  });

  it("redacts SSN with dashes", () => {
    expect(redact("SSN: 123-45-6789")).toBe("SSN: [SSN]");
  });

  it("redacts credit card numbers", () => {
    expect(redact("Card: 4111 1111 1111 1111")).toBe("Card: [CARD]");
  });

  it("leaves text without PII unchanged", () => {
    const text = "The weather is nice today";
    expect(redact(text)).toBe(text);
  });

  it("redacts names and employers case-insensitively (e.g. uppercase bank descriptions)", () => {
    expect(redact("DIRECT DEPOSIT ACME CORP FOR JOHN SMITH")).toBe("DIRECT DEPOSIT [EMPLOYER] FOR [USER]");
    expect(redact("ZELLE TO JANE DOE")).toBe("ZELLE TO [PARTNER]");
  });

  it("assigns distinct tokens to multiple family members so unredact is lossless", () => {
    const redacted = redact("Jane Doe and Max went to lunch");
    expect(redacted).toBe("[PARTNER] and [FAMILY_2] went to lunch");
    expect(unredact(redacted)).toBe("Jane Doe and Max went to lunch");
  });

  it("redacts IBANs, emails, phone numbers, and 15-digit Amex cards", () => {
    expect(redact("IBAN: FR76 3000 6000 0112 3456 7890 189")).toBe("IBAN: [IBAN]");
    expect(redact("Contact: user@example.com or (555) 123-4567")).toBe("Contact: [EMAIL] or [PHONE]");
    expect(redact("Amex: 3782-822463-10005")).toBe("Amex: [CARD]");
  });
});

describe("unredact", () => {
  it("restores user name tokens", () => {
    expect(unredact("Hello [USER]")).toBe("Hello John Smith");
  });

  it("restores partner tokens", () => {
    expect(unredact("[PARTNER] called")).toBe("Jane Doe called");
  });
});
