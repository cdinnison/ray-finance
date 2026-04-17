import { Text } from "ink";
import type { TextBuffer } from "./hooks/useTextInput.js";

interface Props {
  buffer: TextBuffer;
  prompt: string;
  /** Render caret inverted on the current character. */
  showCaret: boolean;
}

/**
 * Renders a multiline text buffer with an inverted caret at the cursor position.
 * Prefixes the first line with `prompt`; continuation lines are indented to match.
 */
export function TextInput({ buffer, prompt, showCaret }: Props) {
  const plainPromptLen = stripAnsi(prompt).length;
  const indent = " ".repeat(plainPromptLen);

  return (
    <>
      {buffer.lines.map((line, row) => {
        const isCursorRow = showCaret && row === buffer.row;
        const prefix = row === 0 ? prompt : indent;
        if (!isCursorRow) {
          return (
            <Text key={row}>
              {prefix}
              {line || " "}
            </Text>
          );
        }
        const before = line.slice(0, buffer.col);
        const caretChar = buffer.col < line.length ? line[buffer.col] : " ";
        const after = buffer.col < line.length ? line.slice(buffer.col + 1) : "";
        return (
          <Text key={row}>
            {prefix}
            {before}
            <Text inverse>{caretChar}</Text>
            {after}
          </Text>
        );
      })}
    </>
  );
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
