import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "libsql";
import { migrate } from "../db/schema.js";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
  stepCountIs: vi.fn(() => Symbol("stop-when")),
  tool: (definition: any) => definition,
  jsonSchema: (schema: any) => schema,
}));

vi.mock("../config.js", () => ({
  config: {
    userName: "Anas",
    rayApiKey: "",
    anthropicKey: "",
    model: "claude-sonnet-4-6",
    llmProvider: "openai",
    llmApiKey: "openai-key",
    llmBaseUrl: "",
    llmModel: "gpt-5-mini",
    displayLocale: "en-US",
    displayCurrency: "USD",
    dbPath: "/tmp/ray-test/finance.db",
    thinkingBudget: 0,
  },
  useManaged: () => false,
  RAY_PROXY_BASE: "https://api.rayfinance.app/v1",
}));

vi.mock("./model.js", () => ({
  createSelfHostedModel: vi.fn(() => "mock-model"),
  getSelfHostedProviderOptions: vi.fn(() => undefined),
  getResolvedSelfHostedModelConfig: vi.fn(() => ({ providerLabel: "OpenAI" })),
}));

vi.mock("./system-prompt.js", () => ({
  buildSystemPrompt: vi.fn(() => "You are Ray."),
}));

import { handleMessage } from "./agent.js";

function createTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

describe("handleMessage", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  it("returns a plain response and saves conversation history", async () => {
    const db = createTestDb();
    generateTextMock.mockResolvedValue({ text: "Hello [USER]" });

    const response = await handleMessage(db, "How am I doing?");

    expect(response).toBe("Hello Anas");

    const history = db.prepare(`SELECT role, content FROM conversation_history ORDER BY id`).all() as { role: string; content: string }[];
    expect(history).toEqual([
      { role: "user", content: "How am I doing?" },
      { role: "assistant", content: "Hello Anas" },
    ]);
  });

  it("executes tools through the AI SDK path and logs audit entries", async () => {
    const db = createTestDb();
    db.prepare(`INSERT INTO institutions (item_id, access_token, name, products) VALUES (?, 'manual', ?, '[]')`)
      .run("i1", "Test Bank");
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a1", "i1", "Checking", "depository", 1250);

    generateTextMock.mockImplementation(async (options: any) => {
      const toolResult = await options.tools.get_accounts.execute({});
      options.onStepFinish?.({ toolCalls: [{ toolName: "get_accounts" }] });
      return { text: `Done.\n${toolResult}` };
    });

    const progressEvents: Array<{ phase: string; toolName?: string; toolCount: number; elapsedMs: number }> = [];
    const response = await handleMessage(db, "List my accounts", event => {
      progressEvents.push(event);
    });

    expect(response).toContain("Checking (depository): $1,250.00");
    expect(progressEvents).toEqual([
      { phase: "tool", toolName: "get_accounts", toolCount: 1, elapsedMs: expect.any(Number) },
      { phase: "responding", toolCount: 1, elapsedMs: expect.any(Number) },
    ]);

    const auditRows = db.prepare(`SELECT tool_name, result_summary FROM ai_audit_log`).all() as { tool_name: string; result_summary: string }[];
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].tool_name).toBe("get_accounts");
    expect(auditRows[0].result_summary).toContain("Checking");
  });
});
