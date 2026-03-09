import { plaidClient } from "./client.js";
import type BetterSqlite3 from "libsql";
type Database = BetterSqlite3.Database;
import type { RemovedTransaction, Transaction } from "plaid";

/** Sync transactions for an institution using Plaid's sync endpoint */
export async function syncTransactions(
  db: Database,
  itemId: string,
  accessToken: string,
  cursor: string | null
) {
  let hasMore = true;
  let nextCursor = cursor || undefined;
  let added: Transaction[] = [];
  let modified: Transaction[] = [];
  let removed: RemovedTransaction[] = [];

  while (hasMore) {
    const resp = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor,
    });
    added = added.concat(resp.data.added);
    modified = modified.concat(resp.data.modified);
    removed = removed.concat(resp.data.removed);
    hasMore = resp.data.has_more;
    nextCursor = resp.data.next_cursor;
  }

  const upsertTx = db.prepare(`
    INSERT INTO transactions (transaction_id, account_id, amount, date, name, merchant_name, category, subcategory, pending, iso_currency_code, payment_channel)
    VALUES (@transaction_id, @account_id, @amount, @date, @name, @merchant_name, @category, @subcategory, @pending, @iso_currency_code, @payment_channel)
    ON CONFLICT(transaction_id) DO UPDATE SET
      amount=excluded.amount, date=excluded.date, name=excluded.name,
      merchant_name=excluded.merchant_name, category=excluded.category,
      subcategory=excluded.subcategory, pending=excluded.pending,
      payment_channel=excluded.payment_channel
  `);

  const deleteTx = db.prepare(
    `DELETE FROM transactions WHERE transaction_id = ?`
  );

  const insertMany = db.transaction(() => {
    for (const t of [...added, ...modified]) {
      const cats = t.personal_finance_category;
      upsertTx.run({
        transaction_id: t.transaction_id,
        account_id: t.account_id,
        amount: t.amount,
        date: t.date,
        name: t.name,
        merchant_name: t.merchant_name || null,
        category: cats?.primary || null,
        subcategory: cats?.detailed || null,
        pending: t.pending ? 1 : 0,
        iso_currency_code: t.iso_currency_code || "USD",
        payment_channel: t.payment_channel || null,
      });
    }
    for (const r of removed) {
      deleteTx.run(r.transaction_id);
    }
  });
  insertMany();

  // Update cursor
  db.prepare(`UPDATE institutions SET cursor = ? WHERE item_id = ?`).run(
    nextCursor,
    itemId
  );

  return { added: added.length, modified: modified.length, removed: removed.length };
}

/** Sync account balances */
export async function syncBalances(db: Database, accessToken: string) {
  const resp = await plaidClient.accountsGet({ access_token: accessToken });

  const upsert = db.prepare(`
    INSERT INTO accounts (account_id, item_id, name, official_name, type, subtype, mask, current_balance, available_balance, currency, updated_at)
    VALUES (@account_id, @item_id, @name, @official_name, @type, @subtype, @mask, @current_balance, @available_balance, @currency, datetime('now'))
    ON CONFLICT(account_id) DO UPDATE SET
      name=excluded.name, official_name=excluded.official_name,
      current_balance=excluded.current_balance, available_balance=excluded.available_balance,
      updated_at=datetime('now')
  `);

  const itemId = resp.data.item.item_id;
  const insertMany = db.transaction(() => {
    for (const a of resp.data.accounts) {
      upsert.run({
        account_id: a.account_id,
        item_id: itemId,
        name: a.name,
        official_name: a.official_name || null,
        type: a.type,
        subtype: a.subtype || null,
        mask: a.mask || null,
        current_balance: a.balances.current,
        available_balance: a.balances.available,
        currency: a.balances.iso_currency_code || "USD",
      });
    }
  });
  insertMany();

  return resp.data.accounts.length;
}

/** Sync investment holdings + securities */
export async function syncInvestments(db: Database, accessToken: string) {
  const resp = await plaidClient.investmentsHoldingsGet({
    access_token: accessToken,
  });

  const upsertSecurity = db.prepare(`
    INSERT INTO securities (security_id, ticker, name, type, close_price, close_price_as_of)
    VALUES (@security_id, @ticker, @name, @type, @close_price, @close_price_as_of)
    ON CONFLICT(security_id) DO UPDATE SET
      close_price=excluded.close_price, close_price_as_of=excluded.close_price_as_of
  `);

  const upsertHolding = db.prepare(`
    INSERT INTO holdings (account_id, security_id, quantity, cost_basis, value, price, price_as_of, updated_at)
    VALUES (@account_id, @security_id, @quantity, @cost_basis, @value, @price, @price_as_of, datetime('now'))
    ON CONFLICT(account_id, security_id) DO UPDATE SET
      quantity=excluded.quantity, cost_basis=excluded.cost_basis,
      value=excluded.value, price=excluded.price,
      price_as_of=excluded.price_as_of, updated_at=datetime('now')
  `);

  const insertMany = db.transaction(() => {
    for (const s of resp.data.securities) {
      upsertSecurity.run({
        security_id: s.security_id,
        ticker: s.ticker_symbol || null,
        name: s.name || "Unknown",
        type: s.type || null,
        close_price: s.close_price || null,
        close_price_as_of: s.close_price_as_of || null,
      });
    }
    for (const h of resp.data.holdings) {
      upsertHolding.run({
        account_id: h.account_id,
        security_id: h.security_id,
        quantity: h.quantity,
        cost_basis: h.cost_basis || null,
        value: h.institution_value,
        price: h.institution_price,
        price_as_of: h.institution_price_as_of || null,
      });
    }
  });
  insertMany();

  return { securities: resp.data.securities.length, holdings: resp.data.holdings.length };
}

/** Sync liabilities (credit, mortgage, student) */
export async function syncLiabilities(db: Database, accessToken: string) {
  const resp = await plaidClient.liabilitiesGet({ access_token: accessToken });

  const upsert = db.prepare(`
    INSERT INTO liabilities (account_id, type, interest_rate, origination_date, original_balance, current_balance, minimum_payment, next_payment_due, updated_at)
    VALUES (@account_id, @type, @interest_rate, @origination_date, @original_balance, @current_balance, @minimum_payment, @next_payment_due, datetime('now'))
    ON CONFLICT(account_id, type) DO UPDATE SET
      interest_rate=excluded.interest_rate, current_balance=excluded.current_balance,
      minimum_payment=excluded.minimum_payment, next_payment_due=excluded.next_payment_due,
      updated_at=datetime('now')
  `);

  const insertMany = db.transaction(() => {
    const credit = resp.data.liabilities.credit || [];
    for (const c of credit) {
      upsert.run({
        account_id: c.account_id,
        type: "credit",
        interest_rate: c.aprs?.[0]?.apr_percentage || null,
        origination_date: null,
        original_balance: null,
        current_balance: c.last_statement_balance,
        minimum_payment: c.minimum_payment_amount,
        next_payment_due: c.next_payment_due_date || null,
      });
    }
    const mortgage = resp.data.liabilities.mortgage || [];
    for (const m of mortgage) {
      upsert.run({
        account_id: m.account_id,
        type: "mortgage",
        interest_rate: m.interest_rate?.percentage || null,
        origination_date: m.origination_date || null,
        original_balance: m.origination_principal_amount || null,
        current_balance: m.last_payment_amount || null,
        minimum_payment: m.last_payment_amount || null,
        next_payment_due: m.next_payment_due_date || null,
      });
    }
    const student = resp.data.liabilities.student || [];
    for (const s of student) {
      upsert.run({
        account_id: s.account_id,
        type: "student",
        interest_rate: s.interest_rate_percentage || null,
        origination_date: s.origination_date || null,
        original_balance: s.origination_principal_amount || null,
        current_balance: s.last_payment_amount || null,
        minimum_payment: s.minimum_payment_amount || null,
        next_payment_due: s.next_payment_due_date || null,
      });
    }
  });
  insertMany();

  return "ok";
}
