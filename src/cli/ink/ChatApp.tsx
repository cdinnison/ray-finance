import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Static, Text, useApp } from "ink";
import chalk from "chalk";
import type Database from "libsql";
import { PromptFrame } from "./PromptFrame.js";
import { ThinkingLine } from "./messages/ThinkingLine.js";
import { UserMessage } from "./messages/UserMessage.js";
import { AssistantMessage } from "./messages/AssistantMessage.js";
import { ErrorMessage } from "./messages/ErrorMessage.js";
import { InterruptedMessage } from "./messages/InterruptedMessage.js";
import { useTextInput } from "./hooks/useTextInput.js";
import { useAgent } from "./hooks/useAgent.js";
import { useCtrlCExit } from "./hooks/useCtrlCExit.js";
import { useFooterText } from "./hooks/useFooterText.js";
import { useBackgroundSync } from "./hooks/useBackgroundSync.js";

type Turn =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "error"; error: unknown; context?: string }
  | { id: string; kind: "interrupted" };

interface Props {
  db: Database.Database;
  /** Auto-kick-off message to send silently on mount (onboarding). */
  onboardingPrompt?: string;
}

let turnSeq = 0;
const nextId = () => `t${++turnSeq}`;

export function ChatApp({ db, onboardingPrompt }: Props) {
  const { exit } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const footerText = useFooterText(db);
  const ctrlC = useCtrlCExit();

  const pushTurn = useCallback((t: Turn) => {
    setTurns(prev => [...prev, t]);
  }, []);

  const { thinking, submit: runAgent, cancel, isBusy } = useAgent({
    db,
    onEvent: (e) => {
      if (e.type === "response") {
        pushTurn({ id: nextId(), kind: "assistant", text: e.text });
      } else if (e.type === "error") {
        pushTurn({ id: nextId(), kind: "error", error: e.error });
      } else if (e.type === "interrupted") {
        pushTurn({ id: nextId(), kind: "interrupted" });
      }
    },
  });

  useBackgroundSync(db);

  const handleSubmit = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (trimmed === "/quit" || trimmed === "/exit" || trimmed === "/q") {
      exit();
      return;
    }

    pushTurn({ id: nextId(), kind: "user", text: trimmed });
    runAgent(trimmed);
  }, [exit, pushTurn, runAgent]);

  const onCtrlCFromInput = useCallback((bufferEmpty: boolean) => {
    const action = ctrlC.trigger({ bufferEmpty, busy: isBusy });
    if (action === "clear-input") {
      textInput.reset();
    } else if (action === "abort") {
      cancel();
    } else if (action === "exit") {
      exit();
    }
    // "arm" → do nothing; hint renders via ctrlC.pending
  }, [ctrlC, isBusy, cancel, exit]);

  const textInput = useTextInput({
    onSubmit: handleSubmit,
    onCtrlC: onCtrlCFromInput,
    onChange: () => {
      if (ctrlC.pending) ctrlC.clear();
    },
  });

  // Auto-onboarding: fire exactly once on mount
  const onboardedRef = useRef(false);
  useEffect(() => {
    if (onboardedRef.current) return;
    onboardedRef.current = true;
    if (onboardingPrompt) runAgent(onboardingPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exitHint = ctrlC.pending
    ? chalk.yellow("  press ctrl+c again to exit")
    : undefined;

  return (
    <Box flexDirection="column">
      <Static items={turns}>
        {(t) => <TurnView key={t.id} turn={t} />}
      </Static>
      {thinking ? <ThinkingLine state={thinking} /> : null}
      {!isBusy ? (
        <PromptFrame
          buffer={textInput.buffer}
          footerText={footerText}
          showCaret={!isBusy}
          banner={exitHint}
        />
      ) : null}
    </Box>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  switch (turn.kind) {
    case "user": return <UserMessage text={turn.text} />;
    case "assistant": return <AssistantMessage text={turn.text} />;
    case "error": return <ErrorMessage error={turn.error} context={turn.context} />;
    case "interrupted": return <InterruptedMessage />;
    default: return <Text />;
  }
}
