import { describe, it, expect } from "vitest";
import { parseScheduleTime, escapeXml, shellSingleQuote, buildCronLine, buildLaunchdPlist } from "./scheduler.js";

describe("scheduler hardening", () => {
  it("parses valid 24-hour HH:MM schedule times", () => {
    expect(parseScheduleTime("06:00")).toEqual({ hour: 6, minute: 0 });
    expect(parseScheduleTime("23:59")).toEqual({ hour: 23, minute: 59 });
    expect(parseScheduleTime("0:05")).toEqual({ hour: 0, minute: 5 });
  });

  it("rejects out-of-range or malformed schedule times", () => {
    expect(() => parseScheduleTime("24:00")).toThrow(/Invalid sync schedule/);
    expect(() => parseScheduleTime("12:60")).toThrow(/Invalid sync schedule/);
    expect(() => parseScheduleTime("-1:00")).toThrow(/Invalid sync schedule/);
    expect(() => parseScheduleTime("06:00; id")).toThrow(/Invalid sync schedule/);
    expect(() => parseScheduleTime("not-a-time")).toThrow(/Invalid sync schedule/);
  });

  it("single-quotes paths in cron lines and rejects newlines", () => {
    expect(shellSingleQuote("/path/with spaces/$(id)'s/ray")).toBe("'/path/with spaces/$(id)'\\''s/ray'");
    const line = buildCronLine("/Users/o'reilly/bin/ray", "/Users/o'reilly/.ray/sync.log", 6, 30);
    expect(line).toBe("30 6 * * * '/Users/o'\\''reilly/bin/ray' sync >> '/Users/o'\\''reilly/.ray/sync.log' 2>&1 # ray-finance daily sync");
    expect(() => buildCronLine("/bin/ray\n* * * * * id", "/tmp/sync.log", 6, 0)).toThrow(/newline/i);
  });

  it("escapes XML special characters in launchd plists", () => {
    expect(escapeXml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
    const plist = buildLaunchdPlist("/Users/a&b/<ray>", "/Users/a&b/.ray/sync.log", 6, 15);
    expect(plist).toContain("<string>/Users/a&amp;b/&lt;ray&gt;</string>");
    expect(plist).toContain("<string>/Users/a&amp;b/.ray/sync.log</string>");
    expect(plist).toContain("<integer>6</integer>");
    expect(plist).toContain("<integer>15</integer>");
  });
});
