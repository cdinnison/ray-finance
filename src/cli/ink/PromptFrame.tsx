import { Box, Text, useStdout } from "ink";
import chalk from "chalk";
import { TextInput } from "./TextInput.js";
import type { TextBuffer } from "./hooks/useTextInput.js";

interface Props {
  buffer: TextBuffer;
  footerText: string;
  showCaret: boolean;
  banner?: string;
}

/** Framed prompt: top rule, input area, bottom rule, footer, optional banner below. */
export function PromptFrame({ buffer, footerText, showCaret, banner }: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns || 80;
  const rule = chalk.dim("─".repeat(cols));

  return (
    <Box flexDirection="column">
      <Text>{rule}</Text>
      <TextInput buffer={buffer} prompt={chalk.dim("❯ ")} showCaret={showCaret} />
      <Text>{rule}</Text>
      <Text>{chalk.dim(`  ${footerText}`)}</Text>
      {banner ? <Text>{banner}</Text> : null}
    </Box>
  );
}
