import Database from "libsql";
import { config } from "../config.js";
import { migrate } from "./schema.js";
import { dirname } from "path";
import { mkdirSync, existsSync, chmodSync } from "fs";

let singleDb: Database.Database | null = null;

function openDb(dbPath: string, encryptionKey?: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const opts: Record<string, string> = {};
  if (encryptionKey) {
    opts.encryptionCipher = "aes256cbc";
    opts.encryptionKey = encryptionKey;
  }

  const db = new Database(dbPath, opts);

  // Verify the database is accessible
  try {
    db.pragma("journal_mode = WAL");
  } catch (err: any) {
    db.close();
    throw new Error(
      "Failed to open database. Wrong encryption key or corrupt database file. " +
      "If you changed your encryption key, restore from backup or delete ~/.ray/data/finance.db to start fresh."
    );
  }

  db.pragma("foreign_keys = ON");
  migrate(db);
  try { chmodSync(dbPath, 0o600); } catch {}
  return db;
}

/** Get the single DB instance */
export function getDb(): Database.Database {
  if (!singleDb) {
    singleDb = openDb(config.dbPath, config.dbEncryptionKey || undefined);
  }
  return singleDb;
}

/** Close all connections (for graceful shutdown) */
export function closeAll(): void {
  singleDb?.close();
  singleDb = null;
}
