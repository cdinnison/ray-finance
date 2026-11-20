import { config } from "../config.js";
import { readContext } from "./context.js";

interface RedactionEntry {
  real: string;
  token: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTermRegex(term: string): RegExp {
  const escaped = escapeRegExp(term);
  const startBoundary = /^\w/.test(term) ? "\\b" : "";
  const endBoundary = /\w$/.test(term) ? "\\b" : "";
  return new RegExp(`${startBoundary}${escaped}${endBoundary}`, "gi");
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
    // Extract names from ## Family section (distinct token per person so unredact is lossless)
    const familyMatch = context.match(/## Family\n([\s\S]*?)(?=\n##|$)/);
    if (familyMatch) {
      const lines = familyMatch[1].split("\n").filter(l => l.trim().startsWith("-"));
      let familyIndex = 0;
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
            familyIndex++;
            const fullToken = familyIndex === 1 ? "[PARTNER]" : `[FAMILY_${familyIndex}]`;
            const firstToken = familyIndex === 1 ? "[PARTNER_FIRST]" : `[FAMILY_${familyIndex}_FIRST]`;
            add(name, fullToken);
            const nameParts = name.split(/\s+/);
            if (nameParts.length > 1) {
              add(nameParts[0], firstToken);
            }
          }
        }
      }
    }

    // Extract employer from ## Income section
    const incomeMatch = context.match(/## Income\n([\s\S]*?)(?=\n##|$)/);
    if (incomeMatch) {
      const lines = incomeMatch[1].split("\n").filter(l => l.trim().startsWith("-"));
      let employerIndex = 0;
      for (const line of lines) {
        const text = line.replace(/^-\s*/, "").trim();
        if (!text || text.startsWith("(")) continue;
        // Match patterns like "Employer: Acme Corp", "Salary from Acme Corp", "$85k/year from Acme Corp"
        const employerMatch = text.match(/(?:employer|works? (?:at|for)|employed (?:at|by))[:\s]+([A-Z][\w\s&.,-]+?)(?:\s*[-–—|,;(\n]|$)/i)
          || text.match(/\bfrom ([A-Z][A-Za-z\s&.,-]+?)(?:\s*[-–—|,;(\n]|$)/)
          || text.match(/\bat ([A-Z][A-Za-z\s&.,-]+?)(?:\s*[-–—|,;(\n]|$)/);
        if (employerMatch) {
          employerIndex++;
          const empToken = employerIndex === 1 ? "[EMPLOYER]" : `[EMPLOYER_${employerIndex}]`;
          add(employerMatch[1].trim(), empToken);
        }
      }
    }
  }

  // Sort longest first so "John Smith" is replaced before "John"
  entries.sort((a, b) => b.real.length - a.real.length);
  return entries;
}

// Patterns for structured/numeric PII that should never reach the API
const NUMERIC_PII_PATTERNS: [RegExp, string][] = [
  [/\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/g, "[IBAN]"],             // IBAN (EU/international)
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]"],    // Email addresses
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],                                   // SSN: 123-45-6789
  [/\b\d{9}\b(?=\s|$|[,.])/g, "[SSN]"],                                  // SSN without dashes
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[CARD]"],             // 16-digit credit card
  [/\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b/g, "[CARD]"],                   // 15-digit Amex card
  [/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g, "[PHONE]"], // Phone numbers
  [/\b\d{9,12}\b(?=\s|$|[,.])/g, "[ACCT]"],                              // Account/routing numbers
];

export function redact(text: string): string {
  const redactions = buildRedactions();
  let result = text;
  for (const { real, token } of redactions) {
    result = result.replace(buildTermRegex(real), token);
  }
  // Redact numeric/structured PII patterns
  for (const [pattern, replacement] of NUMERIC_PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function unredact(text: string): string {
  const redactions = buildRedactions();
  let result = text;
  // Reverse: replace tokens with real values (longest tokens first to avoid partial matches)
  const byTokenLength = [...redactions].sort((a, b) => b.token.length - a.token.length);
  for (const { real, token } of byTokenLength) {
    result = result.replaceAll(token, real);
  }
  return result;
}
