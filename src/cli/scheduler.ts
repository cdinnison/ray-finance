import { platform } from "os";
import { resolve, dirname } from "path";
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";

const PLIST_LABEL = "com.ray-finance.daily-sync";

function getPlistPath(): string {
  return resolve(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);
}

function getRayBin(): string {
  // Use the installed `ray` binary if available, otherwise fall back to npx
  try {
    return execSync("which ray", { encoding: "utf-8" }).trim();
  } catch {
    return resolve(dirname(process.execPath), "npx");
  }
}

function installLaunchd(hour: number, minute: number): void {
  const rayBin = getRayBin();
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${PLIST_LABEL}</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${rayBin}</string>
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
\t<string>${resolve(homedir(), ".ray", "sync.log")}</string>
\t<key>StandardErrorPath</key>
\t<string>${resolve(homedir(), ".ray", "sync.log")}</string>
</dict>
</plist>`;

  const plistPath = getPlistPath();
  const dir = dirname(plistPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Unload existing if present
  if (existsSync(plistPath)) {
    try { execSync(`launchctl unload "${plistPath}" 2>/dev/null`); } catch {}
  }

  writeFileSync(plistPath, plist);
  execSync(`launchctl load "${plistPath}"`);
}

function uninstallLaunchd(): void {
  const plistPath = getPlistPath();
  if (existsSync(plistPath)) {
    try { execSync(`launchctl unload "${plistPath}" 2>/dev/null`); } catch {}
    unlinkSync(plistPath);
  }
}

const CRON_MARKER = "# ray-finance daily sync";

function installCron(hour: number, minute: number): void {
  const rayBin = getRayBin();
  const cronLine = `${minute} ${hour} * * * ${rayBin} sync >> ${resolve(homedir(), ".ray", "sync.log")} 2>&1 ${CRON_MARKER}`;

  // Remove existing ray cron entry, add new one
  try {
    const existing = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
    const filtered = existing.split("\n").filter(l => !l.includes(CRON_MARKER)).join("\n");
    const updated = filtered.trimEnd() + "\n" + cronLine + "\n";
    execSync(`echo ${JSON.stringify(updated)} | crontab -`);
  } catch {
    // No existing crontab
    execSync(`echo ${JSON.stringify(cronLine + "\n")} | crontab -`);
  }
}

function uninstallCron(): void {
  try {
    const existing = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
    const filtered = existing.split("\n").filter(l => !l.includes(CRON_MARKER)).join("\n").trimEnd();
    if (filtered) {
      execSync(`echo ${JSON.stringify(filtered + "\n")} | crontab -`);
    } else {
      execSync("crontab -r 2>/dev/null");
    }
  } catch {}
}

export function installSyncSchedule(time: string): void {
  const [hour, minute] = time.split(":").map(Number);

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
