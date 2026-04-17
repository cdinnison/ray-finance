import { useCallback, useRef, useState } from "react";

const EXIT_WINDOW_MS = 2000;

/**
 * Two-step exit state machine, Claude-style.
 *
 * - trigger({ bufferEmpty: false }) → caller should clear the input; returns "cleared"
 * - trigger({ bufferEmpty: true, busy: true }) → caller should abort; returns "abort"
 * - trigger({ bufferEmpty: true, busy: false }): first call sets `pending=true`
 *   and returns "arm"; second call within 2s returns "exit".
 */
export function useCtrlCExit() {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPending(false);
  }, []);

  const trigger = useCallback((opts: { bufferEmpty: boolean; busy: boolean }):
    "clear-input" | "abort" | "arm" | "exit" => {
    if (opts.busy) {
      clear();
      return "abort";
    }
    if (!opts.bufferEmpty) {
      clear();
      return "clear-input";
    }
    if (pending) {
      clear();
      return "exit";
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setPending(true);
    timerRef.current = setTimeout(() => {
      setPending(false);
      timerRef.current = null;
    }, EXIT_WINDOW_MS);
    return "arm";
  }, [pending, clear]);

  return { pending, trigger, clear };
}
