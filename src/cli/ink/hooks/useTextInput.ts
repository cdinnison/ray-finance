import { useEffect, useRef, useState, useCallback } from "react";
import { useStdin } from "ink";

/** A multiline text buffer with a 2D cursor. */
export interface TextBuffer {
  lines: string[];
  row: number;
  col: number;
}

const EMPTY_BUFFER: TextBuffer = { lines: [""], row: 0, col: 0 };

/** Key bytes we care about. */
const CTRL_A = 1;
const CTRL_C = 3;
const CTRL_D = 4;
const CTRL_E = 5;
const CTRL_K = 11;
const CTRL_U = 21;
const CTRL_W = 23;
const ENTER = 13;
const BACKSPACE = 127;
const BACKSPACE_ALT = 8;
const ESC = 27;

function cloneBuf(b: TextBuffer): TextBuffer {
  return { lines: [...b.lines], row: b.row, col: b.col };
}

function wordLeft(line: string, col: number): number {
  let p = col;
  while (p > 0 && line[p - 1] === " ") p--;
  while (p > 0 && line[p - 1] !== " ") p--;
  return p;
}

function wordRight(line: string, col: number): number {
  let p = col;
  while (p < line.length && line[p] !== " ") p++;
  while (p < line.length && line[p] === " ") p++;
  return p;
}

function insertText(buf: TextBuffer, text: string): TextBuffer {
  const pieces = text.split("\n");
  const lines = [...buf.lines];
  const cur = lines[buf.row];
  const before = cur.slice(0, buf.col);
  const after = cur.slice(buf.col);

  if (pieces.length === 1) {
    lines[buf.row] = before + pieces[0] + after;
    return { lines, row: buf.row, col: buf.col + pieces[0].length };
  }

  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  const middle = pieces.slice(1, -1);
  const newLines = [
    ...lines.slice(0, buf.row),
    before + first,
    ...middle,
    last + after,
    ...lines.slice(buf.row + 1),
  ];
  return {
    lines: newLines,
    row: buf.row + pieces.length - 1,
    col: last.length,
  };
}

function backspace(buf: TextBuffer): TextBuffer {
  if (buf.col > 0) {
    const lines = [...buf.lines];
    const cur = lines[buf.row];
    lines[buf.row] = cur.slice(0, buf.col - 1) + cur.slice(buf.col);
    return { lines, row: buf.row, col: buf.col - 1 };
  }
  if (buf.row > 0) {
    const lines = [...buf.lines];
    const prev = lines[buf.row - 1];
    const cur = lines[buf.row];
    lines[buf.row - 1] = prev + cur;
    lines.splice(buf.row, 1);
    return { lines, row: buf.row - 1, col: prev.length };
  }
  return buf;
}

function deleteWordLeft(buf: TextBuffer): TextBuffer {
  const cur = buf.lines[buf.row];
  if (buf.col === 0) return backspace(buf);
  const target = wordLeft(cur, buf.col);
  const lines = [...buf.lines];
  lines[buf.row] = cur.slice(0, target) + cur.slice(buf.col);
  return { lines, row: buf.row, col: target };
}

function moveLeft(buf: TextBuffer): TextBuffer {
  if (buf.col > 0) return { ...buf, col: buf.col - 1 };
  if (buf.row > 0) {
    const prev = buf.lines[buf.row - 1];
    return { ...buf, row: buf.row - 1, col: prev.length };
  }
  return buf;
}

function moveRight(buf: TextBuffer): TextBuffer {
  const cur = buf.lines[buf.row];
  if (buf.col < cur.length) return { ...buf, col: buf.col + 1 };
  if (buf.row < buf.lines.length - 1) return { ...buf, row: buf.row + 1, col: 0 };
  return buf;
}

function moveUp(buf: TextBuffer): TextBuffer {
  if (buf.row === 0) return buf;
  const target = buf.lines[buf.row - 1];
  return { ...buf, row: buf.row - 1, col: Math.min(buf.col, target.length) };
}

function moveDown(buf: TextBuffer): TextBuffer {
  if (buf.row === buf.lines.length - 1) return buf;
  const target = buf.lines[buf.row + 1];
  return { ...buf, row: buf.row + 1, col: Math.min(buf.col, target.length) };
}

function moveWordLeft(buf: TextBuffer): TextBuffer {
  const cur = buf.lines[buf.row];
  if (buf.col === 0) return moveLeft(buf);
  return { ...buf, col: wordLeft(cur, buf.col) };
}

function moveWordRight(buf: TextBuffer): TextBuffer {
  const cur = buf.lines[buf.row];
  if (buf.col === cur.length) return moveRight(buf);
  return { ...buf, col: wordRight(cur, buf.col) };
}

function toString(buf: TextBuffer): string {
  return buf.lines.join("\n");
}

export interface UseTextInputOpts {
  onSubmit: (text: string) => void;
  onCtrlC: (bufferEmpty: boolean) => void;
  /** Called every time the buffer changes — can be used for hints. */
  onChange?: (buf: TextBuffer) => void;
  /** Return true to signal the key was handled and default behavior should be skipped. */
  onKey?: (key: { code: number; raw: string }) => boolean | void;
}

/**
 * Raw-stdin driven keystroke state machine that owns a multiline buffer and
 * exposes its current state plus reset/insert helpers. Purely stateful — Ink
 * re-renders whenever the buffer changes via setBuffer.
 *
 * Handles: Enter/submit, Backspace, Ctrl+A/E/K/U/W, arrow keys, Option+←/→,
 * Option+B/F, Option+Backspace, Kitty Cmd+Backspace, Shift+Enter (newline),
 * bracketed paste.
 */
export function useTextInput(opts: UseTextInputOpts) {
  const [buffer, setBuffer] = useState<TextBuffer>(EMPTY_BUFFER);
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const { stdin, setRawMode, isRawModeSupported } = useStdin();

  const apply = useCallback((fn: (b: TextBuffer) => TextBuffer) => {
    setBuffer(prev => {
      const next = fn(prev);
      optsRef.current.onChange?.(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setBuffer(EMPTY_BUFFER);
    optsRef.current.onChange?.(EMPTY_BUFFER);
  }, []);

  useEffect(() => {
    if (!isRawModeSupported || !stdin) return;
    setRawMode(true);

    // Enable bracketed paste
    process.stdout.write("\x1b[?2004h");

    let pasteBuffer: string | null = null;

    const onData = (data: Buffer) => {
      const chunk = data.toString("utf8");

      // If we're inside a bracketed paste, accumulate until we see the end marker
      if (pasteBuffer !== null) {
        const endIdx = chunk.indexOf("\x1b[201~");
        if (endIdx === -1) {
          pasteBuffer += chunk;
          return;
        }
        pasteBuffer += chunk.slice(0, endIdx);
        const pasted = pasteBuffer;
        pasteBuffer = null;
        apply(b => insertText(b, pasted));
        // Process any bytes after the end marker
        const after = chunk.slice(endIdx + "\x1b[201~".length);
        if (after.length > 0) handleChunk(after);
        return;
      }

      // Detect start-of-paste marker anywhere in the chunk
      const startIdx = chunk.indexOf("\x1b[200~");
      if (startIdx !== -1) {
        const before = chunk.slice(0, startIdx);
        if (before.length > 0) handleChunk(before);
        const rest = chunk.slice(startIdx + "\x1b[200~".length);
        const endIdx = rest.indexOf("\x1b[201~");
        if (endIdx === -1) {
          pasteBuffer = rest;
          return;
        }
        const pasted = rest.slice(0, endIdx);
        apply(b => insertText(b, pasted));
        const after = rest.slice(endIdx + "\x1b[201~".length);
        if (after.length > 0) handleChunk(after);
        return;
      }

      handleChunk(chunk);
    };

    const handleChunk = (chunk: string) => {
      for (let i = 0; i < chunk.length; i++) {
        const code = chunk.charCodeAt(i);
        const raw = chunk[i];

        // Let custom handlers intercept first
        if (optsRef.current.onKey?.({ code, raw }) === true) continue;

        if (code === CTRL_C) {
          optsRef.current.onCtrlC(bufferRef.current.lines.length === 1 && bufferRef.current.lines[0] === "");
          continue;
        }

        if (code === CTRL_D) {
          // Treat as exit request when buffer empty; otherwise ignore
          const b = bufferRef.current;
          if (b.lines.length === 1 && b.lines[0] === "") {
            optsRef.current.onCtrlC(true);
          }
          continue;
        }

        if (code === CTRL_A) {
          apply(b => ({ ...b, col: 0 }));
          continue;
        }

        if (code === CTRL_E) {
          apply(b => ({ ...b, col: b.lines[b.row].length }));
          continue;
        }

        if (code === CTRL_K) {
          apply(b => {
            const lines = [...b.lines];
            lines[b.row] = lines[b.row].slice(0, b.col);
            return { lines, row: b.row, col: b.col };
          });
          continue;
        }

        if (code === CTRL_U) {
          apply(b => {
            const lines = [...b.lines];
            lines[b.row] = lines[b.row].slice(b.col);
            return { lines, row: b.row, col: 0 };
          });
          continue;
        }

        if (code === CTRL_W) {
          apply(deleteWordLeft);
          continue;
        }

        if (code === ENTER) {
          optsRef.current.onSubmit(toString(bufferRef.current));
          setBuffer(EMPTY_BUFFER);
          optsRef.current.onChange?.(EMPTY_BUFFER);
          continue;
        }

        if (code === BACKSPACE || code === BACKSPACE_ALT) {
          apply(backspace);
          continue;
        }

        if (code === ESC) {
          // Option+Backspace (ESC + DEL)
          if (i + 1 < chunk.length && chunk.charCodeAt(i + 1) === 127) {
            i++;
            apply(deleteWordLeft);
            continue;
          }
          // Option+b / Option+f
          if (i + 1 < chunk.length && chunk[i + 1] === "b") {
            i++;
            apply(moveWordLeft);
            continue;
          }
          if (i + 1 < chunk.length && chunk[i + 1] === "f") {
            i++;
            apply(moveWordRight);
            continue;
          }

          // CSI sequence: ESC [ ... final
          if (i + 1 < chunk.length && chunk[i + 1] === "[") {
            i += 2;
            let seq = "";
            while (i < chunk.length && chunk.charCodeAt(i) < 64) {
              seq += chunk[i];
              i++;
            }
            if (i < chunk.length) {
              const final = chunk[i];
              const isWordMod = seq === "1;3" || seq === "1;5" || seq === "1;9";

              if (final === "D") {
                apply(isWordMod ? moveWordLeft : moveLeft);
              } else if (final === "C") {
                apply(isWordMod ? moveWordRight : moveRight);
              } else if (final === "A") {
                apply(moveUp);
              } else if (final === "B") {
                apply(moveDown);
              } else if (final === "H") {
                apply(b => ({ ...b, col: 0 }));
              } else if (final === "F") {
                apply(b => ({ ...b, col: b.lines[b.row].length }));
              } else if (final === "u") {
                // Kitty keyboard protocol: ESC [ codepoint ; modifier u
                const parts = seq.split(";");
                const codepoint = parseInt(parts[0], 10);
                const mod = parts.length > 1 ? parseInt(parts[1], 10) : 1;
                const hasShift = ((mod - 1) & 1) !== 0;
                const hasCtrl = ((mod - 1) & 4) !== 0;
                const hasCmd = ((mod - 1) & 8) !== 0;

                if (codepoint === 13 && hasShift) {
                  // Shift+Enter → insert newline
                  apply(b => insertText(b, "\n"));
                } else if (codepoint === 127 && (hasCmd || hasCtrl)) {
                  // Cmd/Ctrl+Backspace → delete to line start
                  apply(b => {
                    const lines = [...b.lines];
                    lines[b.row] = lines[b.row].slice(b.col);
                    return { lines, row: b.row, col: 0 };
                  });
                }
              }
            }
            continue;
          }

          // Lone ESC / unknown — ignore
          continue;
        }

        // Printable (and tab)
        if (code >= 32 || code === 9) {
          apply(b => insertText(b, raw));
          continue;
        }
      }
    };

    stdin.on("data", onData);

    return () => {
      stdin.removeListener("data", onData);
      process.stdout.write("\x1b[?2004l");
      setRawMode(false);
    };
  }, [stdin, setRawMode, isRawModeSupported, apply]);

  return {
    buffer,
    reset,
    insert: (text: string) => apply(b => insertText(b, text)),
    isEmpty: buffer.lines.length === 1 && buffer.lines[0] === "",
  };
}
