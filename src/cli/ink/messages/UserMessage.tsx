import { Text, useStdout } from "ink";

/** Gray-background, full-width echo of a submitted user message. */
export function UserMessage({ text }: { text: string }) {
  const { stdout } = useStdout();
  const cols = stdout?.columns || 80;
  const line = `❯ ${text}`;
  const pad = Math.max(0, cols - visibleLength(line));
  return <Text backgroundColor="gray" color="white">{line + " ".repeat(pad)}</Text>;
}

function visibleLength(s: string): number {
  // Rough approximation — ignores combining characters and wide glyphs.
  // Ink pads within its own width calc so this is only for right-edge filler.
  return [...s].length;
}
