import type Database from "libsql";

export function logToolCall(db: Database.Database, toolName: string, inputParams: any, resultSummary: string, tokensUsed?: number): void {
  db.prepare(
    `INSERT INTO ai_audit_log (tool_name, input_params, result_summary, tokens_used) VALUES (?, ?, ?, ?)`
  ).run(toolName, JSON.stringify(inputParams), resultSummary.slice(0, 500), tokensUsed || null);
}

export function getAuditLog(db: Database.Database, limit = 50): any[] {
  return db.prepare(`SELECT * FROM ai_audit_log ORDER BY id DESC LIMIT ?`).all(limit);
}
