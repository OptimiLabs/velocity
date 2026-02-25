import { Database } from "bun:sqlite";
import path from "path";
import os from "os";
import fs from "fs";
import type { JsonlMessage } from "@/lib/parser/jsonl";

/**
 * Create a minimal mock JSONL message for testing parsers/aggregators.
 */
export function createMockJsonlMessage(
  overrides: Partial<JsonlMessage> = {},
): JsonlMessage {
  return {
    type: "assistant",
    uuid: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: "Hello",
      model: "claude-sonnet-4-5-20250929",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
    ...overrides,
  };
}

/**
 * Create a human (user) message for JSONL.
 */
export function createMockHumanMessage(text: string = "Hello"): JsonlMessage {
  return {
    type: "human",
    uuid: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: {
      role: "user",
      content: text,
    },
  };
}

/**
 * Create an assistant message with tool use blocks.
 */
export function createMockToolUseMessage(
  toolName: string,
  input: Record<string, unknown> = {},
  usage = {
    input_tokens: 200,
    output_tokens: 100,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
): JsonlMessage {
  return {
    type: "assistant",
    uuid: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Using tool..." },
        { type: "tool_use", name: toolName, input },
      ],
      model: "claude-sonnet-4-5-20250929",
      usage,
    },
  };
}

/**
 * Create a temp SQLite database with the full schema for testing.
 * Returns { db, dbPath, cleanup }.
 */
export function createTestDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `test-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");

  // Core tables only (skip memory tables for speed)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      session_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      last_activity_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      slug TEXT,
      first_prompt TEXT,
      summary TEXT,
      message_count INTEGER DEFAULT 0,
      tool_call_count INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      thinking_blocks INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      git_branch TEXT,
      project_path TEXT,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      jsonl_path TEXT NOT NULL,
      tool_usage TEXT DEFAULT '{}',
      model_usage TEXT DEFAULT '{}',
      enriched_tools TEXT DEFAULT '{}',
      session_role TEXT DEFAULT 'standalone',
      tags TEXT DEFAULT '[]',
      parent_session_id TEXT,
      subagent_type TEXT,
      billing_plan TEXT,
      compressed_at TEXT,
      provider TEXT,
      effort_mode TEXT,
      avg_latency_ms REAL DEFAULT 0,
      p50_latency_ms REAL DEFAULT 0,
      p95_latency_ms REAL DEFAULT 0,
      max_latency_ms REAL DEFAULT 0,
      latency_sample_count INTEGER DEFAULT 0,
      session_duration_ms REAL DEFAULT 0,
      pricing_status TEXT DEFAULT 'priced',
      unpriced_tokens INTEGER DEFAULT 0,
      unpriced_messages INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS index_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_modified ON sessions(modified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
  `);

  const cleanup = () => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    // Clean up WAL/SHM files
    for (const suffix of ["-wal", "-shm"]) {
      const f = dbPath + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  };

  return { db, dbPath, cleanup };
}

/**
 * Write an array of JSONL messages to a temp file. Returns the file path.
 */
export function writeTempJsonl(messages: JsonlMessage[]): string {
  const filePath = path.join(
    os.tmpdir(),
    `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
  const content = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
  fs.writeFileSync(filePath, content);
  return filePath;
}
