import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

const CONTEXT_PATH = resolve(homedir(), ".ray", "context.md");

export function getContextPath(): string {
  return CONTEXT_PATH;
}

export function readContext(): string {
  if (!existsSync(CONTEXT_PATH)) return "";
  try {
    return readFileSync(CONTEXT_PATH, "utf-8");
  } catch {
    return "";
  }
}

export function writeContext(content: string): void {
  const dir = resolve(homedir(), ".ray");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONTEXT_PATH, content, { encoding: "utf-8", mode: 0o600 });
  try { chmodSync(CONTEXT_PATH, 0o600); } catch {}
}

export function isContextEmpty(): boolean {
  const content = readContext();
  if (!content || content.trim().length === 0) return true;
  // Check if it still has placeholder text (template hasn't been filled)
  const placeholders = ["(Add income sources", "(Linked accounts will appear", "(Add financial goals", "(Add current financial strategy", "(Log important financial decisions", "(Track action items"];
  const filledSections = placeholders.filter(p => !content.includes(p)).length;
  // Consider empty if most sections still have placeholder text
  return filledSections < 2;
}

export function replaceContextSection(section: string, content: string): void {
  let current = readContext();
  if (!current) {
    writeContext(`## ${section}\n${content}\n`);
    return;
  }

  const sectionHeader = `## ${section}`;
  const sectionIdx = current.indexOf(sectionHeader);

  if (sectionIdx !== -1) {
    // Find the next ## heading after this section
    const afterHeader = sectionIdx + sectionHeader.length;
    const nextSectionIdx = current.indexOf("\n## ", afterHeader);
    const before = current.slice(0, afterHeader);
    const after = nextSectionIdx !== -1 ? current.slice(nextSectionIdx) : "";
    current = `${before}\n${content}\n${after}`;
  } else {
    // Insert before ## Open Items if it exists, otherwise append
    const openItemsIdx = current.indexOf("## Open Items");
    if (openItemsIdx !== -1) {
      current = `${current.slice(0, openItemsIdx)}${sectionHeader}\n${content}\n\n${current.slice(openItemsIdx)}`;
    } else {
      current = `${current.trimEnd()}\n\n${sectionHeader}\n${content}\n`;
    }
  }

  writeContext(current);
}

export function createContextTemplate(userName: string): void {
  if (existsSync(CONTEXT_PATH)) return; // don't overwrite existing

  const template = `# Financial Context for ${userName}

## Family
- ${userName}

## Income
- (Add income sources and amounts)

## Accounts
- (Linked accounts will appear after syncing)

## Goals
- (Add financial goals)

## Strategy
- (Add current financial strategy and priorities)

## Key Decisions
- (Log important financial decisions here)

## Open Items
- (Track action items and follow-ups)
`;
  writeContext(template);
}
