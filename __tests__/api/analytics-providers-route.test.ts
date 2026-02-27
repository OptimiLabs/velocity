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
    INSERT INTO projects (id, path, name) VALUES ('p1', '/tmp/p1', 'P1');

    INSERT INTO sessions (
      id, project_id, slug, first_prompt, message_count, tool_call_count,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_cost,
      created_at, modified_at, jsonl_path, provider
    ) VALUES
      (
        'claude-1', 'p1', NULL, NULL, 5, 0,
        100, 50, 20, 10, 0.01,
        '2026-02-20T10:00:00Z', '2026-02-20T10:05:00Z', '/tmp/claude-1.jsonl', 'claude'
      ),
      (
        'codex-1', 'p1', NULL, NULL, 3, 0,
        200, 80, 40, 20, 0.02,
        '2026-02-20T11:00:00Z', '2026-02-20T11:05:00Z', '/tmp/codex-1.jsonl', 'codex'
      ),
      (
        'codex-zero-msg', 'p1', NULL, NULL, 0, 0,
        999, 999, 999, 999, 9.99,
        '2026-02-20T12:00:00Z', '2026-02-20T12:05:00Z', '/tmp/codex-zero.jsonl', 'codex'
      );
  `);
});

afterAll(() => {
  cleanup();
});

describe("GET /api/analytics/providers", () => {
  it("returns provider cache read/write token totals and excludes zero-message sessions", async () => {
    const { GET } = await import("@/app/api/analytics/providers/route");
    const req = new Request(
      "http://localhost/api/analytics/providers?from=2026-02-20&to=2026-02-20",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.byProvider)).toBe(true);

    const claude = data.byProvider.find(
      (row: { provider: string }) => row.provider === "claude",
    );
    const codex = data.byProvider.find(
      (row: { provider: string }) => row.provider === "codex",
    );

    expect(claude).toBeDefined();
    expect(codex).toBeDefined();
    expect(claude.cacheReadTokens).toBe(20);
    expect(claude.cacheWriteTokens).toBe(10);
    expect(codex.cacheReadTokens).toBe(40);
    expect(codex.cacheWriteTokens).toBe(20);
    expect(codex.sessionCount).toBe(1);
  });
});

