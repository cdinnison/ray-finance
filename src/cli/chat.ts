import chalk from "chalk";
import { config } from "../config.js";
import { banner, DISCLAIMER, formatResponse, formatDuration, formatError } from "./format.js";
import type { ProgressCallback } from "../ai/agent.js";

/** Raw-mode line reader that renders content below the cursor while waiting for input */
function rawReadLine(prompt: string, belowLines: string[]): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    const out = process.stdout;

    // Render: prompt on current line, then content below, then move cursor back
    out.write(prompt);
    if (belowLines.length > 0) {
      out.write("\n" + belowLines.join("\n"));
      // Move cursor back up to the prompt line and to the end of prompt text
      out.write(`\x1b[${belowLines.length}A`);
      out.write("\r" + prompt);
    }

    process.stdin.setRawMode!(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const cleanup = () => {
      process.stdin.setRawMode!(false);
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
    };

    const onData = (chunk: string) => {
      for (let i = 0; i < chunk.length; i++) {
        const code = chunk.charCodeAt(i);

        // Ctrl+C / Ctrl+D
        if (code === 3 || code === 4) {
          cleanup();
          out.write("\n");
          resolve("\x03");
          return;
        }

        // Enter
        if (code === 13) {
          cleanup();
          // Move past the below-content lines, then newline
          for (let j = 0; j < belowLines.length; j++) out.write("\x1b[1B");
          out.write("\n");
          resolve(buf);
          return;
        }

        // Backspace
        if (code === 127 || code === 8) {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            out.write("\b \b");
          }
          continue;
        }

        // Skip escape sequences (arrow keys etc.)
        if (code === 27) {
          if (i + 1 < chunk.length && chunk[i + 1] === "[") {
            i += 2;
            while (i < chunk.length && chunk.charCodeAt(i) < 64) i++;
          }
          continue;
        }

        // Printable characters
        if (code >= 32) {
          buf += chunk[i];
          out.write(chunk[i]);
        }
      }
    };

    process.stdin.on("data", onData);
  });
}

const THINKING_PHRASES = [
  "Thinking...",
  "Crunching numbers...",
  "Reviewing your accounts...",
  "Analyzing...",
  "Looking into that...",
  "Pulling up your data...",
  "Checking the numbers...",
  "On it...",
];

function getThinkingText(): string {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
}

export async function startChat(): Promise<void> {
  const ora = (await import("ora")).default;
  const { getDb } = await import("../db/connection.js");
  const { handleMessage, TOOL_LABELS } = await import("../ai/agent.js");
  const { isContextEmpty } = await import("../ai/context.js");
  const { cliBriefing } = await import("../ai/insights.js");
  const db = getDb();

  // Show logo + briefing
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
    console.log(chalk.bold(`ray`) + chalk.dim(` — ${config.userName}`));
  }
  console.log("");

  // Require at least one linked account
  const hasAccounts = db.prepare("SELECT COUNT(*) as count FROM accounts").get() as { count: number };
  if (hasAccounts.count === 0) {
    if (!config.plaidClientId || !config.plaidSecret) {
      console.log(chalk.yellow("No accounts linked. Add Plaid credentials via 'ray setup', then run 'ray link'.\n"));
      return;
    }
    console.log(chalk.yellow("No accounts linked yet. Let's connect one first.\n"));
    const { runLink } = await import("./commands.js");
    await runLink();

    // Re-check after linking
    const recheck = db.prepare("SELECT COUNT(*) as count FROM accounts").get() as { count: number };
    if (recheck.count === 0) {
      console.log(chalk.red("\nNo accounts linked. Run 'ray link' when you're ready.\n"));
      return;
    }
  }

  // Auto-trigger onboarding for new users
  if (isContextEmpty()) {
    console.log(chalk.yellowBright("Welcome! Let me review your accounts and help set up your financial profile.\n"));
    const spinner = ora({ text: "Reviewing your accounts...", color: "yellow", discardStdin: false }).start();
    try {
      const response = await handleMessage(db, "I just connected my financial accounts. Help me set up my financial profile.");
      spinner.stop();
      console.log(`\n${response}\n`);
    } catch (err: any) {
      spinner.stop();
      console.error(formatError(err, "Onboarding error"));
    }
  }

  // Background re-sync for recently linked accounts (Plaid backfill can take hours)
  let bgSyncTimer: ReturnType<typeof setInterval> | null = null;
  const oldestAccount = db.prepare(`SELECT MIN(created_at) as ts FROM institutions`).get() as { ts: string | null };
  if (oldestAccount?.ts) {
    const ageMs = Date.now() - new Date(oldestAccount.ts + "Z").getTime();
    if (ageMs < 6 * 60 * 60 * 1000) { // linked within last 6 hours
      const { runDailySync } = await import("../daily-sync.js");
      bgSyncTimer = setInterval(async () => {
        // Silence all output during background sync
        const origWrite = process.stdout.write;
        const origErr = process.stderr.write;
        process.stdout.write = () => true;
        process.stderr.write = () => true;
        try { await runDailySync(db); } catch {}
        process.stdout.write = origWrite;
        process.stderr.write = origErr;
      }, 15 * 60 * 1000); // every 15 minutes
      bgSyncTimer.unref(); // don't prevent process exit
    }
  }

  const shutdown = () => {
    if (bgSyncTimer) clearInterval(bgSyncTimer);
    console.log(chalk.dim("\nGoodbye!"));
    process.exit(0);
  };

  const hints = [
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
  let hintIdx = Math.floor(Math.random() * hints.length);

  const getFooterText = () => {
    const lastSync = db.prepare(`SELECT MAX(updated_at) as ts FROM accounts`).get() as { ts: string | null };
    let syncStr = "";
    if (lastSync.ts) {
      const diffMs = Date.now() - new Date(lastSync.ts + "Z").getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) syncStr = "synced just now";
      else if (mins < 60) syncStr = `synced ${mins}m ago`;
      else if (mins < 1440) syncStr = `synced ${Math.floor(mins / 60)}h ago`;
      else syncStr = `synced ${Math.floor(mins / 1440)}d ago`;
    }
    const parts = ["ray"];
    if (syncStr) parts.push(syncStr);
    parts.push(hints[hintIdx]);
    parts.push("ctrl+c to exit");
    hintIdx = (hintIdx + 1) % hints.length;
    return parts.join("  ·  ");
  };

  while (true) {
    const cols = process.stdout.columns || 80;
    const rule = chalk.dim("─".repeat(cols));
    const footerText = chalk.dim(`  ${getFooterText()}`);

    // Ensure room below for top rule + prompt + bottom rule + footer (3 lines below start)
    process.stdout.write("\n\n\n");
    process.stdout.write("\x1b[3A\r");

    // Print top rule, then prompt with bottom rule + footer rendered below
    console.log(rule);
    const input = await rawReadLine(chalk.dim("❯ "), [rule, footerText]);

    const trimmed = input.trim();

    if (!trimmed) {
      // Clear the prompt frame (top rule + prompt + bottom rule + footer)
      process.stdout.write("\x1b[3A\r");
      for (let i = 0; i < 4; i++) process.stdout.write("\x1b[2K\x1b[1B");
      process.stdout.write("\x1b[4A\r");
      continue;
    }

    // Replace prompt frame with gray-background user message
    // Move up 4 lines (footer, bottom rule, prompt, top rule) and clear them
    process.stdout.write("\x1b[4A\r");
    for (let i = 0; i < 4; i++) process.stdout.write("\x1b[2K\x1b[1B");
    process.stdout.write("\x1b[4A\r");
    // Print user message with gray background, padded to full width
    const msgText = `❯ ${trimmed}`;
    const pad = Math.max(0, cols - msgText.length);
    console.log(chalk.bgGray.white(msgText + " ".repeat(pad)));
    if (trimmed === "\x03" || trimmed === "/quit" || trimmed === "/exit" || trimmed === "/q") {
      shutdown();
      break;
    }

    const spinner = ora({ text: getThinkingText(), color: "cyan", discardStdin: false }).start();

    const onProgress: ProgressCallback = ({ phase, toolName, toolCount, elapsedMs }) => {
      if (phase === "tool" && toolName) {
        const label = TOOL_LABELS[toolName] || toolName;
        spinner.text = `${label}... ${chalk.dim(`(${toolCount} ${toolCount === 1 ? "tool" : "tools"}, ${formatDuration(elapsedMs)})`)}`;
      } else if (phase === "responding" && toolCount > 0) {
        spinner.text = `Composing response... ${chalk.dim(`(${toolCount} tools, ${formatDuration(elapsedMs)})`)}`;
      }
    };

    try {
      const response = await handleMessage(db, trimmed, onProgress);
      spinner.stop();
      console.log(`\n${formatResponse(response)}\n`);
    } catch (err: any) {
      spinner.stop();
      console.error(formatError(err));
    }
  }
}
