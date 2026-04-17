import chalk from "chalk";
import { canLinkAnyProvider, config } from "../config.js";
import { banner } from "./format.js";

/**
 * Pre-mount orchestration: banner, briefing, account check + optional runLink,
 * then hand off to the Ink-rendered ChatApp.
 */
export async function startChat(): Promise<void> {
  const { getDb } = await import("../db/connection.js");
  const { isContextEmpty } = await import("../ai/context.js");
  const { cliBriefing } = await import("../ai/insights.js");
  const db = getDb();

  // Banner + briefing (plain stdout — becomes scrollback above the Ink region)
  console.log("");
  console.log(banner());
  console.log("");

  const briefing = cliBriefing(db);
  if (briefing) {
    const now = new Date();
    const timeStr = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toLowerCase();
    console.log(chalk.dim(`  ${timeStr}`));
    console.log("");
    console.log(briefing);
  } else {
    console.log(chalk.bold("ray") + chalk.dim(` — ${config.userName}`));
  }
  console.log("");

  // Require at least one linked account
  const hasAccounts = db.prepare("SELECT COUNT(*) as count FROM accounts").get() as { count: number };
  if (hasAccounts.count === 0) {
    if (!canLinkAnyProvider()) {
      console.log(chalk.yellow("No accounts linked. Add Plaid and/or Bridge credentials via 'ray setup', then run 'ray link'.\n"));
      return;
    }
    console.log(chalk.yellow("No accounts linked yet. Let's connect one first.\n"));
    const { runLink } = await import("./commands.js");
    await runLink();

    const recheck = db.prepare("SELECT COUNT(*) as count FROM accounts").get() as { count: number };
    if (recheck.count === 0) {
      console.log(chalk.red("\nNo accounts linked. Run 'ray link' when you're ready.\n"));
      return;
    }
  }

  // Fire onboarding if context is empty
  let onboardingPrompt: string | undefined;
  if (isContextEmpty()) {
    console.log(chalk.yellowBright("Welcome! Let me review your accounts and help set up your financial profile.\n"));
    onboardingPrompt = "I just connected my financial accounts. Help me set up my financial profile.";
  }

  const { runChatApp } = await import("./ink/mount.js");
  await runChatApp({ db, onboardingPrompt });
}
