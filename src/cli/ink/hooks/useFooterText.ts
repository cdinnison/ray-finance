import { useEffect, useMemo, useState } from "react";
import type Database from "libsql";

const HINTS = [
  "try: how am i doing this month?",
  "try: where's my money going?",
  "try: what bills are coming up?",
  "try: help me save more",
  "try: am i on track for my goals?",
  "try: any unusual spending lately?",
  "try: what should i focus on?",
  "try: compare this month to last month",
  "try: set a budget for dining out",
  "try: how much did i spend on groceries?",
];

/** Returns a footer string with last-sync time + a cycling hint. */
export function useFooterText(db: Database.Database): string {
  const [tick, setTick] = useState(0);
  const [hintIdx] = useState(() => Math.floor(Math.random() * HINTS.length));

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const lastSync = db
      .prepare(`SELECT MAX(updated_at) as ts FROM accounts`)
      .get() as { ts: string | null };

    let syncStr = "";
    if (lastSync?.ts) {
      const diffMs = Date.now() - new Date(lastSync.ts + "Z").getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) syncStr = "synced just now";
      else if (mins < 60) syncStr = `synced ${mins}m ago`;
      else if (mins < 1440) syncStr = `synced ${Math.floor(mins / 60)}h ago`;
      else syncStr = `synced ${Math.floor(mins / 1440)}d ago`;
    }

    const idx = (hintIdx + tick) % HINTS.length;
    const parts = ["ray"];
    if (syncStr) parts.push(syncStr);
    parts.push(HINTS[idx]);
    parts.push("ctrl+c to exit");
    return parts.join("  ·  ");
  }, [db, tick, hintIdx]);
}
