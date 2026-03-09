import { config } from "../config.js";
import { readContext } from "./context.js";

interface RedactionEntry {
  real: string;
  token: string;
}

/**
 * Builds a list of PII terms to redact from outbound API calls.
 * Extracts: user name, family/partner names, employer names from context.
 */
function buildRedactions(): RedactionEntry[] {
  const entries: RedactionEntry[] = [];
  const seen = new Set<string>();

  function add(real: string, token: string) {
    const trimmed = real.trim();
    if (trimmed.length < 2 || seen.has(trimmed.toLowerCase())) return;
    seen.add(trimmed.toLowerCase());
    entries.push({ real: trimmed, token });
  }

  // User's name (and first name if multi-word)
  const userName = config.userName;
  if (userName && userName !== "User") {
    add(userName, "[USER]");
    const parts = userName.split(/\s+/);
    if (parts.length > 1) {
      add(parts[0], "[USER_FIRST]");
      add(parts[parts.length - 1], "[USER_LAST]");
    }
  }

  // Parse context.md for family and employer names
  const context = readContext();
  if (context) {
    // Extract names from ## Family section
    const familyMatch = context.match(/## Family\n([\s\S]*?)(?=\n##|$)/);
    if (familyMatch) {
      const lines = familyMatch[1].split("\n").filter(l => l.trim().startsWith("-"));
      for (const line of lines) {
        const text = line.replace(/^-\s*/, "").trim();
        // Skip the user's own name and placeholder lines
        if (!text || text.startsWith("(") || text.toLowerCase() === userName.toLowerCase()) continue;
        // Extract name — could be "Partner: Jane" or "Jane (wife)" or just "Jane Smith"
        const nameMatch = text.match(/^(?:partner|spouse|wife|husband|child|kid|son|daughter|dependent)[:\s]+(.+)/i)
          || text.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)*)/);
        if (nameMatch) {
          const name = nameMatch[1].replace(/\s*\(.*\)/, "").trim();
          if (name && name.toLowerCase() !== userName.toLowerCase()) {
            add(name, "[PARTNER]");
            const nameParts = name.split(/\s+/);
            if (nameParts.length > 1) {
              add(nameParts[0], "[PARTNER_FIRST]");
            }
          }
        }
      }
    }

    // Extract employer from ## Income section
    const incomeMatch = context.match(/## Income\n([\s\S]*?)(?=\n##|$)/);
    if (incomeMatch) {
      const lines = incomeMatch[1].split("\n").filter(l => l.trim().startsWith("-"));
      for (const line of lines) {
        const text = line.replace(/^-\s*/, "").trim();
        if (!text || text.startsWith("(")) continue;
        // Match patterns like "Employer: Acme Corp", "Salary from Acme Corp", "$85k/year from Acme Corp"
        const employerMatch = text.match(/(?:employer|works? (?:at|for)|employed (?:at|by))[:\s]+([A-Z][\w\s&.,-]+?)(?:\s*[-–—|,;(\n]|$)/i)
          || text.match(/\bfrom ([A-Z][A-Za-z\s&.,-]+?)(?:\s*[-–—|,;(\n]|$)/)
          || text.match(/\bat ([A-Z][A-Za-z\s&.,-]+?)(?:\s*[-–—|,;(\n]|$)/);
        if (employerMatch) {
          add(employerMatch[1].trim(), "[EMPLOYER]");
        }
      }
    }
  }

  // Sort longest first so "John Smith" is replaced before "John"
  entries.sort((a, b) => b.real.length - a.real.length);
  return entries;
}

// Patterns for numeric PII that should never reach the API
const NUMERIC_PII_PATTERNS: [RegExp, string][] = [
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],           // SSN: 123-45-6789
  [/\b\d{9}\b(?=\s|$|[,.])/g, "[SSN]"],           // SSN without dashes
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[CARD]"], // Credit card
  [/\b\d{9,12}\b(?=\s|$|[,.])/g, "[ACCT]"],       // Account/routing numbers
];

export function redact(text: string): string {
  const redactions = buildRedactions();
  let result = text;
  for (const { real, token } of redactions) {
    result = result.replaceAll(real, token);
  }
  // Redact numeric PII patterns
  for (const [pattern, replacement] of NUMERIC_PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function unredact(text: string): string {
  const redactions = buildRedactions();
  let result = text;
  // Reverse: replace tokens with real values (shortest tokens last to avoid partial matches)
  for (const { real, token } of redactions) {
    result = result.replaceAll(token, real);
  }
  return result;
}
