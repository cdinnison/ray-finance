import chalk from "chalk";
import { canLinkAnyProvider, config } from "../config.js";
import { banner, DISCLAIMER, formatResponse, formatDuration, formatError } from "./format.js";
import type { ProgressCallback } from "../ai/agent.js";

/** Raw-mode line reader that renders content below the cursor while waiting for input */
function rawReadLine(prompt: string, belowLines: string[]): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    let cursor = 0; // cursor position within buf
    const out = process.stdout;
    const promptLen = stripAnsi(prompt).length;

    // Redraws the buffer from the prompt onward and repositions the cursor
    const redraw = () => {
      out.write("\r" + prompt + buf + "\x1b[K"); // clear to end of line
      // Move cursor back to the correct position
      const back = buf.length - cursor;
      if (back > 0) out.write(`\x1b[${back}D`);
    };

    // Find the start of the previous word boundary
    const wordLeft = () => {
      let p = cursor;
      while (p > 0 && buf[p - 1] === " ") p--;       // skip trailing spaces
      while (p > 0 && buf[p - 1] !== " ") p--;        // skip word chars
      return p;
    };

    // Find the end of the next word boundary
    const wordRight = () => {
      let p = cursor;
      while (p < buf.length && buf[p] !== " ") p++;   // skip word chars
      while (p < buf.length && buf[p] === " ") p++;    // skip trailing spaces
      return p;
    };

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

        // Ctrl+A — beginning of line
        if (code === 1) {
          if (cursor > 0) { out.write(`\x1b[${cursor}D`); cursor = 0; }
          continue;
        }

        // Ctrl+E — end of line
        if (code === 5) {
          if (cursor < buf.length) { out.write(`\x1b[${buf.length - cursor}C`); cursor = buf.length; }
          continue;
        }

        // Ctrl+K — delete from cursor to end of line
        if (code === 11) {
          buf = buf.slice(0, cursor);
          out.write("\x1b[K");
          continue;
        }

        // Ctrl+U — delete from cursor to beginning of line
        if (code === 21) {
          buf = buf.slice(cursor);
          cursor = 0;
          redraw();
          continue;
        }

        // Ctrl+W — delete word backward
        if (code === 23) {
          if (cursor > 0) {
            const target = wordLeft();
            buf = buf.slice(0, target) + buf.slice(cursor);
            cursor = target;
            redraw();
          }
          continue;
        }

        // Enter
        if (code === 13) {
          cleanup();
          // Move cursor to end of buf first
          if (cursor < buf.length) out.write(`\x1b[${buf.length - cursor}C`);
          // Move past the below-content lines, then newline
          for (let j = 0; j < belowLines.length; j++) out.write("\x1b[1B");
          out.write("\n");
          resolve(buf);
          return;
        }

        // Backspace
        if (code === 127 || code === 8) {
          if (cursor > 0) {
            buf = buf.slice(0, cursor - 1) + buf.slice(cursor);
            cursor--;
            redraw();
          }
          continue;
        }

        // Escape sequences (arrow keys, Option+key, etc.)
        if (code === 27) {
          // Option+Backspace — ESC followed by DEL (0x7f)
          if (i + 1 < chunk.length && chunk.charCodeAt(i + 1) === 127) {
            i++; // consume the DEL
            if (cursor > 0) {
              const target = wordLeft();
              buf = buf.slice(0, target) + buf.slice(cursor);
              cursor = target;
              redraw();
            }
            continue;
          }

          // Option+b / Option+f — ESC followed by 'b' or 'f'
          if (i + 1 < chunk.length && chunk[i + 1] === "b") {
            i++;
            const target = wordLeft();
            if (target < cursor) { out.write(`\x1b[${cursor - target}D`); cursor = target; }
            continue;
          }
          if (i + 1 < chunk.length && chunk[i + 1] === "f") {
            i++;
            const target = wordRight();
            if (target > cursor) { out.write(`\x1b[${target - cursor}C`); cursor = target; }
            continue;
          }

          if (i + 1 < chunk.length && chunk[i + 1] === "[") {
            i += 2; // skip past ESC [
            // Collect any intermediate bytes (modifiers like "1;3")
            let seq = "";
            while (i < chunk.length && chunk.charCodeAt(i) < 64) {
              seq += chunk[i];
              i++;
            }
            if (i < chunk.length) {
              const final = chunk[i];
              // Modifier keys: ;3 = Option, ;5 = Ctrl, ;9 = Cmd (Kitty protocol)
              const isWordMod = seq === "1;3" || seq === "1;5" || seq === "1;9";
              const isCmd = seq === "1;9";

              if (final === "D") {
                if (isWordMod) {
                  // Option/Ctrl/Cmd+Left — word backward
                  const target = wordLeft();
                  if (target < cursor) { out.write(`\x1b[${cursor - target}D`); cursor = target; }
                } else if (cursor > 0) {
                  cursor--; out.write("\x1b[D");
                }
              } else if (final === "C") {
                if (isWordMod) {
                  // Option/Ctrl/Cmd+Right — word forward
                  const target = wordRight();
                  if (target > cursor) { out.write(`\x1b[${target - cursor}C`); cursor = target; }
                } else if (cursor < buf.length) {
                  cursor++; out.write("\x1b[C");
                }
              } else if (final === "H") {
                // Home
                if (cursor > 0) { out.write(`\x1b[${cursor}D`); cursor = 0; }
              } else if (final === "F") {
                // End
                if (cursor < buf.length) { out.write(`\x1b[${buf.length - cursor}C`); cursor = buf.length; }
              } else if (final === "u") {
                // Kitty keyboard protocol: ESC [ codepoint ; modifier u
                const parts = seq.split(";");
                const codepoint = parseInt(parts[0], 10);
                const mod = parts.length > 1 ? parseInt(parts[1], 10) : 1;
                const hasCmd = (mod - 1) & 8;   // super/cmd bit
                const hasCtrl = (mod - 1) & 4;  // ctrl bit

                if (codepoint === 127 && (hasCmd || hasCtrl)) {
                  // Cmd+Backspace / Ctrl+Backspace — delete to line start
                  if (cursor > 0) {
                    buf = buf.slice(cursor);
                    cursor = 0;
                    redraw();
                  }
                }
              }
              // Ignore other sequences (up/down, etc.)
            }
          }
          continue;
        }

        // Printable characters
        if (code >= 32) {
          buf = buf.slice(0, cursor) + chunk[i] + buf.slice(cursor);
          cursor++;
          redraw();
        }
      }
    };

    process.stdin.on("data", onData);
  });
}

/** Strip ANSI escape codes to get visible length */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
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
    if (!canLinkAnyProvider()) {
      console.log(chalk.yellow("No accounts linked. Add Plaid and/or Bridge credentials via 'ray setup', then run 'ray link'.\n"));
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
      console.log(`\n${formatResponse(response)}\n`);
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
