import Anthropic from "@anthropic-ai/sdk";
import type Database from "libsql";
import { config, useManaged, RAY_PROXY_BASE } from "../config.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { toolDefinitions, executeTool } from "./tools.js";
import { getConversationHistory, saveMessage } from "./memory.js";
import { logToolCall } from "./audit.js";
import { redact, unredact } from "./redactor.js";

const anthropic = new Anthropic(
  useManaged()
    ? { apiKey: config.rayApiKey, baseURL: `${RAY_PROXY_BASE}/ai` }
    : { apiKey: config.anthropicKey }
);

function supportsThinking(model: string): boolean {
  return /sonnet-4|opus-4/i.test(model);
}

export async function handleMessage(
  db: Database.Database,
  userMessage: string
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
  const messages: Anthropic.MessageParam[] = history.map(h => ({
    role: h.role as "user" | "assistant",
    content: redact(h.content),
  }));

  // Ensure last message is the current user message
  if (messages.length === 0 || messages[messages.length - 1].content !== userMessage) {
    messages.push({ role: "user", content: redact(userMessage) });
  }

  // Extended thinking config
  const useThinking = config.thinkingBudget > 0 && supportsThinking(config.model);

  try {
    // Build API params
    const apiParams: any = {
      model: config.model,
      max_tokens: useThinking ? 16000 : 4096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    };

    if (useThinking) {
      apiParams.thinking = {
        type: "enabled",
        budget_tokens: config.thinkingBudget,
      };
    }

    // Initial API call
    let response = await anthropic.messages.create(apiParams);

    // Agentic tool loop
    while (response.stop_reason === "tool_use") {
      // Filter out thinking blocks before adding to messages
      const assistantContent = response.content.filter(
        (b: any) => b.type !== "thinking"
      ) as Anthropic.ContentBlock[];
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === "tool_use") {
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

      response = await anthropic.messages.create(apiParams);
    }

    // Extract text response (filter out thinking blocks), restore PII for display
    const textBlocks = response.content.filter((b: any) => b.type === "text");
    const responseText = unredact(textBlocks.map((b: any) => b.text).join("\n"));

    // Save assistant response
    saveMessage(db, "assistant", responseText);

    return responseText || "I looked into that but couldn't formulate a response. Could you try rephrasing?";
  } catch (error: any) {
    // Log full error internally but don't expose details to user
    const safeMessage = error.status
      ? `API error (${error.status})`
      : "internal error";
    console.error("AI agent error:", safeMessage);
    return "Sorry, I had trouble processing that. Could you try again?";
  }
}
