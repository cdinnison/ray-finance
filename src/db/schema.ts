import type Database from "libsql";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS institutions (
      item_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      name TEXT NOT NULL,
      products TEXT NOT NULL DEFAULT '[]',
      cursor TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      account_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES institutions(item_id),
      name TEXT NOT NULL,
      official_name TEXT,
      type TEXT NOT NULL,
      subtype TEXT,
      mask TEXT,
      current_balance REAL,
      available_balance REAL,
      currency TEXT,
      hidden INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      transaction_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(account_id),
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      merchant_name TEXT,
      category TEXT,
      subcategory TEXT,
      pending INTEGER DEFAULT 0,
      iso_currency_code TEXT,
      payment_channel TEXT,
      logo_url TEXT,
      website TEXT,
      label TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holdings (
      holding_id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(account_id),
      security_id TEXT,
      quantity REAL NOT NULL,
      cost_basis REAL,
      value REAL,
      price REAL,
      price_as_of TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(account_id, security_id)
    );

    CREATE TABLE IF NOT EXISTS securities (
      security_id TEXT PRIMARY KEY,
      name TEXT,
      ticker TEXT,
      type TEXT,
      close_price REAL,
      close_price_as_of TEXT
    );

    CREATE TABLE IF NOT EXISTS liabilities (
      liability_id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(account_id),
      type TEXT NOT NULL,
      interest_rate REAL,
      origination_date TEXT,
      original_balance REAL,
      current_balance REAL,
      minimum_payment REAL,
      next_payment_due TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(account_id, type)
    );

    CREATE TABLE IF NOT EXISTS net_worth_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      total_assets REAL NOT NULL,
      total_liabilities REAL NOT NULL,
      net_worth REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      monthly_limit REAL NOT NULL,
      period TEXT DEFAULT 'monthly',
      UNIQUE(category, period)
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      target_date TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_name TEXT NOT NULL,
      avg_amount REAL NOT NULL,
      frequency TEXT NOT NULL,
      category TEXT,
      last_date TEXT,
      account_id TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS daily_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      score INTEGER NOT NULL,
      restaurant_count INTEGER DEFAULT 0,
      shopping_count INTEGER DEFAULT 0,
      food_spend REAL DEFAULT 0,
      total_spend REAL DEFAULT 0,
      zero_spend INTEGER DEFAULT 0,
      no_restaurant_streak INTEGER DEFAULT 0,
      no_shopping_streak INTEGER DEFAULT 0,
      on_pace_streak INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      unlocked_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recategorization_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_field TEXT NOT NULL,
      match_pattern TEXT NOT NULL,
      target_category TEXT NOT NULL,
      target_subcategory TEXT,
      label TEXT
    );

    CREATE TABLE IF NOT EXISTS recurring_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      day_of_month INTEGER,
      type TEXT,
      account_id TEXT
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_date TEXT,
      monthly_savings REAL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS conversation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      input_params TEXT,
      result_summary TEXT,
      tokens_used INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrate: rename goals.deadline -> target_date for existing databases
  const goalCols = db.prepare(`PRAGMA table_info(goals)`).all() as { name: string }[];
  if (goalCols.some(c => c.name === "deadline") && !goalCols.some(c => c.name === "target_date")) {
    db.exec(`ALTER TABLE goals RENAME COLUMN deadline TO target_date`);
  }
}
