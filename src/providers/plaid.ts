import type { InstitutionProvider } from "./types.js";
import { config } from "../config.js";
import { decryptPlaidToken } from "../db/encryption.js";
import { startLinkServer } from "../server.js";
import {
  refreshProducts,
  syncBalances,
  syncInvestments,
  syncInvestmentTransactions,
  syncLiabilities,
  syncRecurring,
  syncTransactions,
  isProductNotSupported,
} from "../plaid/sync.js";

export const plaidProvider: InstitutionProvider = {
  key: "plaid",
  displayName: "Plaid",
  isConfigured(): boolean {
    return !!config.rayApiKey || (!!config.plaidClientId && !!config.plaidSecret);
  },
  missingConfigMessage(): string {
    return "Plaid credentials are not configured. Run 'ray setup' or use a Ray API key for managed Plaid.";
  },
  async link(): Promise<void> {
    const open = (await import("open")).default;
    const ora = (await import("ora")).default;

    const { url, waitForComplete, stop } = startLinkServer();

    console.log(`Opening Plaid Link in your browser...\n`);
    console.log(`  ${url}\n`);

    await open(url);

    const spinner = ora("Waiting for Plaid Link to complete...").start();
    await waitForComplete();
    stop();
    spinner.succeed("Plaid account linked successfully!");
  },
  async syncInstitution(db, institution) {
    let accessToken: string;
    if (!config.plaidTokenSecret) {
      return {
        transactionsAdded: 0,
        synced: false,
        message: "Plaid token secret not configured.",
      };
    }

    try {
      accessToken = decryptPlaidToken(institution.access_token, config.plaidTokenSecret);
    } catch {
      return {
        transactionsAdded: 0,
        synced: false,
        message: "Failed to decrypt Plaid access token.",
      };
    }

    let products: string[] = [];
    try {
      products = await refreshProducts(db, institution.item_id, accessToken);
    } catch {
      products = JSON.parse(institution.products || "[]") as string[];
    }

    await syncBalances(db, accessToken);

    let transactionsAdded = 0;
    if (products.includes("transactions")) {
      const txResult = await syncTransactions(db, institution.item_id, accessToken, institution.cursor);
      transactionsAdded += txResult.added;
    }

    if (products.includes("investments")) {
      try {
        await syncInvestments(db, accessToken);
      } catch (error) {
        if (!isProductNotSupported(error)) throw error;
      }

      try {
        await syncInvestmentTransactions(db, accessToken);
      } catch (error) {
        if (!isProductNotSupported(error)) throw error;
      }
    }

    if (products.includes("liabilities")) {
      try {
        await syncLiabilities(db, accessToken);
      } catch (error) {
        if (!isProductNotSupported(error)) throw error;
      }
    }

    if (products.includes("transactions")) {
      try {
        await syncRecurring(db, accessToken);
      } catch (error) {
        if (!isProductNotSupported(error)) throw error;
      }
    }

    return { transactionsAdded, synced: true };
  },
};
