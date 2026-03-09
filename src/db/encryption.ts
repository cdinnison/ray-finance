import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const SCRYPT_KEYLEN = 32;
const SALT_LEN = 16;

export function generateKey(): string {
  return randomBytes(32).toString("hex");
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, SCRYPT_KEYLEN);
}

export function encryptPlaidToken(token: string, secret: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPlaidToken(encrypted: string, secret: string): string {
  const parts = encrypted.split(":");
  // Support legacy 3-part format (static salt) and new 4-part format (random salt)
  let salt: Buffer, ivHex: string, authTagHex: string, dataHex: string;
  if (parts.length === 3) {
    salt = Buffer.from("ray-finance-plaid-token", "utf8");
    [ivHex, authTagHex, dataHex] = parts;
  } else {
    [, ivHex, authTagHex, dataHex] = parts;
    salt = Buffer.from(parts[0], "hex");
  }
  const key = deriveKey(secret, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")) + decipher.final("utf8");
}
