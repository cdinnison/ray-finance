import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import chalk from "chalk";
import { TOOL_LABELS } from "../../../ai/agent.js";
import { formatDuration } from "../../format.js";

export interface ThinkingState {
  phrase: string;
  progress?: {
    toolName?: string;
    toolCount: number;
    elapsedMs: number;
    phase: "tool" | "responding";
  };
}

export function ThinkingLine({ state }: { state: ThinkingState }) {
  const text = buildText(state);
  return (
    <Box marginTop={1}>
      <Text color="yellow">
        <Spinner type="dots" />
      </Text>
      <Text> {text}</Text>
    </Box>
  );
}

function buildText(state: ThinkingState): string {
  const { phrase, progress } = state;
  if (!progress) return phrase;

  const { phase, toolName, toolCount, elapsedMs } = progress;
  const label = phase === "tool" && toolName
    ? (TOOL_LABELS[toolName] || toolName)
    : "Composing response";

  const suffix = toolCount > 0
    ? chalk.dim(` (${toolCount} ${toolCount === 1 ? "tool" : "tools"}, ${formatDuration(elapsedMs)})`)
    : "";

  return `${label}...${suffix}`;
}
