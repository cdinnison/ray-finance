import type Database from "libsql";
import { config, useManaged } from "../config.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { toolDefinitions, executeTool } from "./tools.js";
import { getConversationHistory, saveMessage } from "./memory.js";
import { logToolCall } from "./audit.js";
import { redact, unredact } from "./redactor.js";
import { createProvider } from "./providers/index.js";
import type { NormalizedMessage, NormalizedToolResult, NormalizedContentBlock } from "./provider.js";

const provider = createProvider();

const MAX_TOOL_STEPS = 10;

function supportsThinking(model: string): boolean {
  return /sonnet-4|opus-4/i.test(model);
}

/** Human-readable labels for tool calls shown in the spinner */
export const TOOL_LABELS: Record<string, string> = {
  get_net_worth: "Checking net worth",
  get_accounts: "Reviewing accounts",
  get_transactions: "Looking at transactions",
  get_spending_summary: "Analyzing spending",
  get_budgets: "Reviewing budgets",
  set_budget: "Setting budget",
  get_goals: "Checking goals",
  set_goal: "Setting goal",
  get_score: "Calculating score",
  get_recurring: "Finding recurring charges",
  get_alerts: "Checking alerts",
  save_memory: "Remembering that",
  update_context: "Updating your profile",
};

export type ProgressCallback = (event: {
  phase: "tool" | "responding";
  toolName?: string;
  toolCount: number;
  elapsedMs: number;
}) => void;

/** Thrown by handleMessage when the caller aborts via AbortSignal */
export class AbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortedError";
  }
}

export async function handleMessage(
  db: Database.Database,
  userMessage: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<string> {
  // Save incoming message
  saveMessage(db, "user", userMessage);

  // Load conversation context, truncated to fit token budget
  const rawHistory = getConversationHistory(db, 30);
  const MAX_HISTORY_CHARS = 24_000; // ~6k tokens, leaves room for system prompt + response
  let historyChars = 0;
  const history = [];
  for (let i = rawHistory.length - 1; i >= 0; i--) {
    historyChars += rawHistory[i].content.length;
    if (historyChars > MAX_HISTORY_CHARS) break;
    history.unshift(rawHistory[i]);
  }

  // Build system prompt and redact PII before sending to API
  const systemPrompt = redact(buildSystemPrompt(db));

  // Build messages array from history, redacting PII
  const messages: NormalizedMessage[] = history.map(h => ({
    role: h.role as "user" | "assistant",
    content: redact(h.content),
  }));

  // Ensure last message is the current user message
  if (messages.length === 0 || messages[messages.length - 1].content !== userMessage) {
    messages.push({ role: "user", content: redact(userMessage) });
  }

  // Extended thinking config — only for providers that support it
  const useThinking = config.thinkingBudget > 0
    && provider.supportsThinking
    && supportsThinking(config.model);

  const throwIfAborted = () => {
    if (signal?.aborted) throw new AbortedError();
  };

  try {
    throwIfAborted();

    // Initial API call
    let response = await provider.sendMessage({
      model: config.model,
      maxTokens: useThinking ? 16000 : 4096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
      thinking: useThinking
        ? { type: "enabled", budget_tokens: config.thinkingBudget }
        : undefined,
      signal,
    });

    // Agentic tool loop
    const startTime = Date.now();
    let toolCount = 0;

    while (response.stopReason === "tool_use" && toolCount < MAX_TOOL_STEPS) {
      throwIfAborted();
      messages.push({ role: "assistant", content: response.content });

      const toolResults: NormalizedToolResult[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolCount++;
          onProgress?.({
            phase: "tool",
            toolName: block.name,
            toolCount,
            elapsedMs: Date.now() - startTime,
          });
          const result = await executeTool(db, block.name, block.input);
          logToolCall(db, block.name, block.input, result, response.usage?.output_tokens);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: redact(result),
          });
        }
      }

      messages.push({ role: "user", content: toolResults });

      onProgress?.({
        phase: "responding",
        toolCount,
        elapsedMs: Date.now() - startTime,
      });

      throwIfAborted();

      response = await provider.sendMessage({
        model: config.model,
        maxTokens: useThinking ? 16000 : 4096,
        system: systemPrompt,
        tools: toolDefinitions,
        messages,
        thinking: useThinking
          ? { type: "enabled", budget_tokens: config.thinkingBudget }
          : undefined,
        signal,
      });
    }

    // Extract text response, restore PII for display
    const textBlocks = response.content.filter((b): b is Extract<NormalizedContentBlock, { type: "text" }> => b.type === "text");
    const responseText = unredact(textBlocks.map(b => b.text).join("\n"));

    // Save assistant response
    saveMessage(db, "assistant", responseText);

    return responseText || "I looked into that but couldn't formulate a response. Could you try rephrasing?";
  } catch (error: any) {
    if (error instanceof AbortedError || error?.name === "AbortError" || signal?.aborted) {
      throw new AbortedError();
    }
    if (error.status === 403) {
      if (useManaged()) {
        return "Your API key was rejected. This usually means your subscription is inactive. Run `ray billing` to check your payment status, or `ray setup` to reconfigure.";
      }
      return "Your API key was rejected (403 Forbidden). Run `ray setup` to reconfigure your credentials.";
    }
    if (error.status === 401) {
      return "Invalid API key. Run `ray setup` to reconfigure your credentials.";
    }
    if (error.status === 429) {
      return "Rate limited. Wait a moment and try again.";
    }
    const safeMessage = error.status
      ? `API error (${error.status}): ${error.message || ""}`
      : error.message || "internal error";
    console.error("AI error:", safeMessage);
    return "Sorry, I had trouble processing that. Could you try again?";
  }
}
