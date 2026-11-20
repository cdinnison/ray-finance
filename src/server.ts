import express from "express";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { randomUUID } from "crypto";
import { createLinkToken, exchangeToken } from "./plaid/link.js";
import { syncBalances, syncTransactions, syncInvestments, syncInvestmentTransactions, syncLiabilities, syncRecurring, isProductNotSupported } from "./plaid/sync.js";
import { plaidClient } from "./plaid/client.js";
import { getCountryCodes } from "./plaid/link.js";
import { encryptPlaidToken } from "./db/encryption.js";
import { config } from "./config.js";
import { getDb } from "./db/connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Session map for Plaid Link — maps sessionId → true (single-user, no chatId needed)
const linkSessions = new Map<string, boolean>();

// Simple rate limiter: track request counts per IP
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per window

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

interface LinkResult {
  url: string;
  waitForComplete: () => Promise<void>;
  stop: () => void;
}

interface PlaidErrorJson {
  error: string;
  error_code?: string;
  error_type?: string;
}

function plaidErrorJson(error: any, fallback: string): PlaidErrorJson {
  const data = error?.response?.data;
  const code: string | undefined = data?.error_code;
  const type: string | undefined = data?.error_type;
  let message: string =
    data?.display_message ||
    data?.error_message ||
    error?.message ||
    fallback;
  if (code === "INVALID_API_KEYS") {
    message =
      "Plaid credentials error — make sure you're using production (not sandbox) keys. Check PLAID_CLIENT_ID and PLAID_SECRET in ~/.ray/config.json.";
  }
  return { error: message, error_code: code, error_type: type };
}

export function isAllowedLocalOrigin(headerValue: string | undefined, port: number): boolean {
  if (!headerValue) return false;
  try {
    const parsed = new URL(headerValue);
    return (
      parsed.origin === `http://localhost:${port}` ||
      parsed.origin === `http://127.0.0.1:${port}`
    );
  } catch {
    return false;
  }
}

export function startLinkServer(): LinkResult {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  // Apply strict browser security headers and localhost-only origin verification
  app.use((req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.plaid.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' https://*.plaid.com",
        "frame-src https://*.plaid.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );

    const originHeader = typeof req.headers.origin === "string"
      ? req.headers.origin
      : typeof req.headers.referer === "string"
        ? req.headers.referer
        : undefined;
    const ip = req.ip || req.socket.remoteAddress || "";
    if (req.path.startsWith("/api/")) {
      // Require exact localhost origin/referer for API routes
      if (!isAllowedLocalOrigin(originHeader, config.port)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      // Rate limit API routes
      if (isRateLimited(ip)) {
        res.status(429).json({ error: "Too many requests" });
        return;
      }
    }
    next();
  });

  app.use(express.static(resolve(__dirname, "public")));

  const sessionId = randomUUID();
  linkSessions.set(sessionId, true);

  let resolveComplete: () => void;
  const completePromise = new Promise<void>((res) => { resolveComplete = res; });

  // Serve Plaid Link page
  app.get("/link/:session", (req, res) => {
    const sid = req.params.session;
    if (!linkSessions.has(sid)) {
      res.status(404).send("Link session expired or invalid. Please run 'ray link' again.");
      return;
    }
    res.sendFile(resolve(__dirname, "public", "link.html"));
  });

  // OAuth redirect return page (Chase, Capital One, etc. send the user here after bank login)
  app.get("/oauth-return", (_req, res) => {
    res.sendFile(resolve(__dirname, "public", "oauth-return.html"));
  });

  // Create link token
  app.post("/api/link-token", async (req, res) => {
    try {
      const { session_id } = req.body ?? {};
      if (typeof session_id !== "string" || !linkSessions.has(session_id)) {
        res.status(404).json({ error: "Invalid or expired session" });
        return;
      }
      const linkToken = await createLinkToken();
      res.json({ link_token: linkToken });
    } catch (error: any) {
      const body = plaidErrorJson(error, "Failed to create link token");
      console.error("Link token error:", body.error_code || body.error_type || "", body.error);
      res.status(500).json(body);
    }
  });

  // Exchange public token
  app.post("/api/exchange", async (req, res) => {
    try {
      const { public_token, session_id, institution_name } = req.body ?? {};
      if (typeof session_id !== "string" || !linkSessions.has(session_id)) {
        res.status(404).json({ error: "Invalid or expired session" });
        return;
      }
      if (typeof public_token !== "string" || !public_token.trim()) {
        res.status(400).json({ error: "Missing public_token" });
        return;
      }

      const db = getDb();
      const { accessToken, itemId } = await exchangeToken(public_token);

      // Encrypt token — refuse to store without encryption
      if (!config.plaidTokenSecret) {
        res.status(500).json({ error: "Plaid token secret not configured. Run 'ray setup' to set one." });
        return;
      }
      const encryptedToken = encryptPlaidToken(accessToken, config.plaidTokenSecret);

      // Fetch actual enabled products and authoritative institution_id from Plaid
      const itemResp = await plaidClient.itemGet({ access_token: accessToken });
      const products: string[] = (itemResp.data.item.products || []) as string[];
      const verifiedInstitutionId = itemResp.data.item.institution_id || (typeof req.body?.institution_id === "string" ? req.body.institution_id : null);

      // Resolve canonical institution metadata from Plaid when available
      let resolvedName = typeof institution_name === "string" && institution_name.trim()
        ? institution_name.trim()
        : "Account";
      let institutionLogo: string | null = null;
      let primaryColor: string | null = null;
      if (verifiedInstitutionId) {
        try {
          const { data } = await plaidClient.institutionsGetById({
            institution_id: verifiedInstitutionId,
            country_codes: getCountryCodes(),
            options: { include_optional_metadata: true },
          });
          if (data.institution.name) resolvedName = data.institution.name;
          institutionLogo = data.institution.logo || null;
          primaryColor = data.institution.primary_color || null;
        } catch {}
      }

      // Atomically remove duplicate Plaid institution if re-linking the same one and upsert the new item
      const saveInstitution = db.transaction(() => {
        if (verifiedInstitutionId) {
          const existing = db.prepare(
            `SELECT item_id FROM institutions WHERE provider = 'plaid' AND name = ? AND item_id != ?`
          ).all(resolvedName, itemId) as { item_id: string }[];
          for (const old of existing) {
            const oldAccounts = db.prepare(`SELECT account_id FROM accounts WHERE item_id = ?`).all(old.item_id) as { account_id: string }[];
            for (const acct of oldAccounts) {
              db.prepare(`DELETE FROM transactions WHERE account_id = ?`).run(acct.account_id);
              db.prepare(`DELETE FROM holdings WHERE account_id = ?`).run(acct.account_id);
              db.prepare(`DELETE FROM investment_transactions WHERE account_id = ?`).run(acct.account_id);
              db.prepare(`DELETE FROM liabilities WHERE account_id = ?`).run(acct.account_id);
              db.prepare(`DELETE FROM recurring WHERE account_id = ?`).run(acct.account_id);
            }
            db.prepare(`DELETE FROM accounts WHERE item_id = ?`).run(old.item_id);
            db.prepare(`DELETE FROM institutions WHERE item_id = ?`).run(old.item_id);
          }
        }

        db.prepare(
          `INSERT INTO institutions (item_id, access_token, name, products, logo, primary_color)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET
             access_token = excluded.access_token,
             name = excluded.name,
             products = excluded.products,
             logo = COALESCE(excluded.logo, logo),
             primary_color = COALESCE(excluded.primary_color, primary_color)`
        ).run(itemId, encryptedToken, resolvedName, JSON.stringify(products), institutionLogo, primaryColor);
      });
      saveInstitution();

      // Trigger initial sync (Plaid may not have data ready immediately)
      const runSync = async () => {
        await syncBalances(db, accessToken);
        if (products.includes("transactions")) {
          await syncTransactions(db, itemId, accessToken, null);
        }
        if (products.includes("investments")) {
          try { await syncInvestments(db, accessToken); } catch (e) { if (!isProductNotSupported(e)) throw e; }
          try { await syncInvestmentTransactions(db, accessToken); } catch (e) { if (!isProductNotSupported(e)) throw e; }
        }
        if (products.includes("liabilities")) {
          try { await syncLiabilities(db, accessToken); } catch (e) { if (!isProductNotSupported(e)) throw e; }
        }
        if (products.includes("transactions")) {
          try { await syncRecurring(db, accessToken); } catch (e) { if (!isProductNotSupported(e)) throw e; }
        }
      };

      try {
        await runSync();
      } catch (syncErr: any) {
        console.error("Initial sync error, will retry in 30s:", syncErr.message);
        // Plaid often needs time to prepare data after first link
        setTimeout(async () => {
          try {
            await runSync();
            console.log("Retry sync succeeded for", resolvedName);
          } catch (retryErr: any) {
            console.error("Retry sync also failed:", retryErr.message);
            // One more retry after 2 minutes
            setTimeout(async () => {
              try {
                await runSync();
                console.log("Final retry sync succeeded for", resolvedName);
              } catch (finalErr: any) {
                console.error("Final sync retry failed:", finalErr.message);
              }
            }, 120_000);
          }
        }, 30_000);
      }

      // Clean up session
      linkSessions.delete(session_id);
      res.json({
        success: true,
        institution_name: resolvedName,
        institution_logo: institutionLogo,
      });

      // Signal completion
      resolveComplete!();
    } catch (error: any) {
      const body = plaidErrorJson(error, "Failed to link account");
      console.error("Token exchange error:", body.error_code || body.error_type || "", body.error);
      res.status(500).json(body);
    }
  });

  const server = app.listen(config.port, "127.0.0.1");

  const url = `http://localhost:${config.port}/link/${sessionId}`;

  // Auto-expire after 30 minutes
  const timeout = setTimeout(() => {
    linkSessions.delete(sessionId);
    server.close();
    resolveComplete!();
  }, 30 * 60 * 1000);

  return {
    url,
    waitForComplete: () => completePromise,
    stop: () => {
      clearTimeout(timeout);
      linkSessions.clear();
      server.close();
    },
  };
}
