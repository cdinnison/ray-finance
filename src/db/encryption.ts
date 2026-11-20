import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const SCRYPT_KEYLEN = 32;
const SALT_LEN = 16;
const GCM_IV_LEN = 12;
const GCM_AUTH_TAG_LEN = 16;
const HEX_RE = /^[0-9a-fA-F]*$/;

export function generateKey(): string {
  return randomBytes(32).toString("hex");
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, SCRYPT_KEYLEN);
}

function decodeHexField(hex: string, label: string): Buffer {
  if (hex.length % 2 !== 0 || !HEX_RE.test(hex)) {
    throw new Error(`Invalid encrypted token: malformed ${label}.`);
  }
  return Buffer.from(hex, "hex");
}

export function encryptPlaidToken(token: string, secret: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(GCM_IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_AUTH_TAG_LEN });
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPlaidToken(encrypted: string, secret: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error("Invalid encrypted token format.");
  }
  // Support legacy 3-part format (static salt) and new 4-part format (random salt)
  let salt: Buffer, ivHex: string, authTagHex: string, dataHex: string;
  if (parts.length === 3) {
    salt = Buffer.from("ray-finance-plaid-token", "utf8");
    [ivHex, authTagHex, dataHex] = parts;
  } else {
    [, ivHex, authTagHex, dataHex] = parts;
    salt = decodeHexField(parts[0], "salt");
    if (salt.length !== SALT_LEN) {
      throw new Error("Invalid encrypted token: unexpected salt length.");
    }
  }
  const iv = decodeHexField(ivHex, "iv");
  // Accept both standard 12-byte IVs and legacy 16-byte IVs from older releases
  if (iv.length !== GCM_IV_LEN && iv.length !== 16) {
    throw new Error("Invalid encrypted token: unexpected IV length.");
  }
  const authTag = decodeHexField(authTagHex, "authTag");
  if (authTag.length !== GCM_AUTH_TAG_LEN) {
    throw new Error("Invalid encrypted token: unexpected auth tag length.");
  }
  const ciphertext = decodeHexField(dataHex, "ciphertext");
  const key = deriveKey(secret, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_AUTH_TAG_LEN });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
