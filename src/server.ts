import express from "express";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { randomUUID } from "crypto";
import { createLinkToken, exchangeToken } from "./plaid/link.js";
import { syncBalances, syncTransactions, syncInvestments, syncInvestmentTransactions, syncLiabilities, syncRecurring, isProductNotSupported } from "./plaid/sync.js";
import { plaidClient } from "./plaid/client.js";
import { CountryCode } from "plaid";
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

export function startLinkServer(): LinkResult {
  const app = express();
  app.use(express.json());

  // Only allow requests from localhost origin
  app.use((req, res, next) => {
    const origin = req.headers.origin || req.headers.referer || "";
    const ip = req.ip || req.socket.remoteAddress || "";
    if (req.path.startsWith("/api/")) {
      // Check origin for API routes
      if (origin && !origin.startsWith(`http://localhost:${config.port}`) && !origin.startsWith(`http://127.0.0.1:${config.port}`)) {
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

  // Create link token
  app.post("/api/link-token", async (req, res) => {
    try {
      const { session_id } = req.body;
      if (!linkSessions.has(session_id)) {
        res.status(404).json({ error: "Invalid or expired session" });
        return;
      }
      const linkToken = await createLinkToken();
      res.json({ link_token: linkToken });
    } catch (error: any) {
      console.error("Link token error:", error.message);
      res.status(500).json({ error: "Failed to create link token" });
    }
  });

  // Exchange public token
  app.post("/api/exchange", async (req, res) => {
    try {
      const { public_token, session_id, institution_name } = req.body;
      if (!linkSessions.has(session_id)) {
        res.status(404).json({ error: "Invalid or expired session" });
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

      // Fetch actual enabled products from Plaid
      const itemResp = await plaidClient.itemGet({ access_token: accessToken });
      const products: string[] = (itemResp.data.item.products || []) as string[];

      // Remove duplicate institution if re-linking the same one (Plaid gives a new item_id each time)
      const institutionId = req.body.institution_id;
      if (institutionId) {
        const existing = db.prepare(
          `SELECT item_id FROM institutions WHERE name = ? AND item_id != ?`
        ).all(institution_name, itemId) as { item_id: string }[];
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
        `INSERT INTO institutions (item_id, access_token, name, products)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET access_token = excluded.access_token, products = excluded.products`
      ).run(itemId, encryptedToken, institution_name || "Account", JSON.stringify(products));

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
            console.log("Retry sync succeeded for", institution_name);
          } catch (retryErr: any) {
            console.error("Retry sync also failed:", retryErr.message);
            // One more retry after 2 minutes
            setTimeout(async () => {
              try {
                await runSync();
                console.log("Final retry sync succeeded for", institution_name);
              } catch (finalErr: any) {
                console.error("Final sync retry failed:", finalErr.message);
              }
            }, 120_000);
          }
        }, 30_000);
      }

      // Fetch and store institution logo + brand color
      let institutionLogo: string | null = null;
      if (req.body.institution_id) {
        try {
          const { data } = await plaidClient.institutionsGetById({
            institution_id: req.body.institution_id,
            country_codes: [CountryCode.Us],
            options: { include_optional_metadata: true },
          });
          institutionLogo = data.institution.logo || null;
          const primaryColor = data.institution.primary_color || null;
          db.prepare(`UPDATE institutions SET logo = ?, primary_color = ? WHERE item_id = ?`)
            .run(institutionLogo, primaryColor, itemId);
        } catch {}
      }

      // Check if this institution has a mortgage (prompt user for home value)
      const hasMortgage = !!(db.prepare(
        `SELECT 1 FROM accounts WHERE item_id = ? AND type = 'loan' AND subtype = 'mortgage' LIMIT 1`
      ).get(itemId));
      const hasPropertyAccount = !!(db.prepare(
        `SELECT 1 FROM accounts WHERE account_id = 'manual-home' LIMIT 1`
      ).get());

      // Clean up session
      linkSessions.delete(session_id);
      res.json({
        success: true,
        institution_name: institution_name,
        institution_logo: institutionLogo,
      });

      // Signal completion
      resolveComplete!();
    } catch (error: any) {
      console.error("Token exchange error:", error.message);
      res.status(500).json({ error: "Failed to link account" });
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
