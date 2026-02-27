import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/factories";
import type { Database } from "bun:sqlite";

let db: Database;
let cleanup: () => void;

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  ensureIndexed: async () => {},
}));

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  cleanup = testDb.cleanup;

  db.exec(`
    CREATE TABLE IF NOT EXISTS instruction_files (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      token_count INTEGER DEFAULT 0,
      project_path TEXT,
      is_active INTEGER DEFAULT 1,
      provider TEXT DEFAULT 'claude'
    );

    CREATE TABLE IF NOT EXISTS session_instruction_files (
      session_id TEXT NOT NULL,
      instruction_id TEXT NOT NULL,
      detection_method TEXT
    );

    INSERT INTO projects (id, path, name) VALUES
      ('p1', '/tmp/p1', 'P1');

    INSERT INTO sessions (
      id, project_id, slug, first_prompt, message_count, tool_call_count,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_cost,
      created_at, modified_at, jsonl_path, project_path, provider
    ) VALUES
      (
        's-claude', 'p1', NULL, NULL, 5, 0,
        100, 50, 0, 0, 0.01,
        '2026-02-20T10:00:00Z', '2026-02-20T10:05:00Z', '/tmp/s-claude.jsonl',
        '/tmp/p1', 'claude'
      ),
      (
        's-codex', 'p1', NULL, NULL, 5, 0,
        90, 40, 0, 0, 0.01,
        '2026-02-20T11:00:00Z', '2026-02-20T11:05:00Z', '/tmp/s-codex.jsonl',
        '/tmp/p1', 'codex'
      );

    INSERT INTO instruction_files (
      id, file_path, file_type, file_name, token_count, project_path, is_active, provider
    ) VALUES
      (
        'i-claude-used', '/Users/test/.claude/CLAUDE.md', 'CLAUDE.md', 'CLAUDE.md',
        300, NULL, 1, 'claude'
      ),
      (
        'i-claude-unused', '/Users/test/.claude/skills/unused.md', 'skill.md', 'unused.md',
        700, NULL, 1, 'claude'
      ),
      (
        'i-codex-used', '/Users/test/.codex/AGENTS.md', 'agents.md', 'AGENTS.md',
        900, NULL, 1, 'codex'
      );

    INSERT INTO session_instruction_files (session_id, instruction_id, detection_method) VALUES
      ('s-claude', 'i-claude-used', 'hierarchy'),
      ('s-codex', 'i-codex-used', 'hierarchy');
  `);
});

afterAll(() => {
  cleanup();
});

describe("GET /api/analytics/instruction-context", () => {
  it("applies provider scoping to instruction inventory and reports linked totals", async () => {
    const { GET } = await import("@/app/api/analytics/instruction-context/route");
    const req = new Request(
      "http://localhost/api/analytics/instruction-context?from=2026-02-20&to=2026-02-20&provider=claude",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("claude");
    expect(data.totals.totalInstructionFiles).toBe(2);
    expect(data.totals.usedInstructionFiles).toBe(1);
    expect(data.totals.usedInstructionTokens).toBe(300);
    expect(
      data.instructionFiles.some(
        (row: { filePath: string }) => row.filePath.includes(".codex"),
      ),
    ).toBe(false);
  });
});

