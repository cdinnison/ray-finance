import { describe, it, expect } from "vitest";
import { generateCompletionScript } from "./completions.js";

describe("generateCompletionScript", () => {
  it("includes import-apple in zsh command and file completion output", () => {
    const script = generateCompletionScript("zsh");
    expect(script).toContain("'import-apple:Import Apple Card transactions from a CSV export'");
    expect(script).toContain("export|import|import-apple)");
  });

  it("includes import-apple in bash command and file completion output", () => {
    const script = generateCompletionScript("bash");
    expect(script).toContain("import-apple");
    expect(script).toContain("export|import|import-apple)");
  });

  it("includes import-apple in fish command and file completion output", () => {
    const script = generateCompletionScript("fish");
    expect(script).toContain("complete -c ray -n '__fish_use_subcommand' -a 'import-apple'");
    expect(script).toContain("complete -c ray -n '__fish_seen_subcommand_from import-apple' -F");
  });
});
