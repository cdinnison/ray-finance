import { useCallback, useEffect, useRef, useState } from "react";
import type Database from "libsql";
import { handleMessage, AbortedError } from "../../../ai/agent.js";
import type { ProgressCallback } from "../../../ai/agent.js";
import type { ThinkingState } from "../messages/ThinkingLine.js";

const THINKING_PHRASES = [
  "Thinking...",
  "Crunching numbers...",
  "Reviewing your accounts...",
  "Analyzing...",
  "Looking into that...",
  "Pulling up your data...",
  "Checking the numbers...",
  "On it...",
];

function pickPhrase() {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
}

export type AgentEvent =
  | { type: "response"; text: string }
  | { type: "error"; error: unknown }
  | { type: "interrupted" };

interface UseAgentOpts {
  db: Database.Database;
  onEvent: (event: AgentEvent) => void;
}

/**
 * Bridges handleMessage with Ink state. submit() kicks off a run and owns the
 * AbortController; cancel() aborts whatever's in flight. state.thinking is null
 * when idle, a ThinkingState otherwise.
 */
export function useAgent({ db, onEvent }: UseAgentOpts) {
  const [thinking, setThinking] = useState<ThinkingState | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const inflightRef = useRef(false);

  const cancel = useCallback(() => {
    const c = controllerRef.current;
    if (c && !c.signal.aborted) c.abort();
  }, []);

  const submit = useCallback((text: string) => {
    if (inflightRef.current) return; // ignore overlapping submits
    inflightRef.current = true;

    const controller = new AbortController();
    controllerRef.current = controller;
    setThinking({ phrase: pickPhrase() });

    const onProgress: ProgressCallback = ({ phase, toolName, toolCount, elapsedMs }) => {
      setThinking(prev => prev
        ? { ...prev, progress: { phase, toolName, toolCount, elapsedMs } }
        : prev,
      );
    };

    (async () => {
      try {
        const response = await handleMessage(db, text, onProgress, controller.signal);
        if (controller.signal.aborted) {
          onEventRef.current({ type: "interrupted" });
        } else {
          onEventRef.current({ type: "response", text: response });
        }
      } catch (err) {
        if (err instanceof AbortedError || controller.signal.aborted) {
          onEventRef.current({ type: "interrupted" });
        } else {
          onEventRef.current({ type: "error", error: err });
        }
      } finally {
        inflightRef.current = false;
        setThinking(null);
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    })();
  }, [db]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { thinking, submit, cancel, isBusy: thinking !== null };
}
