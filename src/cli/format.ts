import chalk from "chalk";
import { formatCurrencyAmount } from "../currency.js";

// ─── Color Palette ─── //

export const colors = {
  money: {
    positive: (t: string) => chalk.green(t),
    negative: (t: string) => chalk.red(t),
  },
  accent: (t: string) => chalk.cyan(t),
  muted: (t: string) => chalk.dim(t),
  error: (t: string) => chalk.red(t),
  success: (t: string) => chalk.green(t),
  warning: (t: string) => chalk.yellow(t),
  info: (t: string) => chalk.blue(t),
};

// ─── Number & Duration Formatting ─── //

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 1) return "< 1s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

// ─── Error Display ─── //

const ERROR_MAP: Record<string, { msg: string; action: string }> = {
  "401": { msg: "Invalid API key.", action: "Run `ray setup` to reconfigure your credentials." },
  "403": { msg: "API key rejected.", action: "Run `ray billing` to check status, or `ray setup` to reconfigure." },
  "429": { msg: "Rate limited.", action: "Wait a moment and try again." },
  network: { msg: "Could not reach the server.", action: "Check your internet connection." },
  plaid: { msg: "Bank connection issue.", action: "Run `ray link` to reconnect." },
  decrypt: { msg: "Could not decrypt your data.", action: "Check your encryption key in `ray setup`." },
};

export function formatError(error: any, context?: string): string {
  let key = "unknown";
  if (error.status) key = String(error.status);
  else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") key = "network";
  else if (error.message?.includes("Plaid") || error.message?.includes("plaid")) key = "plaid";
  else if (error.message?.includes("decrypt")) key = "decrypt";

  const mapped = ERROR_MAP[key];
  if (mapped) {
    return `${chalk.red("✗")} ${mapped.msg} ${chalk.dim(mapped.action)}`;
  }
  const safeMsg = error.message || "Something went wrong.";
  return `${chalk.red("✗")} ${context ? context + ": " : ""}${safeMsg}`;
}

// ─── Money Formatting ─── //

export function formatMoney(n: number): string {
  const formatted = formatCurrencyAmount(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return chalk.red("-" + formatted);
  return formatted;
}

export function formatMoneyColored(n: number, invert = false): string {
  const formatted = formatMoney(n);
  if (invert) return n <= 0 ? chalk.green(formatted) : chalk.red(formatted);
  return n >= 0 ? chalk.green(formatted) : chalk.red(formatted);
}

export function progressBar(pct: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const color = pct > 100 ? chalk.red : pct > 80 ? chalk.yellow : chalk.green;
  return color("█".repeat(filled)) + chalk.gray("░".repeat(empty)) + ` ${Math.round(pct)}%`;
}

export function heading(text: string): string {
  return chalk.bold.underline(text);
}

export function dim(text: string): string {
  return chalk.dim(text);
}

export function padColumns(rows: [string, string][], gap = 2): string {
  const maxLeft = Math.max(...rows.map(r => stripAnsi(r[0]).length));
  return rows.map(([left, right]) => {
    const pad = maxLeft - stripAnsi(left).length + gap;
    return left + " ".repeat(pad) + right;
  }).join("\n");
}

// Strip ANSI escape codes for length calculation
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── CLI Banner ─── //

const BLOCK_CHARS = "░▒▓█";

function noiseRow(width: number, seed: number): string {
  let row = "";
  for (let i = 0; i < width; i++) {
    const v = Math.abs(Math.sin(seed * 9301 + i * 4973 + 1997)) * BLOCK_CHARS.length;
    row += BLOCK_CHARS[Math.min(Math.floor(v), BLOCK_CHARS.length - 1)];
  }
  return row;
}

const LOGO_LINES = [
  "▌▙▀▖▝▀▖▌ ▌▐",
  "▌▌  ▞▀▌▝▀▌▐",
  "▌▘  ▝▀▘▗▄▘▐",
];

function blendLogoRow(noise: string, logoLine: string, offset: number): string {
  const chars = noise.split("");
  for (let i = 0; i < logoLine.length; i++) {
    chars[offset + i] = logoLine[i];
  }
  return chars.join("");
}

function box(label: string, lines: string[]): string {
  const cols = process.stdout.columns || 100;
  const inner = cols - 4;
  const top = `┌─── ${label} ${"─".repeat(Math.max(0, inner - label.length - 5))}┐`;
  const bot = `└${"─".repeat(inner + 2)}┘`;
  const pad = `│${" ".repeat(inner + 2)}│`;
  const body = lines.map((l) => {
    const vis = stripAnsi(l).length;
    return `│  ${l}${" ".repeat(Math.max(0, inner - vis))}│`;
  });
  return [top, pad, ...body, pad, bot].join("\n");
}

export function banner(): string {
  const cols = process.stdout.columns || 100;
  const width = Math.min(cols, 120);

  // Generate noise rows with logo blended in
  const logoWidth = LOGO_LINES[0].length;
  const logoOffset = 1; // left-aligned with small indent
  const headerLines: string[] = [];

  // 1 noise row above logo
  headerLines.push(chalk.dim(noiseRow(width, 0)));

  // 3 rows with logo blended
  for (let i = 0; i < LOGO_LINES.length; i++) {
    const noise = noiseRow(width, i + 1);
    const blended = blendLogoRow(noise, LOGO_LINES[i], logoOffset);
    // Color the logo portion bold white, rest dim
    const before = chalk.dim(blended.slice(0, logoOffset));
    const logoLine = LOGO_LINES[i];
    const logo = chalk.black(logoLine[0]) + chalk.bold.white(logoLine.slice(1, -1)) + chalk.black(logoLine[logoLine.length - 1]);
    const after = chalk.dim(blended.slice(logoOffset + logoWidth));
    headerLines.push(before + logo + after);
  }

  // 1 noise row below logo
  headerLines.push(chalk.dim(noiseRow(width, LOGO_LINES.length + 1)));

  return headerLines.join("\n");
}

export function helpScreen(
  commands: { name: string; desc: string }[],
): string {
  const sections: string[] = [];

  sections.push(banner());
  sections.push("");

  sections.push(box("Usage", [
    "ray <command> [OPTIONS]",
    "ray                       Start chat session",
  ]));
  sections.push("");

  const nameWidth = Math.max(...commands.map((c) => c.name.length));
  const cmdLines = commands.map(
    (c) => `${chalk.white(c.name.padEnd(nameWidth))}    ${chalk.dim(c.desc)}`,
  );
  sections.push(box("Commands", cmdLines));
  sections.push("");

  sections.push(box("Options", [
    `${chalk.white("--version".padEnd(nameWidth))}    ${chalk.dim("Show the version and exit")}`,
    `${chalk.white("--help".padEnd(nameWidth))}    ${chalk.dim("Show this help screen")}`,
  ]));
  sections.push("");

  sections.push(chalk.dim(DISCLAIMER));

  return sections.join("\n");
}

/** Colorize AI response text for the terminal */
export function formatResponse(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // Section headers: ## Header or ### Header
      if (/^#{1,3}\s+/.test(line)) {
        return chalk.bold(line.replace(/^#{1,3}\s+/, ""));
      }

      // Bold: **text**
      line = line.replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold(t));

      // Money amounts: $1,234.56 or 1 234,56 € or 1,234 EUR
      line = line.replace(
        /[+-]?(?:(?:[$€£])\s?[\d.,\u00A0\u202F]+|[\d.,\u00A0\u202F]+\s?(?:[$€£]|USD|EUR|GBP|CHF|CAD|AUD|JPY))/g,
        (m) => {
          return m.startsWith("-") ? chalk.red(m) : chalk.green(m);
        },
      );

      // Inline code
      line = line.replace(/`([^`]+)`/g, (_, t) => {
        return chalk.cyan(t);
      });

      // Percentages
      line = line.replace(/(\d+(?:\.\d+)?%)/g, (m) => chalk.yellow(m));

      // Bullet points
      if (/^\s*[-•]\s/.test(line)) {
        line = line.replace(/^(\s*)([-•])(\s)/, (_, sp, b, s) => sp + chalk.dim(b) + s);
      }

      return line;
    })
    .join("\n");
}

export const DISCLAIMER =
  "Ray is an AI tool, not a licensed financial advisor. Output is informational, " +
  "may be inaccurate, and does not constitute financial advice.";

// ─── Institution Logo Rendering ─── //

/** Render a base64-encoded PNG as compact ANSI art (3 rows) */
export async function renderLogo(base64: string): Promise<string> {
  try {
    const terminalImage = (await import("terminal-image")).default;
    const buffer = Buffer.from(base64, "base64");
    const rendered = await terminalImage.buffer(buffer, { height: 1, preserveAspectRatio: true });
    return rendered.trimEnd();
  } catch {
    return "";
  }
}

/** Color an institution name using its Plaid primary_color */
export function institutionName(name: string, primaryColor: string | null): string {
  if (primaryColor) {
    try {
      return chalk.hex(primaryColor).bold(name);
    } catch {}
  }
  return chalk.bold(name);
}
