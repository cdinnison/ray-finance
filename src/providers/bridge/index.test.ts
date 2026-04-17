import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "libsql";
import { migrate } from "../../db/schema.js";

const { promptMock, openMock } = vi.hoisted(() => ({
  promptMock: vi.fn(),
  openMock: vi.fn(),
}));

vi.mock("inquirer", () => ({
  default: {
    prompt: promptMock,
  },
}));

vi.mock("open", () => ({
  default: openMock,
}));

import { createBridgeProvider, mapBridgeAccountType, syncBridgeInstitution } from "./index.js";
import type { InstitutionRecord } from "../types.js";

function createTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function seedBridgeInstitution(
  db: Database.Database,
  overrides: Partial<InstitutionRecord> = {},
): InstitutionRecord {
  db.prepare(
    `INSERT INTO institutions (item_id, access_token, provider, provider_user_id, provider_state, name, products, cursor)
     VALUES (?, '', 'bridge', ?, ?, ?, ?, NULL)`,
  ).run(
    overrides.item_id || "bridge-item-1",
    overrides.provider_user_id || "bridge-user-1",
    overrides.provider_state || "{}",
    overrides.name || "Bridge Bank",
    overrides.products || JSON.stringify(["transactions"]),
  );

  return db.prepare(
    `SELECT item_id, provider, access_token, provider_user_id, provider_state, name, products, cursor, primary_color, logo, created_at
     FROM institutions WHERE item_id = ?`,
  ).get(overrides.item_id || "bridge-item-1") as InstitutionRecord;
}

describe("mapBridgeAccountType", () => {
  it("maps common Bridge account families into Ray account types", () => {
    expect(mapBridgeAccountType({ id: 1, type: "checking" }).type).toBe("depository");
    expect(mapBridgeAccountType({ id: 1, type: "card" }).type).toBe("credit");
    expect(mapBridgeAccountType({ id: 1, type: "mortgage" }).type).toBe("loan");
    expect(mapBridgeAccountType({ id: 1, type: "pea" }).type).toBe("investment");
    expect(mapBridgeAccountType({ id: 1, type: "mystery" }).type).toBe("other");
  });
});

describe("syncBridgeInstitution", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    promptMock.mockReset();
    openMock.mockReset();
  });

  it("imports Bridge accounts and transactions with Ray sign semantics", async () => {
    const institution = seedBridgeInstitution(db);
    db.prepare(
      `INSERT INTO accounts (account_id, item_id, name, type, current_balance)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("bridge-account:1001", institution.item_id, "Legacy account", "depository", 0);

    db.prepare(
      `INSERT INTO transactions (transaction_id, account_id, amount, date, name)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("bridge-transaction:deleted-tx", "bridge-account:1001", 10, "2026-04-12", "Old tx");

    const client = {
      ensureAccessToken: vi.fn().mockResolvedValue("bridge-access-token"),
      getItem: vi.fn().mockResolvedValue({
        id: institution.item_id,
        provider_id: "provider-1",
        status_code: 0,
        status_code_info: "OK",
        updated_at: "2026-04-13T09:00:00.000Z",
      }),
      getProvider: vi.fn().mockResolvedValue({ name: "Boursorama" }),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: 1001,
          item_id: institution.item_id,
          name: "Compte courant",
          type: "checking",
          accounting_balance: 512.34,
          instant_balance: 500.12,
          currency_code: "EUR",
        },
      ]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "expense-tx",
          account_id: 1001,
          amount: -24.5,
          date: "2026-04-12",
          clean_description: "Coffee Shop",
          provider_description: "COFFEE SHOP",
          currency_code: "EUR",
          updated_at: "2026-04-12T08:30:00.000Z",
          operation_type: "card",
          category_id: 12,
          future: false,
          deleted: false,
        },
        {
          id: "income-tx",
          account_id: 1001,
          amount: 1200,
          date: "2026-04-11",
          clean_description: "Salary",
          currency_code: "EUR",
          updated_at: "2026-04-11T08:30:00.000Z",
          operation_type: "transfer",
          future: false,
          deleted: false,
        },
        {
          id: "deleted-tx",
          account_id: 1001,
          amount: -10,
          date: "2026-04-10",
          currency_code: "EUR",
          updated_at: "2026-04-10T08:30:00.000Z",
          future: false,
          deleted: true,
        },
      ]),
    };

    const result = await syncBridgeInstitution(db, institution, client as any);

    expect(result.synced).toBe(true);
    expect(result.transactionsAdded).toBe(2);
    expect(client.listTransactions).toHaveBeenCalledWith("bridge-access-token", undefined);

    const account = db.prepare(`SELECT * FROM accounts WHERE account_id = ?`).get("bridge-account:1001") as any;
    expect(account.type).toBe("depository");
    expect(account.current_balance).toBe(512.34);
    expect(account.available_balance).toBe(500.12);

    const expense = db.prepare(`SELECT * FROM transactions WHERE transaction_id = ?`).get("bridge-transaction:expense-tx") as any;
    expect(expense.amount).toBe(24.5);
    expect(expense.category).toBe("card");
    expect(expense.subcategory).toBe("12");

    const income = db.prepare(`SELECT * FROM transactions WHERE transaction_id = ?`).get("bridge-transaction:income-tx") as any;
    expect(income.amount).toBe(-1200);

    const deleted = db.prepare(`SELECT * FROM transactions WHERE transaction_id = ?`).get("bridge-transaction:deleted-tx");
    expect(deleted).toBeUndefined();

    const updatedInstitution = db.prepare(`SELECT provider_state, name FROM institutions WHERE item_id = ?`).get(institution.item_id) as any;
    const state = JSON.parse(updatedInstitution.provider_state);
    expect(state.lastTransactionUpdatedAt).toBe("2026-04-12T08:30:00.000Z");
    expect(state.needsReconnect).toBe(false);
    expect(updatedInstitution.name).toBe("Boursorama");
  });

  it("uses stored Bridge updated_at cursor for incremental syncs", async () => {
    const institution = seedBridgeInstitution(db, {
      provider_state: JSON.stringify({
        externalUserId: "bridge-user-1",
        lastTransactionUpdatedAt: "2026-04-01T10:00:00.000Z",
      }),
    });

    const client = {
      ensureAccessToken: vi.fn().mockResolvedValue("bridge-access-token"),
      getItem: vi.fn().mockResolvedValue({
        id: institution.item_id,
        provider_id: "provider-1",
        status_code: 0,
        updated_at: "2026-04-13T09:00:00.000Z",
      }),
      getProvider: vi.fn().mockResolvedValue({ name: "BNP Paribas" }),
      listAccounts: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([]),
    };

    await syncBridgeInstitution(db, institution, client as any);

    expect(client.listTransactions).toHaveBeenCalledWith("bridge-access-token", "2026-04-01T10:00:00.000Z");
  });

  it("surfaces reconnect-required Bridge items without importing data", async () => {
    const institution = seedBridgeInstitution(db);

    const client = {
      ensureAccessToken: vi.fn().mockResolvedValue("bridge-access-token"),
      getItem: vi.fn().mockResolvedValue({
        id: institution.item_id,
        provider_id: "provider-1",
        status_code: 1010,
        status_code_info: "otp_required",
        updated_at: "2026-04-13T09:00:00.000Z",
      }),
      getProvider: vi.fn().mockResolvedValue({ name: "Credit Agricole" }),
      listAccounts: vi.fn(),
      listTransactions: vi.fn(),
    };

    const result = await syncBridgeInstitution(db, institution, client as any);

    expect(result.synced).toBe(false);
    expect(result.reconnectRequired).toBe(true);
    expect(client.listAccounts).not.toHaveBeenCalled();
    expect(client.listTransactions).not.toHaveBeenCalled();
  });

  it("imports existing Bridge items without creating a new connect session", async () => {
    const provider = createBridgeProvider(() => client as any);

    promptMock
      .mockResolvedValueOnce({ externalUserMode: "existing" })
      .mockResolvedValueOnce({ externalUserId: "bridge-user-1" })
      .mockResolvedValueOnce({ userEmail: "" })
      .mockResolvedValueOnce({ action: "import-existing" });

    const client = {
      ensureAccessToken: vi.fn().mockResolvedValue("bridge-access-token"),
      listItems: vi.fn().mockResolvedValue([
        {
          id: "existing-item-1",
          provider_id: "provider-1",
          status_code: 0,
          updated_at: "2026-04-13T09:00:00.000Z",
        },
      ]),
      createConnectSession: vi.fn(),
      getItem: vi.fn().mockResolvedValue({
        id: "existing-item-1",
        provider_id: "provider-1",
        status_code: 0,
        updated_at: "2026-04-13T09:00:00.000Z",
      }),
      getProvider: vi.fn().mockResolvedValue({ name: "Boursorama" }),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: 1001,
          item_id: "existing-item-1",
          name: "Compte courant",
          type: "checking",
          accounting_balance: 512.34,
          instant_balance: 500.12,
          currency_code: "EUR",
        },
      ]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "expense-tx",
          account_id: 1001,
          amount: -24.5,
          date: "2026-04-12",
          clean_description: "Coffee Shop",
          currency_code: "EUR",
          updated_at: "2026-04-12T08:30:00.000Z",
          operation_type: "card",
          future: false,
          deleted: false,
        },
      ]),
    };

    await provider.link(db);

    expect(client.createConnectSession).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();

    const institution = db.prepare(`SELECT item_id, name, provider_user_id FROM institutions WHERE item_id = ?`)
      .get("existing-item-1") as any;
    expect(institution).toMatchObject({
      item_id: "existing-item-1",
      name: "Boursorama",
      provider_user_id: "bridge-user-1",
    });

    const transaction = db.prepare(`SELECT transaction_id, amount FROM transactions WHERE transaction_id = ?`)
      .get("bridge-transaction:expense-tx") as any;
    expect(transaction).toMatchObject({
      transaction_id: "bridge-transaction:expense-tx",
      amount: 24.5,
    });
  });
});
