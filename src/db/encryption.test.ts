import { describe, it, expect } from "vitest";
import { generateKey, encryptPlaidToken, decryptPlaidToken } from "./encryption.js";
import { createCipheriv, randomBytes, scryptSync } from "crypto";

describe("generateKey", () => {
  it("returns a 64-char hex string (32 bytes)", () => {
    const key = generateKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns unique keys each call", () => {
    expect(generateKey()).not.toBe(generateKey());
  });
});

describe("encryptPlaidToken / decryptPlaidToken", () => {
  const secret = "test-secret-passphrase";

  it("roundtrips a token", () => {
    const token = "access-sandbox-abc123";
    const encrypted = encryptPlaidToken(token, secret);
    expect(decryptPlaidToken(encrypted, secret)).toBe(token);
  });

  it("produces 4-part format (salt:iv:authTag:data)", () => {
    const encrypted = encryptPlaidToken("token", secret);
    expect(encrypted.split(":")).toHaveLength(4);
  });

  it("produces different ciphertext each time (random salt+iv)", () => {
    const a = encryptPlaidToken("same-token", secret);
    const b = encryptPlaidToken("same-token", secret);
    expect(a).not.toBe(b);
  });

  it("roundtrips empty string", () => {
    const encrypted = encryptPlaidToken("", secret);
    expect(decryptPlaidToken(encrypted, secret)).toBe("");
  });

  it("roundtrips unicode", () => {
    const token = "tökén-with-émojis-🔑";
    const encrypted = encryptPlaidToken(token, secret);
    expect(decryptPlaidToken(encrypted, secret)).toBe(token);
  });

  it("throws with wrong secret", () => {
    const encrypted = encryptPlaidToken("token", secret);
    expect(() => decryptPlaidToken(encrypted, "wrong-secret")).toThrow();
  });

  it("throws when authTag is tampered", () => {
    const encrypted = encryptPlaidToken("token", secret);
    const parts = encrypted.split(":");
    // Flip a byte in the auth tag
    const tampered = parts[2][0] === "a" ? "b" + parts[2].slice(1) : "a" + parts[2].slice(1);
    parts[2] = tampered;
    expect(() => decryptPlaidToken(parts.join(":"), secret)).toThrow();
  });

  it("throws when encrypted data is tampered", () => {
    const encrypted = encryptPlaidToken("token", secret);
    const parts = encrypted.split(":");
    const tampered = parts[3][0] === "a" ? "b" + parts[3].slice(1) : "a" + parts[3].slice(1);
    parts[3] = tampered;
    expect(() => decryptPlaidToken(parts.join(":"), secret)).toThrow();
  });

  it("uses a 12-byte GCM IV for new encryptions", () => {
    const encrypted = encryptPlaidToken("token", secret);
    const [, ivHex, authTagHex] = encrypted.split(":");
    expect(Buffer.from(ivHex, "hex").length).toBe(12);
    expect(Buffer.from(authTagHex, "hex").length).toBe(16);
  });

  it("rejects truncated GCM auth tags", () => {
    const salt = randomBytes(16);
    const key = scryptSync(secret, salt, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 4 });
    const encrypted = Buffer.concat([cipher.update("token", "utf8"), cipher.final()]);
    const shortTag = cipher.getAuthTag();
    const payload = `${salt.toString("hex")}:${iv.toString("hex")}:${shortTag.toString("hex")}:${encrypted.toString("hex")}`;
    expect(() => decryptPlaidToken(payload, secret)).toThrow(/auth tag length/i);
  });

  it("rejects malformed part counts and invalid IV lengths", () => {
    expect(() => decryptPlaidToken("only:two", secret)).toThrow(/format/i);
    expect(() => decryptPlaidToken("a:b:c:d:e", secret)).toThrow(/format/i);
    const encrypted = encryptPlaidToken("token", secret);
    const parts = encrypted.split(":");
    parts[1] = "deadbeef"; // 4-byte IV
    expect(() => decryptPlaidToken(parts.join(":"), secret)).toThrow(/IV length/i);
  });

  it("decrypts legacy 4-part tokens encrypted with 16-byte IV", () => {
    const salt = randomBytes(16);
    const key = scryptSync(secret, salt, 32);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update("legacy-16-byte-iv", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
    expect(decryptPlaidToken(payload, secret)).toBe("legacy-16-byte-iv");
  });
});

describe("legacy 3-part format", () => {
  it("decrypts tokens encrypted with static salt", () => {
    const secret = "legacy-secret";
    const token = "access-sandbox-legacy";

    // Manually create a 3-part encrypted token using the hardcoded legacy salt
    const salt = Buffer.from("ray-finance-plaid-token", "utf8");
    const key = scryptSync(secret, salt, 32);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const legacy = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
    expect(decryptPlaidToken(legacy, secret)).toBe(token);
  });
});
