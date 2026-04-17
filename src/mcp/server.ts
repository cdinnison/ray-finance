import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { toolDefinitions, executeTool } from "../ai/tools.js";
import { getDb, closeAll } from "../db/connection.js";
import { config } from "../config.js";

const MUTATION_TOOLS = new Set([
  "set_budget",
  "delete_budget",
  "set_goal",
  "delete_goal",
  "update_goal_progress",
  "categorize_transaction",
  "label_transaction",
  "add_recat_rule",
  "save_memory",
  "update_context",
]);

function jsonSchemaToZodShape(schema: Record<string, any>): Record<string, z.ZodType> {
  if (!schema || schema.type !== "object") return {};
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const shape: Record<string, z.ZodType> = {};

  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    let field: z.ZodType;
    switch (prop.type) {
      case "string": field = z.string(); break;
      case "number": field = z.number(); break;
      case "boolean": field = z.boolean(); break;
      default: field = z.any();
    }
    if (prop.description) field = field.describe(prop.description);
    if (!required.has(key)) field = field.optional();
    shape[key] = field;
  }

  return shape;
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "ray-finance",
    version: "1.0.0",
  });

  const db = getDb();

  for (const tool of toolDefinitions) {
    if (!config.mcpMutations && MUTATION_TOOLS.has(tool.name)) continue;

    const shape = jsonSchemaToZodShape(tool.input_schema);

    server.tool(
      `ray_${tool.name}`,
      tool.description,
      shape,
      async (params: Record<string, unknown>) => {
        const result = await executeTool(db, tool.name, params);
        return { content: [{ type: "text" as const, text: result }] };
      },
    );
  }

  const transport = new StdioServerTransport();

  const shutdown = () => {
    closeAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
}
