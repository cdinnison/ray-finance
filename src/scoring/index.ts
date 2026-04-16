import type BetterSqlite3 from "libsql";
type Database = BetterSqlite3.Database;

export interface DailyScore {
  date: string;
  score: number;
  restaurant_count: number;
  shopping_count: number;
  food_spend: number;
  total_spend: number;
  zero_spend: boolean;
  no_restaurant_streak: number;
  no_shopping_streak: number;
  on_pace_streak: number;
}

export interface Achievement {
  key: string;
  name: string;
  description: string;
  unlocked_at: string;
}

/**
 * Calculate and store the daily score for a given date (defaults to yesterday).
 * Should run during daily sync, after transactions are updated.
 */
export function calculateDailyScore(db: Database, dateStr?: string): DailyScore {
  const date = dateStr || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const nextDate = new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Count restaurant/fast food/coffee visits
  const restaurants = db.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE (date = ? OR (date = ? AND pending = 1)) AND amount > 0
     AND category = 'FOOD_AND_DRINK'
     AND (subcategory LIKE '%RESTAURANT%' OR subcategory LIKE '%FAST_FOOD%' OR subcategory LIKE '%COFFEE%')`
  ).get(date, nextDate) as { cnt: number; total: number };

  // Count shopping purchases
  const shopping = db.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE (date = ? OR (date = ? AND pending = 1)) AND amount > 0
     AND category = 'GENERAL_MERCHANDISE'`
  ).get(date, nextDate) as { cnt: number; total: number };

  // Total food spend
  const food = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE (date = ? OR (date = ? AND pending = 1)) AND amount > 0
     AND category = 'FOOD_AND_DRINK'`
  ).get(date, nextDate) as { total: number };

  // Total discretionary spend (exclude fixed bills, transfers, loan payments)
  const totalSpend = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE (date = ? OR (date = ? AND pending = 1)) AND amount > 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS',
       'LOAN_PAYMENTS_CAR_PAYMENT', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT',
       'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT')`
  ).get(date, nextDate) as { total: number };

  // Get budget pace for food
  const now = new Date(date);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const foodBudget = db.prepare(`SELECT monthly_limit FROM budgets WHERE category = 'FOOD_AND_DRINK'`)
    .get() as { monthly_limit: number } | undefined;
  const dailyFoodBudget = (foodBudget?.monthly_limit || 900) / daysInMonth;

  // Check if all budgets are on pace
  const dayOfMonth = now.getDate();
  const monthPct = dayOfMonth / daysInMonth;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const budgets = db.prepare(`SELECT category, monthly_limit FROM budgets`).all() as { category: string; monthly_limit: number }[];
  const controllable = ["FOOD_AND_DRINK", "GENERAL_MERCHANDISE", "ENTERTAINMENT", "PERSONAL_CARE", "TRANSPORTATION"];

  let allOnPace = true;
  for (const b of budgets) {
    if (!controllable.includes(b.category)) continue;
    const spent = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE category = ? AND date BETWEEN ? AND ? AND amount > 0`
    ).get(b.category, monthStart, date) as { total: number };
    if (spent.total / b.monthly_limit > monthPct + 0.05) {
      allOnPace = false;
      break;
    }
  }

  const isZeroSpend = totalSpend.total === 0;

  // --- Calculate score ---
  let score = 50; // Base

  // No restaurants: +15
  if (restaurants.cnt === 0) score += 15;
  // Each restaurant visit: -10
  else score -= restaurants.cnt * 10;

  // No shopping: +15
  if (shopping.cnt === 0) score += 15;
  // Each shopping purchase: -10
  else score -= shopping.cnt * 10;

  // Food under daily pace: +10
  if (food.total <= dailyFoodBudget) score += 10;
  // Food way over (2x pace): -5
  else if (food.total > dailyFoodBudget * 2) score -= 5;

  // Total discretionary under $50: +10
  if (totalSpend.total > 0 && totalSpend.total < 50) score += 10;

  // Zero-spend day: +25 (jackpot)
  if (isZeroSpend) score += 25;

  // Clamp
  score = Math.max(0, Math.min(100, score));

  // --- Streaks (look at previous day's record) ---
  const prev = db.prepare(
    `SELECT no_restaurant_streak, no_shopping_streak, on_pace_streak FROM daily_scores
     WHERE date < ? ORDER BY date DESC LIMIT 1`
  ).get(date) as { no_restaurant_streak: number; no_shopping_streak: number; on_pace_streak: number } | undefined;

  const noRestaurantStreak = restaurants.cnt === 0 ? (prev?.no_restaurant_streak || 0) + 1 : 0;
  const noShoppingStreak = shopping.cnt === 0 ? (prev?.no_shopping_streak || 0) + 1 : 0;
  const onPaceStreak = allOnPace ? (prev?.on_pace_streak || 0) + 1 : 0;

  // Store
  db.prepare(
    `INSERT INTO daily_scores (date, score, restaurant_count, shopping_count, food_spend, total_spend, zero_spend, no_restaurant_streak, no_shopping_streak, on_pace_streak)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       score=excluded.score, restaurant_count=excluded.restaurant_count,
       shopping_count=excluded.shopping_count, food_spend=excluded.food_spend,
       total_spend=excluded.total_spend, zero_spend=excluded.zero_spend,
       no_restaurant_streak=excluded.no_restaurant_streak,
       no_shopping_streak=excluded.no_shopping_streak,
       on_pace_streak=excluded.on_pace_streak`
  ).run(date, score, restaurants.cnt, shopping.cnt, food.total, totalSpend.total, isZeroSpend ? 1 : 0,
    noRestaurantStreak, noShoppingStreak, onPaceStreak);

  return {
    date,
    score,
    restaurant_count: restaurants.cnt,
    shopping_count: shopping.cnt,
    food_spend: food.total,
    total_spend: totalSpend.total,
    zero_spend: isZeroSpend,
    no_restaurant_streak: noRestaurantStreak,
    no_shopping_streak: noShoppingStreak,
    on_pace_streak: onPaceStreak,
  };
}

/**
 * Check and unlock any new achievements. Returns newly unlocked ones.
 */
export function checkAchievements(db: Database): Achievement[] {
  const newlyUnlocked: Achievement[] = [];

  const definitions: { key: string; name: string; description: string; check: () => boolean }[] = [
    {
      key: "clean_week",
      name: "Clean Week",
      description: "7 consecutive days with all budgets on pace",
      check: () => {
        const row = db.prepare(`SELECT on_pace_streak FROM daily_scores ORDER BY date DESC LIMIT 1`).get() as any;
        return row?.on_pace_streak >= 7;
      },
    },
    {
      key: "home_chef",
      name: "Home Chef",
      description: "14-day no-restaurant streak",
      check: () => {
        const row = db.prepare(`SELECT no_restaurant_streak FROM daily_scores ORDER BY date DESC LIMIT 1`).get() as any;
        return row?.no_restaurant_streak >= 14;
      },
    },
    {
      key: "no_restaurant_7",
      name: "Kitchen Hero",
      description: "7-day no-restaurant streak",
      check: () => {
        const row = db.prepare(`SELECT no_restaurant_streak FROM daily_scores ORDER BY date DESC LIMIT 1`).get() as any;
        return row?.no_restaurant_streak >= 7;
      },
    },
    {
      key: "no_shopping_7",
      name: "Window Shopper",
      description: "7 days with zero shopping purchases",
      check: () => {
        const row = db.prepare(`SELECT no_shopping_streak FROM daily_scores ORDER BY date DESC LIMIT 1`).get() as any;
        return row?.no_shopping_streak >= 7;
      },
    },
    {
      key: "no_shopping_14",
      name: "Detoxed",
      description: "14 days with zero shopping purchases",
      check: () => {
        const row = db.prepare(`SELECT no_shopping_streak FROM daily_scores ORDER BY date DESC LIMIT 1`).get() as any;
        return row?.no_shopping_streak >= 14;
      },
    },
    {
      key: "zero_hero",
      name: "Zero Hero",
      description: "A zero-spend day",
      check: () => {
        const row = db.prepare(`SELECT COUNT(*) as cnt FROM daily_scores WHERE zero_spend = 1`).get() as any;
        return row?.cnt >= 1;
      },
    },
    {
      key: "zero_hero_5",
      name: "Monk Mode",
      description: "5 zero-spend days in a single month",
      check: () => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const row = db.prepare(
          `SELECT COUNT(*) as cnt FROM daily_scores WHERE zero_spend = 1 AND date >= ?`
        ).get(monthStart) as any;
        return row?.cnt >= 5;
      },
    },
    {
      key: "debt_crusher",
      name: "Debt Crusher",
      description: "$1,000+ paid toward credit card in a single month",
      check: () => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        // Exclude only refunds, not all TRANSFER_IN. The original filter
        // blocked refunds (Plaid tags refunds as TRANSFER_IN + label='refund'),
        // but `ray import-apple` also maps Apple Card Payment rows to
        // TRANSFER_IN (with label='transfer') — excluding the whole category
        // dropped Apple payments from Debt Crusher. Plaid credit payments are
        // already counted because Plaid uses LOAN_PAYMENTS for them, not
        // TRANSFER_IN, so this change only affects Apple-sourced rows.
        const row = db.prepare(
          `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
           WHERE account_id IN (SELECT account_id FROM accounts WHERE type = 'credit')
           AND amount < 0 AND date >= ?
           AND NOT (category = 'TRANSFER_IN' AND label = 'refund')`
        ).get(monthStart) as any;
        return row?.total >= 1000;
      },
    },
    {
      key: "food_discipline",
      name: "Half Marathon",
      description: "Food budget under target for a full month",
      check: () => {
        const now = new Date();
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
        const budget = db.prepare(`SELECT monthly_limit FROM budgets WHERE category = 'FOOD_AND_DRINK'`).get() as any;
        if (!budget) return false;
        const spent = db.prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
           WHERE category = 'FOOD_AND_DRINK' AND date BETWEEN ? AND ? AND amount > 0`
        ).get(lastMonthStart, lastMonthEnd) as any;
        return spent?.total <= budget.monthly_limit;
      },
    },
    {
      key: "net_worth_500k",
      name: "Half Millionaire",
      description: "Net worth crossed $500,000",
      check: () => {
        const row = db.prepare(`SELECT net_worth FROM net_worth_history ORDER BY date DESC LIMIT 1`).get() as any;
        return row?.net_worth >= 500000;
      },
    },
    {
      key: "bnpl_plan_done",
      name: "One Down",
      description: "A BNPL plan completed",
      check: () => {
        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

        const lastMonth = db.prepare(
          `SELECT DISTINCT merchant_name FROM transactions
           WHERE category = 'LOAN_PAYMENTS' AND (merchant_name LIKE '%Affirm%' OR name LIKE '%PAYMTHLY%')
           AND date BETWEEN ? AND ? AND amount > 0`
        ).all(lastMonthStart, lastMonthEnd) as { merchant_name: string }[];

        const thisMonth = db.prepare(
          `SELECT DISTINCT merchant_name FROM transactions
           WHERE category = 'LOAN_PAYMENTS' AND (merchant_name LIKE '%Affirm%' OR name LIKE '%PAYMTHLY%')
           AND date >= ? AND amount > 0`
        ).all(thisMonthStart) as { merchant_name: string }[];

        const thisMonthNames = new Set(thisMonth.map(r => r.merchant_name));
        return lastMonth.some(r => !thisMonthNames.has(r.merchant_name));
      },
    },
    {
      key: "emergency_2k",
      name: "Safety Net",
      description: "Emergency fund hit $2,000",
      check: () => {
        const goal = db.prepare(`SELECT current_amount FROM goals WHERE name LIKE '%Emergency%'`).get() as any;
        return goal?.current_amount >= 2000;
      },
    },
    {
      key: "score_90_streak_3",
      name: "On Fire",
      description: "Score of 90+ three days in a row",
      check: () => {
        const rows = db.prepare(
          `SELECT score FROM daily_scores ORDER BY date DESC LIMIT 3`
        ).all() as { score: number }[];
        return rows.length >= 3 && rows.every(r => r.score >= 90);
      },
    },
    {
      key: "avg_score_80",
      name: "Consistent",
      description: "Average score of 80+ over a full month",
      check: () => {
        const now = new Date();
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
        const row = db.prepare(
          `SELECT AVG(score) as avg_score, COUNT(*) as cnt FROM daily_scores WHERE date BETWEEN ? AND ?`
        ).get(lastMonthStart, lastMonthEnd) as any;
        return row?.cnt >= 20 && row?.avg_score >= 80;
      },
    },
  ];

  for (const def of definitions) {
    // Skip if already unlocked
    const existing = db.prepare(`SELECT 1 FROM achievements WHERE key = ?`).get(def.key);
    if (existing) continue;

    if (def.check()) {
      db.prepare(
        `INSERT INTO achievements (key, name, description) VALUES (?, ?, ?)`
      ).run(def.key, def.name, def.description);
      newlyUnlocked.push({
        key: def.key,
        name: def.name,
        description: def.description,
        unlocked_at: new Date().toISOString(),
      });
    }
  }

  return newlyUnlocked;
}

/**
 * Get monthly savings compared to the earliest full month of transaction data (dynamic baseline).
 * If no full month exists yet, returns { saved: 0, ... }.
 */
export function getMonthlySavings(db: Database): { saved: number; baselinePace: number; currentPace: number; daysCompared: number; baselineMonth: string | null } {
  const now = new Date();
  const dayOfMonth = now.getDate();

  // Find the earliest full month of transaction data
  const earliest = db.prepare(
    `SELECT MIN(date) as min_date FROM transactions WHERE amount > 0`
  ).get() as { min_date: string | null };

  if (!earliest.min_date) {
    return { saved: 0, baselinePace: 0, currentPace: 0, daysCompared: 0, baselineMonth: null };
  }

  const earliestDate = new Date(earliest.min_date);
  // The first full month starts on the 1st of the month after the earliest transaction
  // unless the earliest transaction IS on the 1st
  let baselineYear = earliestDate.getFullYear();
  let baselineMonth = earliestDate.getMonth();
  if (earliestDate.getDate() > 1) {
    // Move to next month for a full month
    baselineMonth += 1;
    if (baselineMonth > 11) {
      baselineMonth = 0;
      baselineYear += 1;
    }
  }

  // Make sure baseline month is fully in the past
  const baselineEnd = new Date(baselineYear, baselineMonth + 1, 0);
  if (baselineEnd >= now) {
    // Baseline month hasn't ended yet
    return { saved: 0, baselinePace: 0, currentPace: 0, daysCompared: 0, baselineMonth: null };
  }

  // Also skip if baseline is the current month
  if (baselineYear === now.getFullYear() && baselineMonth === now.getMonth()) {
    return { saved: 0, baselinePace: 0, currentPace: 0, daysCompared: 0, baselineMonth: null };
  }

  const baselineStart = `${baselineYear}-${String(baselineMonth + 1).padStart(2, "0")}-01`;
  const baselineEndStr = baselineEnd.toISOString().slice(0, 10);
  const daysInBaseline = baselineEnd.getDate();
  const baselineLabel = `${baselineYear}-${String(baselineMonth + 1).padStart(2, "0")}`;

  // Baseline: total discretionary spending
  const baselineTotal = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE date BETWEEN ? AND ? AND amount > 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS',
       'LOAN_PAYMENTS_CAR_PAYMENT', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT',
       'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT')`
  ).get(baselineStart, baselineEndStr) as { total: number };

  // Baseline daily pace
  const baselineDailyPace = baselineTotal.total / daysInBaseline;

  // This month's actual spend so far
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const currentTotal = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE date BETWEEN ? AND ? AND amount > 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS',
       'LOAN_PAYMENTS_CAR_PAYMENT', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT',
       'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT')`
  ).get(monthStart, today) as { total: number };

  const baselinePaceForDays = baselineDailyPace * dayOfMonth;
  const saved = baselinePaceForDays - currentTotal.total;

  return {
    saved: Math.round(saved * 100) / 100,
    baselinePace: Math.round(baselinePaceForDays * 100) / 100,
    currentPace: Math.round(currentTotal.total * 100) / 100,
    daysCompared: dayOfMonth,
    baselineMonth: baselineLabel,
  };
}

/**
 * Get latest score + streaks for display.
 */
export function getLatestScore(db: Database): DailyScore | null {
  const row = db.prepare(`SELECT * FROM daily_scores ORDER BY date DESC LIMIT 1`).get() as any;
  if (!row) return null;
  return {
    ...row,
    zero_spend: row.zero_spend === 1,
  };
}

/**
 * Get all unlocked achievements.
 */
export function getAchievements(db: Database): Achievement[] {
  return db.prepare(`SELECT * FROM achievements ORDER BY unlocked_at DESC`).all() as Achievement[];
}

/**
 * Get average score for current month.
 */
export function getMonthAvgScore(db: Database): number | null {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const row = db.prepare(
    `SELECT AVG(score) as avg FROM daily_scores WHERE date >= ?`
  ).get(monthStart) as { avg: number | null };
  return row.avg !== null ? Math.round(row.avg) : null;
}
