import type Database from "libsql";

export function getConversationHistory(db: Database.Database, limit = 20): { role: string; content: string; created_at: string }[] {
  return db.prepare(
    `SELECT role, content, created_at FROM conversation_history ORDER BY id DESC LIMIT ?`
  ).all(limit).reverse() as any[];
}

export function saveMessage(db: Database.Database, role: "user" | "assistant", content: string): void {
  db.prepare(
    `INSERT INTO conversation_history (role, content) VALUES (?, ?)`
  ).run(role, content);
}

export function getMemories(db: Database.Database): { id: number; content: string; category: string; created_at: string }[] {
  return db.prepare(`SELECT id, content, category, created_at FROM memories ORDER BY created_at DESC`).all() as any[];
}

export function saveMemory(db: Database.Database, content: string, category = "general"): void {
  db.prepare(`INSERT INTO memories (content, category) VALUES (?, ?)`).run(content, category);
}
