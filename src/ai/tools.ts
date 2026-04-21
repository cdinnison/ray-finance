import type Database from "libsql";
import type { ToolDefinition } from "./provider.js";
import {
  getNetWorth, getAccountBalances, getTransactionsFiltered,
  getRecentSpending, getBudgetStatuses, getGoals,
  getIncome, searchTransactions, getCashFlow, forecastBalance,
  getPortfolio, getInvestmentPerformance, getDebts,
  compareSpending, getNetWorthTrend,
  formatMoney, categoryLabel,
} from "../queries/index.js";
import { getLatestScore, getMonthlySavings } from "../scoring/index.js";
import { generateAlerts } from "../alerts/index.js";
import { saveMemory, getMemories } from "./memory.js";
import { readContext, writeContext, replaceContextSection } from "./context.js";
import { simulatePayoff } from "../db/helpers.js";
import { sanitizeForPrompt } from "./insights.js";

export const toolDefinitions: ToolDefinition[] = [
  // --- Existing tools ---
  {
    name: "get_net_worth",
    description: "Get current net worth with breakdown of assets, liabilities, investments, cash, and home equity",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_accounts",
    description: "List all linked bank accounts with current balances",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_transactions",
    description: "Search transactions with optional filters. Returns matching transactions.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "Start date (YYYY-MM-DD). Defaults to 30 days ago." },
        end_date: { type: "string", description: "End date (YYYY-MM-DD). Defaults to today." },
        category: { type: "string", description: "Filter by category (e.g. FOOD_AND_DRINK, GENERAL_MERCHANDISE)" },
        merchant: { type: "string", description: "Filter by merchant name (partial match)" },
        min_amount: { type: "number", description: "Minimum transaction amount" },
        max_amount: { type: "number", description: "Maximum transaction amount" },
        limit: { type: "number", description: "Max results to return (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_spending_summary",
    description: "Get spending breakdown by category for a time period",
    input_schema: {
      type: "object" as const,
      properties: {
        period: { type: "string", description: "Period: this_month, last_month, last_30, last_90, or YYYY-MM-DD:YYYY-MM-DD", default: "this_month" },
      },
      required: [],
    },
  },
  {
    name: "get_budgets",
    description: "Get all budget categories with current month spending vs limits",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "set_budget",
    description: "Create or update a monthly budget for a spending category",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "Plaid category (e.g. FOOD_AND_DRINK, GENERAL_MERCHANDISE, ENTERTAINMENT)" },
        monthly_limit: { type: "number", description: "Monthly budget limit in dollars" },
      },
      required: ["category", "monthly_limit"],
    },
  },
  {
    name: "get_goals",
    description: "Get financial goals with progress tracking",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "set_goal",
    description: "Create or update a financial goal",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Goal name" },
        target_amount: { type: "number", description: "Target amount in dollars" },
        current_amount: { type: "number", description: "Current amount saved (optional)" },
        target_date: { type: "string", description: "Target date (YYYY-MM-DD, optional)" },
      },
      required: ["name", "target_amount"],
    },
  },
  {
    name: "get_score",
    description: "Get the latest daily financial behavior score (0-100) and streaks",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_recurring",
    description: "List detected recurring transactions and bills",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_alerts",
    description: "Get current financial alerts (large transactions, low balances, budget overruns)",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "save_memory",
    description: "Save an important fact or preference to long-term memory. Use this when the user shares something worth remembering across conversations.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "The fact or preference to remember" },
        category: { type: "string", description: "Category: general, preference, goal, life_event", default: "general" },
      },
      required: ["content"],
    },
  },
  {
    name: "get_memories",
    description: "Retrieve all saved long-term memories",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },

  // --- New: Income & Search ---
  {
    name: "get_income",
    description: "Get income sources and amounts for a time period",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "Start date (YYYY-MM-DD). Defaults to start of current month." },
        end_date: { type: "string", description: "End date (YYYY-MM-DD). Defaults to today." },
      },
      required: [],
    },
  },
  {
    name: "search_transactions",
    description: "Full-text search transactions by name, merchant, or category. Use this when the user asks to find specific transactions.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (matches name, merchant, or category)" },
        limit: { type: "number", description: "Max results (default 30)" },
      },
      required: ["query"],
    },
  },
  {
    name: "categorize_transaction",
    description: "Re-categorize a specific transaction",
    input_schema: {
      type: "object" as const,
      properties: {
        transaction_id: { type: "string", description: "The transaction ID to recategorize" },
        category: { type: "string", description: "New category (e.g. FOOD_AND_DRINK, GENERAL_MERCHANDISE)" },
        subcategory: { type: "string", description: "New subcategory (optional)" },
      },
      required: ["transaction_id", "category"],
    },
  },

  // --- New: Analysis ---
  {
    name: "cash_flow",
    description: "Analyze income vs expenses with savings rate and monthly breakdown",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "Start date (YYYY-MM-DD). Defaults to 3 months ago." },
        end_date: { type: "string", description: "End date (YYYY-MM-DD). Defaults to today." },
      },
      required: [],
    },
  },
  {
    name: "forecast_balance",
    description: "Project account balance N months forward based on recent cash flow patterns",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: { type: "string", description: "Specific account ID (optional, defaults to all depository)" },
        months: { type: "number", description: "Number of months to forecast (default 6)" },
      },
      required: [],
    },
  },
  {
    name: "compare_spending",
    description: "Side-by-side spending comparison of two time periods, broken down by category",
    input_schema: {
      type: "object" as const,
      properties: {
        period1_start: { type: "string", description: "Period 1 start date (YYYY-MM-DD)" },
        period1_end: { type: "string", description: "Period 1 end date (YYYY-MM-DD)" },
        period2_start: { type: "string", description: "Period 2 start date (YYYY-MM-DD)" },
        period2_end: { type: "string", description: "Period 2 end date (YYYY-MM-DD)" },
      },
      required: ["period1_start", "period1_end", "period2_start", "period2_end"],
    },
  },
  {
    name: "get_net_worth_trend",
    description: "Get net worth history over time to see the trend",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of data points (default 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_monthly_savings",
    description: "Compare this month's spending pace to the baseline month to see how much you're saving",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },

  // --- New: Investments ---
  {
    name: "get_portfolio",
    description: "Get investment holdings grouped by account with values, cost basis, and gain/loss",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "investment_performance",
    description: "Get investment returns vs cost basis for each holding",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },

  // --- New: Debts ---
  {
    name: "get_debts",
    description: "List all debts with balances, interest rates, and minimum payments. Note: rate may render as 'APR unknown' when the source (e.g. Apple Card CSV import) doesn't carry APR data — treat unknown APRs as high-rate retail-card debt (~20%) for payoff prioritization, not as 0%.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "calculate_debt_payoff",
    description: "Simulate debt payoff with different strategies (minimum, avalanche, snowball) and optional extra payment",
    input_schema: {
      type: "object" as const,
      properties: {
        strategy: { type: "string", description: "Payoff strategy: minimum, avalanche (highest rate first), or snowball (lowest balance first)", default: "avalanche" },
        extra_monthly: { type: "number", description: "Extra monthly payment beyond minimums (default 0)" },
      },
      required: [],
    },
  },

  // --- New: Context ---
  {
    name: "update_context",
    description: "Update the persistent financial context file. Use when circumstances change: new decisions, completed goals, changed balances, updated strategy, or important life events. Use 'section' param to replace a specific section cleanly.",
    input_schema: {
      type: "object" as const,
      properties: {
        updates: { type: "string", description: "Description of what changed and the new information to incorporate (used when no section specified)" },
        section: { type: "string", description: "Section heading to replace (e.g. 'Family', 'Income', 'Goals', 'Strategy'). Replaces everything under that ## heading." },
        content: { type: "string", description: "New content for the section (used with section param)" },
      },
      required: [],
    },
  },

  // --- New: Data modification ---
  {
    name: "delete_budget",
    description: "Remove a budget category",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "Budget category to delete" },
      },
      required: ["category"],
    },
  },
  {
    name: "delete_goal",
    description: "Remove a financial goal",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Goal name to delete" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_goal_progress",
    description: "Update the current amount on a financial goal",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Goal name" },
        current_amount: { type: "number", description: "New current amount" },
      },
      required: ["name", "current_amount"],
    },
  },
  {
    name: "label_transaction",
    description: "Add a note or label to a transaction for personal tracking",
    input_schema: {
      type: "object" as const,
      properties: {
        transaction_id: { type: "string", description: "Transaction ID" },
        label: { type: "string", description: "Label text (optional)" },
        note: { type: "string", description: "Note text (optional)" },
      },
      required: ["transaction_id"],
    },
  },
  {
    name: "add_recat_rule",
    description: "Create an auto-recategorization rule for future syncs. Transactions matching the pattern will be automatically recategorized.",
    input_schema: {
      type: "object" as const,
      properties: {
        match_field: { type: "string", description: "Field to match: name, merchant_name" },
        match_pattern: { type: "string", description: "Pattern to match (case-insensitive substring)" },
        target_category: { type: "string", description: "Category to assign" },
        target_subcategory: { type: "string", description: "Subcategory (optional)" },
        label: { type: "string", description: "Label to apply (optional)" },
      },
      required: ["match_field", "match_pattern", "target_category"],
    },
  },
];

export async function executeTool(db: Database.Database, toolName: string, toolInput: any): Promise<string> {
  switch (toolName) {
    case "get_net_worth": {
      const nw = getNetWorth(db);
      const change = nw.prev_net_worth !== null ? nw.net_worth - nw.prev_net_worth : null;
      let result = `Net worth: ${formatMoney(nw.net_worth)}`;
      if (change !== null) result += ` (${change >= 0 ? "+" : ""}${formatMoney(change)} from yesterday)`;
      result += `\nAssets: ${formatMoney(nw.assets)} | Liabilities: ${formatMoney(nw.liabilities)}`;
      result += `\nHome equity: ${formatMoney(nw.home_equity)} | Investments: ${formatMoney(nw.investments)} | Cash: ${formatMoney(nw.cash)}`;
      if (nw.credit_debt > 0) result += `\nCredit card debt: ${formatMoney(nw.credit_debt)}`;
      if (nw.mortgage > 0) result += `\nMortgage: ${formatMoney(nw.mortgage)}`;
      return result;
    }

    case "get_accounts": {
      const accounts = getAccountBalances(db);
      if (accounts.length === 0) return "No accounts linked yet.";
      // Account names are user-controllable (via `ray add`, institution-
      // supplied Plaid names are effectively untrusted too) — sanitize
      // before interpolating into the tool output that feeds back to the LLM.
      return accounts.map(a => `${sanitizeForPrompt(a.name)} (${a.type}): ${["credit", "loan"].includes(a.type) ? "-" : ""}${formatMoney(a.balance)}`).join("\n");
    }

    case "get_transactions": {
      const txns = getTransactionsFiltered(db, {
        startDate: toolInput.start_date,
        endDate: toolInput.end_date,
        category: toolInput.category,
        merchant: toolInput.merchant,
        minAmount: toolInput.min_amount,
        maxAmount: toolInput.max_amount,
        limit: toolInput.limit,
      });
      if (txns.length === 0) return "No transactions found matching those filters.";
      // Sanitize user-controlled text (name, merchant) so an injected
      // instruction in a merchant field can't smuggle directives to the model.
      return txns.map(t => `${t.date} | ${sanitizeForPrompt(t.name)} | ${formatMoney(t.amount)} | ${categoryLabel(t.category)}`).join("\n");
    }

    case "get_spending_summary": {
      const period = toolInput.period || "this_month";
      const { resolvePeriod } = await import("../db/helpers.js");
      const { start, end } = resolvePeriod(period);
      const rows = db.prepare(
        `SELECT category, SUM(amount) as total, COUNT(*) as count FROM transactions
         WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
         AND (category IS NULL OR category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS'))
         GROUP BY category ORDER BY total DESC`
      ).all(start, end) as { category: string; total: number; count: number }[];
      if (rows.length === 0) return "No spending found for that period.";
      const grandTotal = rows.reduce((s, r) => s + r.total, 0);
      let result = `Spending ${start} to ${end}: ${formatMoney(grandTotal)} total\n\n`;
      result += rows.map(r => `${categoryLabel(r.category)}: ${formatMoney(r.total)} (${r.count} transactions)`).join("\n");
      return result;
    }

    case "get_budgets": {
      const budgets = getBudgetStatuses(db);
      if (budgets.length === 0) return "No budgets set up yet. Use set_budget to create one.";
      const now = new Date();
      const monthPct = Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100);
      let result = `Budget status (${monthPct}% through the month):\n\n`;
      result += budgets.map(b => {
        const status = b.over_budget ? "OVER" : `${b.pct_used}%`;
        return `${b.over_budget ? "!" : "•"} ${categoryLabel(b.category)}: ${formatMoney(b.spent)} / ${formatMoney(b.budget)} (${status})${b.over_budget ? ` — ${formatMoney(Math.abs(b.remaining))} over` : ""}`;
      }).join("\n");
      return result;
    }

    case "set_budget": {
      db.prepare(
        `INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)
         ON CONFLICT(category, period) DO UPDATE SET monthly_limit = excluded.monthly_limit`
      ).run(toolInput.category, toolInput.monthly_limit);
      return `Budget set: ${categoryLabel(toolInput.category)} at ${formatMoney(toolInput.monthly_limit)}/month`;
    }

    case "get_goals": {
      const goals = getGoals(db);
      if (goals.length === 0) return "No goals set up yet. Use set_goal to create one.";
      // Goal names come from user input (set_goal / CLI). Sanitize before
      // interpolating into the LLM-bound tool output.
      return goals.map(g => {
        let line = `${sanitizeForPrompt(g.name)}: ${formatMoney(g.current)} / ${formatMoney(g.target)} (${g.progress_pct}%)`;
        if (g.target_date) line += ` — target: ${g.target_date}`;
        if (g.monthly_needed > 0) line += ` — need ${formatMoney(g.monthly_needed)}/mo`;
        return line;
      }).join("\n");
    }

    case "set_goal": {
      const existing = db.prepare(`SELECT id FROM goals WHERE name = ?`).get(toolInput.name) as any;
      if (existing) {
        const updates: string[] = [];
        const params: any[] = [];
        if (toolInput.target_amount !== undefined) { updates.push("target_amount = ?"); params.push(toolInput.target_amount); }
        if (toolInput.current_amount !== undefined) { updates.push("current_amount = ?"); params.push(toolInput.current_amount); }
        if (toolInput.target_date !== undefined) { updates.push("target_date = ?"); params.push(toolInput.target_date); }
        if (updates.length === 0) return `Goal "${toolInput.name}" exists but no changes provided.`;
        params.push(existing.id);
        db.prepare(`UPDATE goals SET ${updates.join(", ")} WHERE id = ?`).run(...params);
        return `Goal "${toolInput.name}" updated.`;
      } else {
        db.prepare(
          `INSERT INTO goals (name, target_amount, current_amount, target_date) VALUES (?, ?, ?, ?)`
        ).run(toolInput.name, toolInput.target_amount, toolInput.current_amount || 0, toolInput.target_date || null);
        return `Goal "${toolInput.name}" created: target ${formatMoney(toolInput.target_amount)}`;
      }
    }

    case "get_score": {
      const score = getLatestScore(db);
      if (!score) return "No daily scores calculated yet. Run 'ray sync' or import an Apple Card CSV with 'ray import-apple' to produce a score.";
      let result = `Daily score: ${score.score}/100 (${score.date})`;
      result += `\nStreaks: ${score.no_restaurant_streak}d no restaurants | ${score.no_shopping_streak}d no shopping | ${score.on_pace_streak}d on pace`;
      result += `\nYesterday: ${formatMoney(score.total_spend)} total spend, ${score.restaurant_count} restaurant visits, ${score.shopping_count} shopping purchases`;
      if (score.zero_spend) result += "\nZero-spend day!";
      return result;
    }

    case "get_recurring": {
      const rows = db.prepare(
        `SELECT merchant_name, description, avg_amount, last_amount, frequency, last_date, stream_type
         FROM recurring WHERE is_active = 1 ORDER BY stream_type, avg_amount DESC`
      ).all() as { merchant_name: string | null; description: string; avg_amount: number; last_amount: number; frequency: string; last_date: string; stream_type: string }[];
      if (rows.length === 0) return "No recurring transactions detected yet.";
      return rows.map(r => {
        const name = sanitizeForPrompt(r.merchant_name || r.description);
        const arrow = r.stream_type === "inflow" ? "+" : "-";
        return `${arrow} ${name}: ${formatMoney(Math.abs(r.avg_amount))} (${r.frequency.toLowerCase()}, last: ${r.last_date})`;
      }).join("\n");
    }

    case "get_alerts": {
      const alerts = generateAlerts(db);
      if (alerts.length === 0) return "No active alerts. Everything looks good!";
      return alerts.map(a => `${a.severity === "critical" ? "\u{1F534}" : a.severity === "warning" ? "\u{1F7E1}" : "\u2139\uFE0F"} ${a.message}`).join("\n");
    }

    case "save_memory": {
      saveMemory(db, toolInput.content, toolInput.category || "general");
      return `Remembered: "${toolInput.content}"`;
    }

    case "get_memories": {
      const memories = getMemories(db);
      if (memories.length === 0) return "No memories saved yet.";
      // Memory content is user-typed (via save_memory). sanitizeForPrompt
      // clips control chars AND truncates at 80 chars — memories can
      // legitimately exceed 80 chars, so use a dedicated control-strip
      // helper via sanitizeForPrompt's 80-char clip on this tool output
      // is acceptable (the model can see "..." and re-ask if it needs the
      // full memory). The defense is against control chars / newlines that
      // would let crafted content inject instructions, not against length.
      return memories.map(m => `[${m.category}] ${sanitizeForPrompt(m.content)} (saved ${m.created_at})`).join("\n");
    }

    // --- New: Income & Search ---

    case "get_income": {
      const now = new Date();
      const start = toolInput.start_date || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = toolInput.end_date || now.toISOString().slice(0, 10);
      const sources = getIncome(db, start, end);
      if (sources.length === 0) return `No income found from ${start} to ${end}.`;
      const total = sources.reduce((s, r) => s + r.total, 0);
      let result = `Income ${start} to ${end}: ${formatMoney(total)} total\n\n`;
      // `s.source` is COALESCE(merchant_name, name) — both are
      // user-controllable via CSV import / bank feeds. Sanitize before
      // interpolating into the LLM-bound tool output.
      result += sources.map(s => `${sanitizeForPrompt(s.source)}: ${formatMoney(s.total)} (${s.count} deposits)`).join("\n");
      return result;
    }

    case "search_transactions": {
      const results = searchTransactions(db, toolInput.query, toolInput.limit);
      if (results.length === 0) return `No transactions found matching "${sanitizeForPrompt(toolInput.query)}".`;
      return results.map(t => `${t.date} | ${sanitizeForPrompt(t.name)}${t.merchant_name ? ` (${sanitizeForPrompt(t.merchant_name)})` : ""} | ${formatMoney(t.amount)} | ${categoryLabel(t.category)}`).join("\n");
    }

    case "categorize_transaction": {
      const updates: string[] = ["category = ?"];
      const params: any[] = [toolInput.category];
      if (toolInput.subcategory) {
        updates.push("subcategory = ?");
        params.push(toolInput.subcategory);
      }
      params.push(toolInput.transaction_id);
      const info = db.prepare(`UPDATE transactions SET ${updates.join(", ")} WHERE transaction_id = ?`).run(...params);
      if (info.changes === 0) return `Transaction ${toolInput.transaction_id} not found.`;
      return `Transaction recategorized to ${categoryLabel(toolInput.category)}.`;
    }

    // --- New: Analysis ---

    case "cash_flow": {
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const start = toolInput.start_date || threeMonthsAgo.toISOString().slice(0, 10);
      const end = toolInput.end_date || now.toISOString().slice(0, 10);
      const cf = getCashFlow(db, start, end);
      let result = `Cash Flow ${start} to ${end}:\n`;
      result += `Income: ${formatMoney(cf.income)} | Expenses: ${formatMoney(cf.expenses)} | Net: ${formatMoney(cf.net)}`;
      result += `\nSavings rate: ${cf.savingsRate}%`;
      if (cf.monthly.length > 1) {
        result += `\n\nMonthly breakdown:`;
        for (const m of cf.monthly) {
          result += `\n${m.month}: Income ${formatMoney(m.income)} | Expenses ${formatMoney(m.expenses)} | Net ${formatMoney(m.net)}`;
        }
      }
      return result;
    }

    case "forecast_balance": {
      const fc = forecastBalance(db, toolInput.account_id, toolInput.months || 6);
      let result = `Current balance: ${formatMoney(fc.currentBalance)}`;
      result += `\nAvg monthly inflow: ${formatMoney(fc.avgMonthlyInflow)} | Avg outflow: ${formatMoney(fc.avgMonthlyOutflow)}`;
      result += `\n\nProjections:`;
      for (const p of fc.projections) {
        result += `\n${p.month}: ${formatMoney(p.projected)}`;
      }
      return result;
    }

    case "compare_spending": {
      const cmp = compareSpending(db, toolInput.period1_start, toolInput.period1_end, toolInput.period2_start, toolInput.period2_end);
      let result = `Period 1 (${toolInput.period1_start} to ${toolInput.period1_end}): ${formatMoney(cmp.period1Total)}`;
      result += `\nPeriod 2 (${toolInput.period2_start} to ${toolInput.period2_end}): ${formatMoney(cmp.period2Total)}`;
      result += `\nDifference: ${cmp.difference >= 0 ? "+" : ""}${formatMoney(cmp.difference)} (${cmp.pctChange >= 0 ? "+" : ""}${cmp.pctChange}%)`;
      if (cmp.categories.length > 0) {
        result += `\n\nBy category:`;
        for (const c of cmp.categories) {
          const arrow = c.diff > 0 ? "+" : "";
          result += `\n${categoryLabel(c.category)}: ${formatMoney(c.period1)} → ${formatMoney(c.period2)} (${arrow}${formatMoney(c.diff)})`;
        }
      }
      return result;
    }

    case "get_net_worth_trend": {
      const trend = getNetWorthTrend(db, toolInput.limit || 30);
      if (trend.length === 0) return "No net worth history available yet.";
      let result = `Net worth trend (${trend.length} data points):\n`;
      result += trend.map(t => `${t.date}: ${formatMoney(t.net_worth)} (assets: ${formatMoney(t.assets)}, liabilities: ${formatMoney(t.liabilities)})`).join("\n");
      if (trend.length >= 2) {
        const first = trend[0].net_worth;
        const last = trend[trend.length - 1].net_worth;
        const change = last - first;
        result += `\n\nChange over period: ${change >= 0 ? "+" : ""}${formatMoney(change)}`;
      }
      return result;
    }

    case "get_monthly_savings": {
      const savings = getMonthlySavings(db);
      if (!savings.baselineMonth) return "Not enough data to compare savings yet. Need at least one full month of transaction history.";
      let result = `Monthly savings vs ${savings.baselineMonth} baseline:`;
      result += `\nBaseline pace (${savings.daysCompared} days): ${formatMoney(savings.baselinePace)}`;
      result += `\nCurrent pace: ${formatMoney(savings.currentPace)}`;
      result += `\n${savings.saved >= 0 ? "Saved" : "Over by"}: ${formatMoney(Math.abs(savings.saved))}`;
      return result;
    }

    // --- New: Investments ---

    case "get_portfolio": {
      const port = getPortfolio(db);
      if (port.holdings.length === 0) return "No investment holdings found.";
      let result = `Portfolio: ${formatMoney(port.totalValue)} total value`;
      result += ` | Cost basis: ${formatMoney(port.totalCostBasis)} | Gain/Loss: ${port.totalGainLoss >= 0 ? "+" : ""}${formatMoney(port.totalGainLoss)}`;
      result += `\n\nHoldings:`;
      for (const h of port.holdings) {
        // Ticker + security name + account name all flow from broker-supplied
        // data / user account names — sanitize before LLM interpolation.
        result += `\n${sanitizeForPrompt(h.ticker || h.security)} (${sanitizeForPrompt(h.account)}): ${formatMoney(h.value)} | ${h.quantity} shares | G/L: ${h.gainLoss >= 0 ? "+" : ""}${formatMoney(h.gainLoss)}`;
      }
      return result;
    }

    case "investment_performance": {
      const perf = getInvestmentPerformance(db);
      if (perf.holdings.length === 0) return "No investment holdings found.";
      let result = `Total return: ${perf.totalReturn >= 0 ? "+" : ""}${formatMoney(perf.totalReturn)} (${perf.totalReturnPct >= 0 ? "+" : ""}${perf.totalReturnPct}%)`;
      result += `\n\nBy holding:`;
      for (const h of perf.holdings) {
        result += `\n${sanitizeForPrompt(h.ticker || h.security)}: ${formatMoney(h.value)} (cost: ${formatMoney(h.costBasis)}, return: ${h.returnPct >= 0 ? "+" : ""}${h.returnPct}%)`;
      }
      return result;
    }

    // --- New: Debts ---

    case "get_debts": {
      const d = getDebts(db);
      if (d.debts.length === 0) return "No debts found.";
      let result = `Total debt: ${formatMoney(d.totalDebt)}\n`;
      for (const debt of d.debts) {
        // Debt names come from accounts.name (user-controllable) — sanitize
        // before interpolating into the LLM-bound tool output so a crafted
        // name can't inject instructions into the model's context.
        result += `\n${sanitizeForPrompt(debt.name)}: ${formatMoney(debt.balance)}`;
        // rate === null means APR is genuinely unknown (e.g. Apple Card
        // imported from CSV — Apple doesn't export APR). Surface "APR
        // unknown" explicitly so the model doesn't silently treat it as 0%
        // when ranking debts for payoff advice. rate === 0 still renders as
        // 0% (promotional / genuinely no-APR).
        if (debt.rate != null) result += ` @ ${debt.rate}% APR`;
        else result += ` @ APR unknown`;
        if (debt.minPayment > 0) result += ` | Min: ${formatMoney(debt.minPayment)}/mo`;
        if (debt.nextDue) result += ` | Next due: ${debt.nextDue}`;
      }
      return result;
    }

    case "calculate_debt_payoff": {
      const d = getDebts(db);
      if (d.debts.length === 0) return "No debts found.";

      const strategy = toolInput.strategy || "avalanche";
      const extraMonthly = toolInput.extra_monthly || 0;

      // Default APR assumed for unknown-rate debts (e.g. Apple Card imports
      // without --apr). Retail cards are typically high-rate (~20%), so a
      // payoff simulation that treats them as 0% would mislead the model
      // into deprioritizing real expensive debt.
      const ASSUMED_UNKNOWN_APR = 20;

      // Sort debts by strategy. For avalanche, treat rate===null as Infinity
      // for sort (so null-rate debts fall to the bottom like getDebts's
      // queries/index.ts ordering) — this keeps small unknown-rate retail
      // cards from jumping ahead of legitimately-high-rate debts. The
      // simulation loop still applies ASSUMED_UNKNOWN_APR to rows it does
      // simulate; this sort change only affects ordering.
      const sorted = [...d.debts].filter(debt => debt.balance > 0);
      if (strategy === "avalanche") {
        sorted.sort((a, b) => (b.rate ?? -Infinity) - (a.rate ?? -Infinity));
      } else if (strategy === "snowball") {
        sorted.sort((a, b) => a.balance - b.balance);
      }

      let result = `Debt payoff simulation (${strategy} strategy, ${formatMoney(extraMonthly)} extra/mo):\n`;
      result += `Total debt: ${formatMoney(d.totalDebt)}\n`;

      let totalInterest = 0;
      let maxMonths = 0;

      for (const debt of sorted) {
        if (debt.rate === 0 && debt.minPayment === 0) {
          result += `\n${sanitizeForPrompt(debt.name)}: ${formatMoney(debt.balance)} — no rate/payment info available`;
          continue;
        }
        // rate === null: APR is genuinely unknown. Simulating at a
        // retail-card assumption (~20%) is only defensible for small
        // credit-card-shaped debts — extrapolating a $350k mortgage at
        // 20% and $50/mo synthesized payment produces fabricated $3.5M
        // interest over a fake 600-month timeline that the LLM would
        // then cite. Tighten the guard so null-rate debts that look
        // like loans (non-credit type, or large balance, or zero
        // minimum) skip with an honest "unknown" note instead. Apple
        // Card-shaped rows (rate=null, type=credit, small balance) with
        // minPayment<=0 also skip now — the previous code fabricated a
        // $50/mo simulation for those too.
        if (
          debt.rate == null &&
          (debt.minPayment <= 0 || debt.type !== "credit" || debt.balance > 50000)
        ) {
          result += `\n${sanitizeForPrompt(debt.name)} (${debt.type}): ${formatMoney(debt.balance)} — APR and/or minimum payment unknown; cannot simulate payoff. Ask the user for the APR and monthly payment.`;
          continue;
        }
        const effectiveRate = debt.rate ?? ASSUMED_UNKNOWN_APR;
        const rateNote = debt.rate == null ? ` (APR unknown — assumed ~${ASSUMED_UNKNOWN_APR}% for simulation)` : "";
        const payment = Math.max(debt.minPayment, 50) + (sorted.indexOf(debt) === 0 ? extraMonthly : 0);
        const sim = simulatePayoff(debt.balance, effectiveRate, payment);
        totalInterest += sim.totalInterest;
        maxMonths = Math.max(maxMonths, sim.months);

        const payoffDate = new Date();
        payoffDate.setMonth(payoffDate.getMonth() + sim.months);
        result += `\n${sanitizeForPrompt(debt.name)}: ${formatMoney(debt.balance)} @ ${effectiveRate}%${rateNote}`;
        result += ` → ${sim.months} months (${payoffDate.toISOString().slice(0, 7)})`;
        result += ` | ${formatMoney(sim.totalInterest)} interest | ${formatMoney(payment)}/mo`;
      }

      result += `\n\nTotal interest: ${formatMoney(totalInterest)}`;
      if (maxMonths > 0) {
        const finalDate = new Date();
        finalDate.setMonth(finalDate.getMonth() + maxMonths);
        result += ` | Debt-free by: ${finalDate.toISOString().slice(0, 7)}`;
      }
      return result;
    }

    // --- New: Context ---

    case "update_context": {
      if (toolInput.section) {
        const sectionContent = toolInput.content || toolInput.updates || "";
        replaceContextSection(toolInput.section, sectionContent);
        return `Context section "${toolInput.section}" updated.`;
      }
      // Fallback: append mode
      const current = readContext();
      const updates = toolInput.updates || toolInput.content || "";
      const updated = current
        ? `${current}\n\n---\n_Updated ${new Date().toISOString().slice(0, 10)}_: ${updates}`
        : updates;
      writeContext(updated);
      return `Context updated: ${updates.slice(0, 100)}${updates.length > 100 ? "..." : ""}`;
    }

    // --- New: Data modification ---

    case "delete_budget": {
      const info = db.prepare(`DELETE FROM budgets WHERE category = ?`).run(toolInput.category);
      if (info.changes === 0) return `No budget found for category "${toolInput.category}".`;
      return `Budget for ${categoryLabel(toolInput.category)} deleted.`;
    }

    case "delete_goal": {
      const info = db.prepare(`DELETE FROM goals WHERE name = ?`).run(toolInput.name);
      if (info.changes === 0) return `No goal found with name "${toolInput.name}".`;
      return `Goal "${toolInput.name}" deleted.`;
    }

    case "update_goal_progress": {
      const info = db.prepare(`UPDATE goals SET current_amount = ? WHERE name = ?`).run(toolInput.current_amount, toolInput.name);
      if (info.changes === 0) return `No goal found with name "${toolInput.name}".`;
      return `Goal "${toolInput.name}" updated to ${formatMoney(toolInput.current_amount)}.`;
    }

    case "label_transaction": {
      const updates: string[] = [];
      const params: any[] = [];
      if (toolInput.label) { updates.push("label = ?"); params.push(toolInput.label); }
      if (toolInput.note) { updates.push("note = ?"); params.push(toolInput.note); }
      if (updates.length === 0) return "Provide a label or note to add.";
      params.push(toolInput.transaction_id);
      const info = db.prepare(`UPDATE transactions SET ${updates.join(", ")} WHERE transaction_id = ?`).run(...params);
      if (info.changes === 0) return `Transaction ${toolInput.transaction_id} not found.`;
      return `Transaction labeled.`;
    }

    case "add_recat_rule": {
      const allowedFields = ["name", "merchant_name", "category", "subcategory"];
      if (!allowedFields.includes(toolInput.match_field)) {
        return `Invalid match_field "${toolInput.match_field}". Must be one of: ${allowedFields.join(", ")}`;
      }
      db.prepare(
        `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label) VALUES (?, ?, ?, ?, ?)`
      ).run(toolInput.match_field, toolInput.match_pattern, toolInput.target_category, toolInput.target_subcategory || null, toolInput.label || null);
      return `Recategorization rule added: ${toolInput.match_field} matching "${toolInput.match_pattern}" → ${categoryLabel(toolInput.target_category)}`;
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
