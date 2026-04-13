import Anthropic from "@anthropic-ai/sdk";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import type Database from "libsql";
import { config, useManaged, RAY_PROXY_BASE } from "../config.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { createAiSdkToolSet, toolDefinitions } from "./tools.js";
import { getConversationHistory, saveMessage } from "./memory.js";
import { logToolCall } from "./audit.js";
import { redact, unredact } from "./redactor.js";
import { createSelfHostedModel, getResolvedSelfHostedModelConfig, getSelfHostedProviderOptions } from "./model.js";

function getManagedClient() {
  return new Anthropic({ apiKey: config.rayApiKey, baseURL: `${RAY_PROXY_BASE}/ai` });
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

function getErrorStatus(error: any): number | undefined {
  return error?.statusCode ?? error?.status ?? error?.response?.status;
}

function normalizeHistoryMessages(db: Database.Database, userMessage: string): ModelMessage[] {
  const rawHistory = getConversationHistory(db, 30);
  const MAX_HISTORY_CHARS = 24_000;
  let historyChars = 0;
  const history = [];

  for (let i = rawHistory.length - 1; i >= 0; i--) {
    historyChars += rawHistory[i].content.length;
    if (historyChars > MAX_HISTORY_CHARS) break;
    history.unshift(rawHistory[i]);
  }

  const messages: ModelMessage[] = history.map(entry => ({
    role: entry.role as "user" | "assistant",
    content: redact(entry.content),
  }));

  const redactedUserMessage = redact(userMessage);
  if (
    messages.length === 0 ||
    messages[messages.length - 1].role !== "user" ||
    messages[messages.length - 1].content !== redactedUserMessage
  ) {
    messages.push({ role: "user", content: redactedUserMessage });
  }

  return messages;
}

async function handleManagedMessage(
  db: Database.Database,
  userMessage: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const anthropic = getManagedClient();
  const systemPrompt = redact(buildSystemPrompt(db));
  const messages = normalizeHistoryMessages(db, userMessage) as Anthropic.MessageParam[];

  try {
    const apiParams: any = {
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    };

    let response = await anthropic.messages.create(apiParams);
    const startTime = Date.now();
    let toolCount = 0;

    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content.filter(
        (block: any) => block.type !== "thinking",
      ) as Anthropic.ContentBlock[];
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type !== "tool_use") continue;

        toolCount++;
        onProgress?.({
          phase: "tool",
          toolName: block.name,
          toolCount,
          elapsedMs: Date.now() - startTime,
        });

        const { executeTool } = await import("./tools.js");
        const result = await executeTool(db, block.name, block.input);
        logToolCall(db, block.name, block.input, result, response.usage?.output_tokens);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: redact(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
      onProgress?.({
        phase: "responding",
        toolCount,
        elapsedMs: Date.now() - startTime,
      });

      response = await anthropic.messages.create(apiParams);
    }

    const textBlocks = response.content.filter((block: any) => block.type === "text");
    return unredact(textBlocks.map((block: any) => block.text).join("\n"));
  } catch (error: any) {
    const status = getErrorStatus(error);
    if (status === 403) {
      return "Your API key was rejected. This usually means your subscription is inactive. Run `ray billing` to check your payment status, or `ray setup` to reconfigure.";
    }
    if (status === 401) {
      return "Invalid API key. Run `ray setup` to reconfigure your credentials.";
    }
    if (status === 429) {
      return "Rate limited. Wait a moment and try again.";
    }
    const safeMessage = status ? `API error (${status})` : error.message || "internal error";
    console.error("AI error:", safeMessage);
    return "Sorry, I had trouble processing that. Could you try again?";
  }
}

async function handleSelfHostedMessage(
  db: Database.Database,
  userMessage: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const systemPrompt = redact(buildSystemPrompt(db));
  const messages = normalizeHistoryMessages(db, userMessage);
  const startTime = Date.now();
  let toolCount = 0;

  try {
    const result = await generateText({
      model: createSelfHostedModel(),
      system: systemPrompt,
      messages,
      tools: createAiSdkToolSet(db, {
        onToolStart: (toolName, toolInput) => {
          toolCount++;
          onProgress?.({
            phase: "tool",
            toolName,
            toolCount,
            elapsedMs: Date.now() - startTime,
          });
        },
        onToolResult: (toolName, toolInput, toolResult) => {
          logToolCall(db, toolName, toolInput, toolResult);
        },
        transformResult: redact,
      }),
      stopWhen: stepCountIs(10),
      providerOptions: getSelfHostedProviderOptions(),
      onStepFinish: ({ toolCalls }) => {
        if (toolCalls.length === 0 || toolCount === 0) return;
        onProgress?.({
          phase: "responding",
          toolCount,
          elapsedMs: Date.now() - startTime,
        });
      },
    });

    return unredact(
      result.text || "I looked into that but couldn't formulate a response. Could you try rephrasing?",
    );
  } catch (error: any) {
    const status = getErrorStatus(error);
    if (status === 401) {
      return "Invalid LLM credentials. Run `ray setup` to reconfigure your provider.";
    }
    if (status === 403) {
      return "Your LLM request was rejected by the configured provider. Run `ray setup` to verify your credentials and model.";
    }
    if (status === 429) {
      return "Rate limited by your configured LLM provider. Wait a moment and try again.";
    }

    const provider = getResolvedSelfHostedModelConfig().providerLabel;
    const safeMessage = status ? `${provider} API error (${status})` : error.message || "internal error";
    console.error("AI error:", safeMessage);
    return "Sorry, I had trouble processing that. Could you try again?";
  }
}

export async function handleMessage(
  db: Database.Database,
  userMessage: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  saveMessage(db, "user", userMessage);

  const responseText = useManaged()
    ? await handleManagedMessage(db, userMessage, onProgress)
    : await handleSelfHostedMessage(db, userMessage, onProgress);

  saveMessage(db, "assistant", responseText);
  return responseText || "I looked into that but couldn't formulate a response. Could you try rephrasing?";
}
