import Anthropic from "@anthropic-ai/sdk";
import type { Provider, SendMessageParams, NormalizedResponse, NormalizedContentBlock } from "../provider.js";

export function createAnthropicProvider(opts: {
  apiKey: string;
  baseURL?: string;
}): Provider {
  const client = new Anthropic(
    opts.baseURL
      ? { apiKey: opts.apiKey, baseURL: opts.baseURL }
      : { apiKey: opts.apiKey }
  );

  return {
    name: "anthropic",
    supportsThinking: true,

    async sendMessage(params: SendMessageParams): Promise<NormalizedResponse> {
      const apiParams: any = {
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.system,
        tools: params.tools,
        messages: params.messages,
      };

      if (params.thinking) {
        apiParams.thinking = params.thinking;
      }

      const response = await client.messages.create(apiParams, {
        signal: params.signal,
      });

      // Filter thinking blocks and normalize content
      const content: NormalizedContentBlock[] = [];
      for (const block of response.content) {
        if ((block as any).type === "thinking") continue;
        if (block.type === "text") {
          content.push({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          content.push({
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input,
          });
        }
      }

      return {
        content,
        stopReason: response.stop_reason || "end_turn",
        usage: response.usage
          ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
          : undefined,
      };
    },
  };
}
