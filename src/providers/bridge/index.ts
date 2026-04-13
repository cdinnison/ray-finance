import { randomUUID } from "crypto";
import type { InstitutionProvider } from "../types.js";
import { parseProviderState, stringifyProviderState } from "../state.js";
import { buildBridgeProviderState, describeBridgeProviderState, isBridgeItemSyncableStatus, type BridgeProviderState } from "./status.js";
import { BridgeClient, type BridgeAccount, type BridgeItem, type BridgeTransaction } from "./client.js";
import { config, saveConfig } from "../../config.js";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function mapBridgeAccountType(account: BridgeAccount): { type: string; subtype: string | null } {
  const rawType = `${account.subtype || account.type || "other"}`.toLowerCase();

  if (/(checking|savings|payment|current|cash|livret|deposit)/.test(rawType)) {
    return { type: "depository", subtype: rawType };
  }
  if (/(card|credit)/.test(rawType)) {
    return { type: "credit", subtype: rawType };
  }
  if (/(loan|mortgage|student|consumer|credit_immobilier)/.test(rawType)) {
    return { type: "loan", subtype: rawType };
  }
  if (/(investment|market|brokerage|security|pea|life|per|capitalisation|portfolio|stocks)/.test(rawType)) {
    return { type: "investment", subtype: rawType };
  }

  return { type: "other", subtype: rawType || null };
}

function getBridgeAccountId(accountId: string | number): string {
  return `bridge-account:${accountId}`;
}

function getBridgeTransactionId(transactionId: string | number): string {
  return `bridge-transaction:${transactionId}`;
}

function chooseBridgeInstitutionName(item: BridgeItem, currentName: string, providerName?: string | null): string {
  return providerName || currentName || `Bridge item ${item.id}`;
}

async function maybeResolveProviderName(client: BridgeClient, item: BridgeItem, current?: string | null): Promise<string | null> {
  if (current) return current;
  if (!item.provider_id) return null;
  try {
    const provider = await client.getProvider(item.provider_id);
    return provider.display_name || provider.name || null;
  } catch {
    return null;
  }
}

function upsertBridgeInstitution(
  db: import("../types.js").Database,
  item: BridgeItem,
  externalUserId: string,
  providerName: string | null,
): import("../types.js").InstitutionRecord {
  const existing = db.prepare(
    `SELECT item_id, provider, access_token, provider_user_id, provider_state, name, products, cursor, primary_color, logo, created_at
     FROM institutions WHERE item_id = ?`,
  ).get(String(item.id)) as import("../types.js").InstitutionRecord | undefined;

  const currentState = parseProviderState<BridgeProviderState>(existing?.provider_state);
  const nextState = buildBridgeProviderState(item, { ...currentState, externalUserId }, providerName);
  const name = chooseBridgeInstitutionName(item, existing?.name || "", providerName);

  db.prepare(
    `INSERT INTO institutions (item_id, access_token, provider, provider_user_id, provider_state, name, products, cursor)
     VALUES (?, '', 'bridge', ?, ?, ?, ?, NULL)
     ON CONFLICT(item_id) DO UPDATE SET
       provider = 'bridge',
       provider_user_id = excluded.provider_user_id,
       provider_state = excluded.provider_state,
       name = excluded.name,
       products = excluded.products,
       cursor = NULL`,
  ).run(
    String(item.id),
    externalUserId,
    stringifyProviderState(nextState as Record<string, unknown>),
    name,
    JSON.stringify(["transactions"]),
  );

  return db.prepare(
    `SELECT item_id, provider, access_token, provider_user_id, provider_state, name, products, cursor, primary_color, logo, created_at
     FROM institutions WHERE item_id = ?`,
  ).get(String(item.id)) as import("../types.js").InstitutionRecord;
}

function upsertBridgeAccounts(
  db: import("../types.js").Database,
  institution: import("../types.js").InstitutionRecord,
  accounts: BridgeAccount[],
): Set<string> {
  const upsert = db.prepare(`
    INSERT INTO accounts (account_id, item_id, name, official_name, type, subtype, mask, current_balance, available_balance, currency, hidden, updated_at)
    VALUES (@account_id, @item_id, @name, @official_name, @type, @subtype, @mask, @current_balance, @available_balance, @currency, 0, datetime('now'))
    ON CONFLICT(account_id) DO UPDATE SET
      item_id=excluded.item_id,
      name=excluded.name,
      official_name=excluded.official_name,
      type=excluded.type,
      subtype=excluded.subtype,
      mask=excluded.mask,
      current_balance=excluded.current_balance,
      available_balance=excluded.available_balance,
      currency=excluded.currency,
      hidden=0,
      updated_at=datetime('now')
  `);

  const dbAccountIds = new Set<string>();

  const batch = db.transaction(() => {
    for (const account of accounts) {
      const { type, subtype } = mapBridgeAccountType(account);
      const currentBalance =
        account.accounting_balance ??
        account.balance ??
        account.current_balance ??
        account.instant_balance ??
        account.available_balance ??
        0;
      const availableBalance =
        account.instant_balance ??
        account.available_balance ??
        account.balance ??
        account.accounting_balance ??
        null;
      const accountId = getBridgeAccountId(account.id);

      upsert.run({
        account_id: accountId,
        item_id: institution.item_id,
        name: account.name || account.clean_name || account.official_name || account.iban || `Bridge account ${account.id}`,
        official_name: account.official_name || account.clean_name || null,
        type,
        subtype,
        mask: account.iban || null,
        current_balance: currentBalance,
        available_balance: availableBalance,
        currency: account.currency_code || "EUR",
      });

      dbAccountIds.add(accountId);
    }
  });

  batch();
  return dbAccountIds;
}

function syncBridgeTransactions(
  db: import("../types.js").Database,
  transactions: BridgeTransaction[],
  accountIds: Set<string>,
): { added: number; latestUpdatedAt: string | null } {
  const upsert = db.prepare(`
    INSERT INTO transactions (transaction_id, account_id, amount, date, name, merchant_name, category, subcategory, pending, iso_currency_code, payment_channel)
    VALUES (@transaction_id, @account_id, @amount, @date, @name, @merchant_name, @category, @subcategory, @pending, @iso_currency_code, @payment_channel)
    ON CONFLICT(transaction_id) DO UPDATE SET
      amount=excluded.amount,
      date=excluded.date,
      name=excluded.name,
      merchant_name=excluded.merchant_name,
      category=excluded.category,
      subcategory=excluded.subcategory,
      pending=excluded.pending,
      iso_currency_code=excluded.iso_currency_code,
      payment_channel=excluded.payment_channel
  `);

  const deleteTx = db.prepare(`DELETE FROM transactions WHERE transaction_id = ?`);
  let latestUpdatedAt: string | null = null;
  let added = 0;

  const batch = db.transaction(() => {
    for (const transaction of transactions) {
      if (!transaction.account_id) continue;
      const accountId = getBridgeAccountId(transaction.account_id);
      if (!accountIds.has(accountId)) continue;

      if (transaction.updated_at && (!latestUpdatedAt || transaction.updated_at > latestUpdatedAt)) {
        latestUpdatedAt = transaction.updated_at;
      }

      const transactionId = getBridgeTransactionId(transaction.id);
      if (transaction.deleted) {
        deleteTx.run(transactionId);
        continue;
      }

      upsert.run({
        transaction_id: transactionId,
        account_id: accountId,
        amount: -1 * Number(transaction.amount || 0),
        date: transaction.date || new Date().toISOString().slice(0, 10),
        name: transaction.clean_description || transaction.provider_description || "Transaction",
        merchant_name: null,
        category: transaction.operation_type || null,
        subcategory: transaction.category_id != null ? String(transaction.category_id) : null,
        pending: transaction.future ? 1 : 0,
        iso_currency_code: transaction.currency_code || null,
        payment_channel: null,
      });
      added += 1;
    }
  });

  batch();
  return { added, latestUpdatedAt };
}

async function pollForBridgeItems(
  client: BridgeClient,
  accessToken: string,
  options: {
    previousItems: BridgeItem[];
    reconnectItemId?: string;
  },
): Promise<BridgeItem[]> {
  const previousById = new Map(options.previousItems.map(item => [String(item.id), item]));
  const deadline = Date.now() + 10 * 60 * 1000;

  while (Date.now() < deadline) {
    const items = await client.listItems(accessToken);

    if (options.reconnectItemId) {
      const item = items.find(candidate => String(candidate.id) === options.reconnectItemId);
      if (item) {
        const previous = previousById.get(String(item.id));
        const previousUpdatedAt = previous?.updated_at || null;
        if (
          item.updated_at !== previousUpdatedAt ||
          isBridgeItemSyncableStatus(buildBridgeProviderState(item).itemStatus ?? null)
        ) {
          return [item];
        }
      }
    } else {
      const newItems = items.filter(item => !previousById.has(String(item.id)));
      if (newItems.length > 0) return newItems;
    }

    await sleep(3_000);
  }

  throw new Error("Timed out waiting for Bridge Connect to finish.");
}

function getReconnectCandidates(db: import("../types.js").Database): import("../types.js").InstitutionRecord[] {
  const rows = db.prepare(
    `SELECT item_id, provider, access_token, provider_user_id, provider_state, name, products, cursor, primary_color, logo, created_at
     FROM institutions
     WHERE provider = 'bridge'
     ORDER BY created_at DESC`,
  ).all() as import("../types.js").InstitutionRecord[];

  return rows.filter(row => {
    const state = parseProviderState<BridgeProviderState>(row.provider_state);
    return !!state.needsReconnect;
  });
}

function getLinkedBridgeItemIds(db: import("../types.js").Database): Set<string> {
  const rows = db.prepare(
    `SELECT item_id
     FROM institutions
     WHERE provider = 'bridge'`,
  ).all() as { item_id: string }[];

  return new Set(rows.map(row => row.item_id));
}

async function promptBridgeConnectTarget(
  db: import("../types.js").Database,
): Promise<{ reconnectInstitution?: import("../types.js").InstitutionRecord; externalUserMode: "auto" | "existing"; externalUserId?: string; userEmail?: string }> {
  const inquirer = (await import("inquirer")).default;
  const reconnectCandidates = getReconnectCandidates(db);

  const { externalUserMode } = await inquirer.prompt([{
    type: "list",
    name: "externalUserMode",
    message: "How should Ray identify your Bridge user?",
    choices: [
      { name: "Auto-create/reuse a Ray Bridge user", value: "auto" },
      { name: "Use an existing external_user_id", value: "existing" },
    ],
  }]);

  let externalUserId: string | undefined;
  if (externalUserMode === "existing") {
    const answers = await inquirer.prompt([{
      type: "input",
      name: "externalUserId",
      message: "Bridge external_user_id:",
      validate: (value: string) => value.trim().length > 0 || "Required",
    }]);
    externalUserId = answers.externalUserId.trim();
  }

  const { userEmail } = await inquirer.prompt([{
    type: "input",
    name: "userEmail",
    message: "Bridge user email (optional):",
  }]);

  if (reconnectCandidates.length === 0) {
    return { externalUserMode, externalUserId, userEmail: userEmail?.trim() || undefined };
  }

  const { target } = await inquirer.prompt([{
    type: "list",
    name: "target",
    message: "Do you want to reconnect an existing Bridge item or add a new one?",
    choices: [
      { name: "Add new Bridge item", value: "new" },
      ...reconnectCandidates.map(candidate => ({ name: `Reconnect ${candidate.name}`, value: candidate.item_id })),
    ],
  }]);

  return {
    reconnectInstitution: target === "new" ? undefined : reconnectCandidates.find(candidate => candidate.item_id === target),
    externalUserMode,
    externalUserId,
    userEmail: userEmail?.trim() || undefined,
  };
}

async function promptBridgeExistingItemAction(
  importCount: number,
): Promise<"import-existing" | "connect-new"> {
  const inquirer = (await import("inquirer")).default;

  const { action } = await inquirer.prompt([{
    type: "list",
    name: "action",
    message: `Ray found ${importCount} existing Bridge item${importCount === 1 ? "" : "s"} for this user. What would you like to do?`,
    choices: [
      {
        name: `Import ${importCount} existing Bridge item${importCount === 1 ? "" : "s"}`,
        value: "import-existing",
      },
      {
        name: "Add a new Bridge item via Connect",
        value: "connect-new",
      },
    ],
  }]);

  return action;
}

function resolveBridgeExternalUserId(mode: "auto" | "existing", explicit?: string): string {
  if (mode === "existing") {
    if (!explicit) throw new Error("Bridge external_user_id is required.");
    return explicit;
  }

  if (config.bridgeDefaultExternalUserId) return config.bridgeDefaultExternalUserId;

  const generated = `ray-${randomUUID()}`;
  saveConfig({ bridgeDefaultExternalUserId: generated });
  return generated;
}

export async function syncBridgeInstitution(
  db: import("../types.js").Database,
  institution: import("../types.js").InstitutionRecord,
  client: BridgeClient,
) {
  const state = parseProviderState<BridgeProviderState>(institution.provider_state);
  const externalUserId = institution.provider_user_id || state.externalUserId;
  if (!externalUserId) {
    return {
      transactionsAdded: 0,
      synced: false,
      reconnectRequired: true,
      message: "Missing Bridge external_user_id.",
    };
  }

  const accessToken = await client.ensureAccessToken(externalUserId);
  const item = await client.getItem(accessToken, institution.item_id).catch(async () => {
    const items = await client.listItems(accessToken);
    const match = items.find(candidate => String(candidate.id) === institution.item_id);
    if (!match) throw new Error(`Bridge item ${institution.item_id} not found.`);
    return match;
  });

  const providerName = await maybeResolveProviderName(client, item, state.providerName);
  const nextState = buildBridgeProviderState(item, { ...state, externalUserId }, providerName);

  db.prepare(
    `UPDATE institutions
     SET provider_user_id = ?, provider_state = ?, name = ?
     WHERE item_id = ?`,
  ).run(
    externalUserId,
    stringifyProviderState(nextState as Record<string, unknown>),
    chooseBridgeInstitutionName(item, institution.name, providerName),
    institution.item_id,
  );

  if (!isBridgeItemSyncableStatus(nextState.itemStatus ?? null)) {
    return {
      transactionsAdded: 0,
      synced: false,
      reconnectRequired: true,
      message: describeBridgeProviderState(nextState) || "Bridge item requires user action.",
    };
  }

  const allAccounts = await client.listAccounts(accessToken);
  const bridgeAccounts = allAccounts.filter(account => String(account.item_id) === institution.item_id);
  const accountIds = upsertBridgeAccounts(db, institution, bridgeAccounts);

  const transactions = await client.listTransactions(accessToken, nextState.lastTransactionUpdatedAt || undefined);
  const scopedTransactions = transactions.filter(transaction => {
    if (!transaction.account_id) return false;
    return accountIds.has(getBridgeAccountId(transaction.account_id));
  });
  const syncResult = syncBridgeTransactions(db, scopedTransactions, accountIds);

  const finalState: BridgeProviderState = {
    ...nextState,
    lastTransactionUpdatedAt: syncResult.latestUpdatedAt || nextState.lastTransactionUpdatedAt || null,
  };

  db.prepare(`UPDATE institutions SET provider_state = ? WHERE item_id = ?`).run(
    stringifyProviderState(finalState as Record<string, unknown>),
    institution.item_id,
  );

  return { transactionsAdded: syncResult.added, synced: true, reconnectRequired: false };
}

export function createBridgeProvider(clientFactory: () => BridgeClient = () => new BridgeClient()): InstitutionProvider {
  return {
    key: "bridge",
    displayName: "Bridge",
    isConfigured(): boolean {
      return !!config.bridgeClientId && !!config.bridgeClientSecret && !config.rayApiKey;
    },
    missingConfigMessage(): string {
      return "Bridge credentials are not configured. Run 'ray setup' to add your Bridge client id and secret.";
    },
    async link(db) {
      const open = (await import("open")).default;
      const ora = (await import("ora")).default;
      const client = clientFactory();

      const { reconnectInstitution, externalUserMode, externalUserId: explicitExternalUserId, userEmail } = await promptBridgeConnectTarget(db);
      const reconnectState = reconnectInstitution
        ? parseProviderState<BridgeProviderState>(reconnectInstitution.provider_state)
        : null;
      const externalUserId = reconnectInstitution?.provider_user_id ||
        reconnectState?.externalUserId ||
        resolveBridgeExternalUserId(externalUserMode, explicitExternalUserId);
      const accessToken = await client.ensureAccessToken(
        externalUserId,
        externalUserMode === "auto" && !reconnectInstitution,
      );

      const existingItems = await client.listItems(accessToken);
      const importCandidates = reconnectInstitution
        ? []
        : existingItems.filter(item => !getLinkedBridgeItemIds(db).has(String(item.id)));

      if (!reconnectInstitution && importCandidates.length > 0) {
        const action = await promptBridgeExistingItemAction(importCandidates.length);
        if (action === "import-existing") {
          const importSpinner = ora(`Importing ${importCandidates.length} existing Bridge item${importCandidates.length === 1 ? "" : "s"}...`).start();

          for (const item of importCandidates) {
            importSpinner.text = `Syncing Bridge item ${item.id}...`;
            const providerName = await maybeResolveProviderName(client, item);
            const institution = upsertBridgeInstitution(db, item, externalUserId, providerName);
            await syncBridgeInstitution(db, institution, client);
          }

          importSpinner.succeed(`Imported ${importCandidates.length} existing Bridge item${importCandidates.length === 1 ? "" : "s"}.`);
          console.log("");
          return;
        }
      }

      const connectSession = await client.createConnectSession(accessToken, {
        itemId: reconnectInstitution?.item_id,
        userEmail,
        accountTypes: "all",
        forceReauthentication: !!reconnectInstitution,
      });

      console.log(`Opening Bridge Connect in your browser...\n`);
      console.log(`  ${connectSession.url}\n`);
      console.log(`Return here after you finish the Bridge flow. Ray will detect the completed item automatically.\n`);

      await open(connectSession.url);

      const spinner = ora(reconnectInstitution ? "Waiting for Bridge item refresh..." : "Waiting for Bridge item creation...").start();
      const items = await pollForBridgeItems(client, accessToken, {
        previousItems: existingItems,
        reconnectItemId: reconnectInstitution?.item_id,
      });
      spinner.succeed(reconnectInstitution ? "Bridge reconnect completed." : `Bridge linked ${items.length} item(s).`);

      const syncSpinner = ora(items.length === 1 ? "Syncing linked Bridge item..." : `Syncing ${items.length} linked Bridge items...`).start();
      for (const item of items) {
        syncSpinner.text = `Syncing Bridge item ${item.id}...`;
        const providerName = await maybeResolveProviderName(client, item);
        const institution = upsertBridgeInstitution(db, item, externalUserId, providerName);
        await syncBridgeInstitution(db, institution, client);
      }
      syncSpinner.succeed(items.length === 1 ? "Bridge item synced." : "Bridge items synced.");
    },
    async syncInstitution(db, institution) {
      return syncBridgeInstitution(db, institution, clientFactory());
    },
  };
}

export const bridgeProvider: InstitutionProvider = createBridgeProvider();
