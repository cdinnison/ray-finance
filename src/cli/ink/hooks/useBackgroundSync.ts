import { useEffect } from "react";
import type Database from "libsql";

/** Kick off runDailySync on a 15-minute interval when accounts were linked recently. */
export function useBackgroundSync(db: Database.Database) {
  useEffect(() => {
    const oldest = db
      .prepare(`SELECT MIN(created_at) as ts FROM institutions`)
      .get() as { ts: string | null };
    if (!oldest?.ts) return;

    const ageMs = Date.now() - new Date(oldest.ts + "Z").getTime();
    if (ageMs >= 6 * 60 * 60 * 1000) return; // linked > 6h ago → skip

    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      try {
        const { runDailySync, SILENT_LOGGER } = await import("../../../daily-sync.js");
        await runDailySync(db, SILENT_LOGGER);
      } catch {
        // swallow — chat must not blow up on bg sync failure
      }
    }, 15 * 60 * 1000);
    timer.unref?.();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [db]);
}
