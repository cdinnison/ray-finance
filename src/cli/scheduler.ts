import { platform, homedir } from "os";
import { resolve, dirname } from "path";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, chmodSync, openSync, closeSync } from "fs";
import { execFileSync } from "child_process";

const PLIST_LABEL = "com.ray-finance.daily-sync";
const CRON_MARKER = "# ray-finance daily sync";

export function parseScheduleTime(time: string): { hour: number; minute: number } {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) {
    throw new Error(`Invalid sync schedule "${time}". Expected HH:MM in 24-hour format (00:00–23:59).`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function getPlistPath(): string {
  return resolve(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);
}

function ensurePrivateLogFile(): string {
  const rayDir = resolve(homedir(), ".ray");
  if (!existsSync(rayDir)) mkdirSync(rayDir, { recursive: true, mode: 0o700 });
  try { chmodSync(rayDir, 0o700); } catch {}
  const logPath = resolve(rayDir, "sync.log");
  try {
    const fd = openSync(logPath, "a", 0o600);
    closeSync(fd);
    chmodSync(logPath, 0o600);
  } catch {}
  return logPath;
}

function getRayBin(): string {
  // Use the installed `ray` binary if available, otherwise fall back to npx
  try {
    const resolved = execFileSync("which", ["ray"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (resolved) return resolved;
  } catch {}
  return resolve(dirname(process.execPath), "npx");
}

export function buildLaunchdPlist(rayBin: string, logPath: string, hour: number, minute: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${PLIST_LABEL}</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${escapeXml(rayBin)}</string>
\t\t<string>sync</string>
\t</array>
\t<key>StartCalendarInterval</key>
\t<dict>
\t\t<key>Hour</key>
\t\t<integer>${hour}</integer>
\t\t<key>Minute</key>
\t\t<integer>${minute}</integer>
\t</dict>
\t<key>StandardOutPath</key>
\t<string>${escapeXml(logPath)}</string>
\t<key>StandardErrorPath</key>
\t<string>${escapeXml(logPath)}</string>
</dict>
</plist>`;
}

export function buildCronLine(rayBin: string, logPath: string, hour: number, minute: number): string {
  if (/[\r\n\0]/.test(rayBin) || /[\r\n\0]/.test(logPath)) {
    throw new Error("Scheduler paths must not contain newline or NUL characters.");
  }
  return `${minute} ${hour} * * * ${shellSingleQuote(rayBin)} sync >> ${shellSingleQuote(logPath)} 2>&1 ${CRON_MARKER}`;
}

function installLaunchd(hour: number, minute: number): void {
  const rayBin = getRayBin();
  const logPath = ensurePrivateLogFile();
  const plist = buildLaunchdPlist(rayBin, logPath, hour, minute);

  const plistPath = getPlistPath();
  const dir = dirname(plistPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Unload existing if present
  if (existsSync(plistPath)) {
    try { execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" }); } catch {}
  }

  writeFileSync(plistPath, plist, { mode: 0o600 });
  try { chmodSync(plistPath, 0o600); } catch {}
  execFileSync("launchctl", ["load", plistPath], { stdio: "ignore" });
}

function uninstallLaunchd(): void {
  const plistPath = getPlistPath();
  if (existsSync(plistPath)) {
    try { execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" }); } catch {}
    unlinkSync(plistPath);
  }
}

function readCrontab(): string | null {
  try {
    return execFileSync("crontab", ["-l"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function writeCrontab(content: string): void {
  execFileSync("crontab", ["-"], { input: content, encoding: "utf-8", stdio: ["pipe", "ignore", "ignore"] });
}

function installCron(hour: number, minute: number): void {
  const rayBin = getRayBin();
  const logPath = ensurePrivateLogFile();
  const cronLine = buildCronLine(rayBin, logPath, hour, minute);

  // Remove existing ray cron entry, add new one safely via stdin (no shell interpolation)
  const existing = readCrontab();
  if (existing !== null) {
    const filtered = existing.split("\n").filter(l => !l.includes(CRON_MARKER)).join("\n").trimEnd();
    const updated = filtered ? `${filtered}\n${cronLine}\n` : `${cronLine}\n`;
    writeCrontab(updated);
  } else {
    writeCrontab(`${cronLine}\n`);
  }
}

function uninstallCron(): void {
  const existing = readCrontab();
  if (existing === null) return;
  const filtered = existing.split("\n").filter(l => !l.includes(CRON_MARKER)).join("\n").trimEnd();
  if (filtered) {
    writeCrontab(`${filtered}\n`);
  } else {
    try { execFileSync("crontab", ["-r"], { stdio: "ignore" }); } catch {}
  }
}

export function installSyncSchedule(time: string): void {
  const { hour, minute } = parseScheduleTime(time);

  if (platform() === "darwin") {
    installLaunchd(hour, minute);
  } else {
    installCron(hour, minute);
  }
}

export function uninstallSyncSchedule(): void {
  if (platform() === "darwin") {
    uninstallLaunchd();
  } else {
    uninstallCron();
  }
}
